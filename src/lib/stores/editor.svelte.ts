import type * as THREE from 'three';

export type EditorPart = {
	id: string;
	name: string;
	object3D: THREE.Object3D; // the actual 3D object in the scene
	CSGHistory?: EditorPart[]; // for CSG operations, keep track of the original parts that were combined/subtracted
	CSGOffset?: THREE.Vector3; // for CSG operations, keep track of the offset applied to the original parts to get the final position
};

class EditorState {
	parts = $state<EditorPart[]>([]);
	selectedIds = $state<string[]>([]);

	addPart(part: EditorPart) {
		this.parts = [...this.parts, part];

		return part;
	}

	removePart(id: string) {
		this.parts = this.parts.filter((p) => p.id !== id);
		this.selectedIds = this.selectedIds.filter((sid) => sid !== id);
	}

	select(id: string) {
		this.selectedIds = [id];
	}

	toggleSelect(id: string) {
		const idx = this.selectedIds.indexOf(id);
		if (idx === -1) {
			this.selectedIds = [...this.selectedIds, id];
		} else {
			this.selectedIds = this.selectedIds.filter((sid) => sid !== id);
		}
	}

	deselectAll() {
		this.selectedIds = [];
	}

	isSelected(id: string): boolean {
		return this.selectedIds.includes(id);
	}

	get selectedParts(): EditorPart[] {
		return this.selectedIds
			.map((id) => this.parts.find((p) => p.id === id))
			.filter((p): p is EditorPart => !!p);
	}

	get firstSelectedPart(): EditorPart | undefined {
		return this.selectedIds.length > 0
			? this.parts.find((p) => p.id === this.selectedIds[0])
			: undefined;
	}
}

export const editorState = new EditorState();
