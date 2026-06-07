import type * as THREE from 'three';

export type EditorNode = {
	id: string;
	name: string;
	parentId?: string;
};

export type PartNode = EditorNode & {
	type: 'part';
	object3D: THREE.Object3D;
	CSGHistory?: PartNode[];
	CSGOffset?: THREE.Vector3;
};

export type ConstraintNode = EditorNode & {
	type: 'constraint';
	partAId: string;
	partBId: string;
	faceA: string;
	faceB: string;
	offsetA: THREE.Vector3;
	offsetB: THREE.Vector3;
	constraintType: string;
	line?: THREE.Line;
	sphereA?: THREE.Mesh;
	sphereB?: THREE.Mesh;
};

export type AnyEditorNode = PartNode | ConstraintNode;

/** @deprecated Use PartNode instead */
export type EditorPart = PartNode;

class EditorState {
	parts = $state<PartNode[]>([]);
	constraints = $state<ConstraintNode[]>([]);
	selectedIds = $state<string[]>([]);
	selectedFaces = $state<Array<{ faceIndex: number; mesh: THREE.Mesh }>>([]);
	// ^ same order as selectedIds

	getNode(id: string): AnyEditorNode | undefined {
		return this.parts.find((p) => p.id === id) ?? this.constraints.find((c) => c.id === id);
	}

	addPart(part: PartNode): PartNode {
		this.parts = [...this.parts, part];
		return part;
	}

	addConstraint(constraint: ConstraintNode): ConstraintNode {
		this.constraints = [...this.constraints, constraint];
		return constraint;
	}

	removeNode(id: string) {
		this.parts = this.parts.filter((p) => p.id !== id);
		this.constraints = this.constraints.filter((c) => c.id !== id);
		this.constraints = this.constraints.filter((c) => c.partAId !== id && c.partBId !== id);
		const removeIdx = this.selectedIds.indexOf(id);
		if (removeIdx !== -1) {
			this.selectedIds = this.selectedIds.filter((_, i) => i !== removeIdx);
			this.selectedFaces = this.selectedFaces.filter((_, i) => i !== removeIdx);
		}
	}

	removePart(id: string) {
		this.removeNode(id);
	}

	select(id: string, faceIndex: number = 0, mesh?: THREE.Mesh) {
		this.selectedIds = [id];
		this.selectedFaces = [{ faceIndex, mesh: mesh! }];
	}

	toggleSelect(id: string, faceIndex: number = 0, mesh?: THREE.Mesh) {
		const idx = this.selectedIds.indexOf(id);
		if (
			idx === -1 ||
			(this.selectedFaces[idx] && this.selectedFaces[idx].faceIndex !== faceIndex)
		) {
			this.selectedFaces = [...this.selectedFaces, { faceIndex, mesh: mesh! }];
			this.selectedIds = [...this.selectedIds, id];
		} else {
			this.selectedIds = this.selectedIds.filter((sid) => sid !== id);
			this.selectedFaces = this.selectedFaces.filter((_, i) => i !== idx);
		}
	}

	deselectAll() {
		this.selectedIds = [];
		this.selectedFaces = [];
	}

	isSelected(id: string): boolean {
		return this.selectedIds.includes(id);
	}

	get selectedNodes(): AnyEditorNode[] {
		return this.selectedIds.map((id) => this.getNode(id)).filter((n): n is AnyEditorNode => !!n);
	}

	get selectedParts(): PartNode[] {
		return this.selectedIds
			.map((id) => this.parts.find((p) => p.id === id))
			.filter((p): p is PartNode => !!p);
	}

	get selectedConstraints(): ConstraintNode[] {
		return this.selectedIds
			.map((id) => this.constraints.find((c) => c.id === id))
			.filter((c): c is ConstraintNode => !!c);
	}

	get firstSelectedPart(): PartNode | undefined {
		if (this.selectedIds.length === 0) return undefined;
		return this.parts.find((p) => p.id === this.selectedIds[0]);
	}

	get firstSelectedNode(): AnyEditorNode | undefined {
		if (this.selectedIds.length === 0) return undefined;
		return this.getNode(this.selectedIds[0]);
	}

	faceFromSelectedPartId(id: string): { faceIndex: number; mesh: THREE.Mesh } | undefined {
		const idx = this.selectedIds.indexOf(id);
		if (idx === -1) return undefined;
		return this.selectedFaces[idx];
	}
}

export const editorState = new EditorState();
