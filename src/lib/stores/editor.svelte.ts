import type * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

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
	rawGeometry?: THREE.BufferGeometry;
	materialMap?: Map<number, THREE.Material>;

	// Play Testing Variables
	physicsBody?: RAPIER.RigidBody;
	physicsCollider?: RAPIER.Collider;
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

export type ScriptNode = EditorNode & {
	type: 'script';
	code: string;
};

export type CameraNode = EditorNode & {
	type: 'camera';
	perspective: THREE.PerspectiveCamera;
	fov: number;
	near: number;
	far: number;
};

export type AnyEditorNode = PartNode | ConstraintNode | ScriptNode | CameraNode;

/** Node types that participate in the nested tree (anything except constraints, which are edges). */
export type TreeNode = PartNode | ScriptNode | CameraNode;
export type TreeNodeType = TreeNode['type'];

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

export class Model {
	id = crypto.randomUUID();
	name = 'Model';
	parts: PartNode[] = [];
	constraints: ConstraintNode[] = [];
}

export class Texture {
	id = crypto.randomUUID();
	name = 'Texture';
	imageData: string = '';
	pixels: string[][] = [];
}

class GameAssets {
	models = $state<Model[]>([]);
	textures = $state<Texture[]>([]);

	addModel(model: Model) {
		this.models = [...this.models, model];
	}

	addTexture(texture: Texture) {
		this.textures = [...this.textures, texture];
	}

	getModel(id: string): Model | undefined {
		return this.models.find((m) => m.id === id);
	}

	getTexture(id: string): Texture | undefined {
		return this.textures.find((t) => t.id === id);
	}

	removeModel(id: string) {
		this.models = this.models.filter((m) => m.id !== id);
	}

	removeTexture(id: string) {
		this.textures = this.textures.filter((t) => t.id !== id);
	}

	updateTexture(updated: Texture) {
		this.textures = this.textures.map((t) => (t.id === updated.id ? updated : t));
	}
}

export const playTest = $state({
	active: false,

	scene: null as THREE.Scene | null,
	camera: null as THREE.PerspectiveCamera | null,

	physicsWorld: null as RAPIER.World | null,
	physicsGravity: new RAPIER.Vector3(0, -9.81, 0),

	parts: [] as PartNode[]
});

class Editor {
	projectName = $state('First Testing Project');
	tabs: EditorState[] = $state([]);
	activeTabIndex = $state(0);
	enabled = $state(true);

	constructor() {
		const sceneTab = new EditorState();
		sceneTab.name = 'Scene';
		sceneTab.type = 'scene';
		this.tabs = [sceneTab];

		const modelTab = new EditorState();
		modelTab.name = 'Model';
		modelTab.type = 'model';
		this.tabs = [...this.tabs, modelTab];

		const textureTab = new EditorState();
		textureTab.name = 'Texture';
		textureTab.type = 'texture';
		this.tabs = [...this.tabs, textureTab];

		const scriptTab = new EditorState();
		scriptTab.name = 'Script';
		scriptTab.type = 'script';
		this.tabs = [...this.tabs, scriptTab];
	}

	get activeTab(): EditorState {
		return this.tabs[this.activeTabIndex];
	}

	switchTab(type: 'scene' | 'model' | 'texture' | 'script') {
		const idx = this.tabs.findIndex((t) => t.type === type);
		if (idx !== -1) this.activeTabIndex = idx;
	}

	addTab(tab: EditorState) {
		this.tabs = [...this.tabs, tab];
	}

	closeTab(index: number) {
		if (index < 0 || index >= this.tabs.length) return;
		this.tabs = this.tabs.filter((_, i) => i !== index);
		if (this.activeTabIndex >= this.tabs.length) {
			this.activeTabIndex = this.tabs.length - 1;
		}
	}

	togglePlayTest = () => {
		playTest.active = !playTest.active;
		console.log(`Play test ${playTest.active ? 'started' : 'stopped'}`);
	};

	get isPlayTestActive(): boolean {
		return playTest.active;
	}

	saveProject() {
		const data = JSON.stringify(this.tabs);

		// Save to localStorage
		localStorage.setItem(`PROJECT_DATA_${this.projectName}`, data);
		console.log(`Project "${this.projectName}" saved to localStorage.`);
	}

	async loadProject(name: string) {
		this.enabled = false;

		// Wait for a second
		await new Promise((resolve) => setTimeout(resolve, 1000));

		const data = localStorage.getItem(`PROJECT_DATA_${name}`);
		if (data) {
			try {
				this.tabs = JSON.parse(data);
				this.projectName = name;

				console.log(`Project "${name}" loaded from localStorage.`);

				await new Promise((resolve) => setTimeout(resolve, 1000));

				this.enabled = true;
			} catch (e) {
				console.error(`Failed to load project "${name}":`, e);
			}
		} else {
			console.warn(`No project found in localStorage with name "${name}".`);
		}
	}
}

export class EditorState {
	name = $state('Untitled');
	type = $state<'scene' | 'model' | 'texture' | 'script'>('model');
	icon = $state('cube');
	editorId = crypto.randomUUID();

