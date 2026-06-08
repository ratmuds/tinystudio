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

type PartSnapshot = {
	id: string;
	name: string;
	position: { x: number; y: number; z: number };
	rotation: { x: number; y: number; z: number };
	scale: { x: number; y: number; z: number };
};

type UndoSnapshot = {
	parts: PartSnapshot[];
	selectedIds: string[];
};

type ClipboardEntry = {
	name: string;
	position: { x: number; y: number; z: number };
	rotation: { x: number; y: number; z: number };
	scale: { x: number; y: number; z: number };
	geometryType: string;
};

class EditorState {
	parts = $state<PartNode[]>([]);
	constraints = $state<ConstraintNode[]>([]);
	selectedIds = $state<string[]>([]);
	selectedFaces = $state<Array<{ faceIndex: number; mesh: THREE.Mesh }>>([]);
	// ^ same order as selectedIds

	// Undo/Redo
	private undoStack: UndoSnapshot[] = $state([]);
	private redoStack: UndoSnapshot[] = $state([]);
	private maxHistory = 50;

	// Clipboard
	private clipboard: ClipboardEntry[] = $state([]);

	get canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	get canRedo(): boolean {
		return this.redoStack.length > 0;
	}

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

	private takeSnapshot(): UndoSnapshot {
		return {
			parts: this.parts.map((p) => ({
				id: p.id,
				name: p.name,
				position: { x: p.object3D.position.x, y: p.object3D.position.y, z: p.object3D.position.z },
				rotation: { x: p.object3D.rotation.x, y: p.object3D.rotation.y, z: p.object3D.rotation.z },
				scale: { x: p.object3D.scale.x, y: p.object3D.scale.y, z: p.object3D.scale.z }
			})),
			selectedIds: [...this.selectedIds]
		};
	}

	pushUndo() {
		const snap = this.takeSnapshot();
		this.undoStack = [...this.undoStack, snap];
		if (this.undoStack.length > this.maxHistory) {
			this.undoStack = this.undoStack.slice(this.undoStack.length - this.maxHistory);
		}
		this.redoStack = [];
	}

	undo() {
		if (this.undoStack.length === 0) return;
		const current = this.takeSnapshot();
		this.redoStack = [...this.redoStack, current];
		const snap = this.undoStack[this.undoStack.length - 1];
		this.undoStack = this.undoStack.slice(0, -1);
		this.restoreSnapshot(snap);
	}

	redo() {
		if (this.redoStack.length === 0) return;
		const current = this.takeSnapshot();
		this.undoStack = [...this.undoStack, current];
		const snap = this.redoStack[this.redoStack.length - 1];
		this.redoStack = this.redoStack.slice(0, -1);
		this.restoreSnapshot(snap);
	}

	private restoreSnapshot(snap: UndoSnapshot) {
		for (const ps of snap.parts) {
			const part = this.parts.find((p) => p.id === ps.id);
			if (part) {
				part.object3D.position.set(ps.position.x, ps.position.y, ps.position.z);
				part.object3D.rotation.set(ps.rotation.x, ps.rotation.y, ps.rotation.z);
				part.object3D.scale.set(ps.scale.x, ps.scale.y, ps.scale.z);
				part.name = ps.name;
			}
		}
		this.selectedIds = snap.selectedIds.filter((id) => this.parts.some((p) => p.id === id));
		this.selectedFaces = this.selectedIds.map(() => ({ faceIndex: 0, mesh: null! }));
	}

	copySelected() {
		this.clipboard = this.selectedParts.map((p) => ({
			name: p.name,
			position: { x: p.object3D.position.x, y: p.object3D.position.y, z: p.object3D.position.z },
			rotation: { x: p.object3D.rotation.x, y: p.object3D.rotation.y, z: p.object3D.rotation.z },
			scale: { x: p.object3D.scale.x, y: p.object3D.scale.y, z: p.object3D.scale.z },
			geometryType: (p.object3D as any).geometry?.type ?? 'BoxGeometry'
		}));
	}

	cutSelected() {
		this.copySelected();
		this.pushUndo();
		for (const id of [...this.selectedIds]) {
			const part = this.parts.find((p) => p.id === id);
			if (part && part.object3D.parent) {
				part.object3D.parent.remove(part.object3D);
			}
			this.removePart(id);
		}
	}

	get hasClipboard(): boolean {
		return this.clipboard.length > 0;
	}

	getClipboardEntries(): ClipboardEntry[] {
		return this.clipboard;
	}
}

export const editorState = new EditorState();