	parts = $state<PartNode[]>([]);
	constraints = $state<ConstraintNode[]>([]);
	scripts = $state<ScriptNode[]>([]);
	cameras = $state<CameraNode[]>([]);
	selectedIds = $state<string[]>([]);
	selectedFaces = $state<Array<{ faceIndex: number; mesh: THREE.Mesh }>>([]);
	// ^ same order as selectedIds (multiple duplicate IDs will be in selectedIds if multiple faces of the same part are selected)

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
		return (
			this.parts.find((p) => p.id === id) ??
			this.constraints.find((c) => c.id === id) ??
			this.scripts.find((s) => s.id === id) ??
			this.cameras.find((c) => c.id === id)
		);
	}

	/** Returns all tree-participating nodes (parts, scripts, cameras) flattened. */
	get allTreeNodes(): TreeNode[] {
		return [...this.parts, ...this.scripts, ...this.cameras];
	}

	updateNode(updated: AnyEditorNode) {
		if (updated.type === 'part') {
			this.parts = this.parts.map((p) => (p.id === updated.id ? updated : p));
		} else if (updated.type === 'constraint') {
			this.constraints = this.constraints.map((c) => (c.id === updated.id ? updated : c));
		} else if (updated.type === 'script') {
			this.scripts = this.scripts.map((s) => (s.id === updated.id ? updated : s));
		} else if (updated.type === 'camera') {
			this.cameras = this.cameras.map((c) => (c.id === updated.id ? updated : c));
		}
	}

	addPart(part: PartNode): PartNode {
		this.parts = [...this.parts, part];
		return part;
	}

	addConstraint(constraint: ConstraintNode): ConstraintNode {
		this.constraints = [...this.constraints, constraint];
		return constraint;
	}

	addScript(script: ScriptNode): ScriptNode {
		this.scripts = [...this.scripts, script];
		return script;
	}

	addCamera(camera: CameraNode): CameraNode {
		this.cameras = [...this.cameras, camera];
		return camera;
	}

	removeNode(id: string) {
		this.parts = this.parts.filter((p) => p.id !== id);
		this.constraints = this.constraints.filter((c) => c.id !== id);
		this.scripts = this.scripts.filter((s) => s.id !== id);
		this.cameras = this.cameras.filter((c) => c.id !== id);
		this.constraints = this.constraints.filter((c) => c.partAId !== id && c.partBId !== id);
		// Reparent any children of the removed node to the removed node's parent
		const removed = this.getNode(id);
		const newParent = removed?.parentId;
		this.parts = this.parts.map((p) => (p.parentId === id ? { ...p, parentId: newParent } : p));
		this.scripts = this.scripts.map((s) => (s.parentId === id ? { ...s, parentId: newParent } : s));
		this.cameras = this.cameras.map((c) => (c.parentId === id ? { ...c, parentId: newParent } : c));
		const removeIdx = this.selectedIds.indexOf(id);
		if (removeIdx !== -1) {
			this.selectedIds = this.selectedIds.filter((_, i) => i !== removeIdx);
			this.selectedFaces = this.selectedFaces.filter((_, i) => i !== removeIdx);
		}
	}

	/** Returns the immediate tree-children (parts, scripts, cameras) of the given parent. */
	getChildren(parentId: string | undefined): TreeNode[] {
		return this.allTreeNodes.filter((n) => n.parentId === parentId);
	}

	/** Returns the full list of descendant ids of a node, recursively. */
	getDescendantIds(id: string): string[] {
		const out: string[] = [];
		const stack = [id];
		while (stack.length) {
			const current = stack.pop()!;
			const kids = this.getChildren(current);
			for (const k of kids) {
				out.push(k.id);
				stack.push(k.id);
			}
		}
		return out;
	}

	/**
	 * Reparent a tree node. Prevents cycles (cannot reparent a node into one of its own descendants)
	 * and silently no-ops on invalid input.
	 */
	reparent(id: string, newParentId: string | undefined): boolean {
		if (id === newParentId) return false;
		if (newParentId !== undefined && this.getDescendantIds(id).includes(newParentId)) return false;
		const node = this.getNode(id);
		if (!node || node.type === 'constraint') return false;
		if ((node as TreeNode).parentId === newParentId) return false;

		const update = <T extends TreeNode>(arr: T[]): T[] =>
			arr.map((n) => (n.id === id ? ({ ...n, parentId: newParentId } as T) : n));
		this.parts = update(this.parts);
		this.scripts = update(this.scripts);
		this.cameras = update(this.cameras);
		return true;
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

export const editor = new Editor();

export const editorState: EditorState = new Proxy({} as EditorState, {
	get(_, prop, receiver) {
		const target = editor.activeTab;
		if (!target) {
			if (prop === 'parts') return [];
			if (prop === 'constraints') return [];
			if (prop === 'selectedIds') return [];
			if (prop === 'selectedFaces') return [];
			if (prop === 'selectedParts') return [];
			if (prop === 'selectedNodes') return [];
			return undefined;
		}
		const value = Reflect.get(target, prop, target);
		if (typeof value === 'function') {
			return value.bind(target);
		}
		return value;
	},
	set(_, prop, value) {
		const target = editor.activeTab;
		if (!target) return false;
		return Reflect.set(target, prop, value, target);
	},
	has(_, prop) {
		const target = editor.activeTab;
		if (!target) return false;
		return Reflect.has(target, prop);
	}
});

export const gameAssets = new GameAssets();
