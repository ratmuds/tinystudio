import * as THREE from 'three';
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

export type ModelNode = EditorNode & {
	type: 'model';
	parts: EditorNode[];
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

export type SerializedPart = {
	id: string;
	name: string;
	parentId?: string;
	type: 'part';
	position: { x: number; y: number; z: number };
	rotation: { x: number; y: number; z: number };
	scale: { x: number; y: number; z: number };
	geometryType: string;
	color: number;
};

export type SerializedConstraint = {
	id: string;
	name: string;
	type: 'constraint';
	partAId: string;
	partBId: string;
	faceA: string;
	faceB: string;
	offsetA: { x: number; y: number; z: number };
	offsetB: { x: number; y: number; z: number };
	constraintType: string;
};

export type SerializedScript = {
	id: string;
	name: string;
	parentId?: string;
	type: 'script';
	code: string;
};

export type SerializedCamera = {
	id: string;
	name: string;
	parentId?: string;
	type: 'camera';
	fov: number;
	near: number;
	far: number;
	position: { x: number; y: number; z: number };
	rotation: { x: number; y: number; z: number };
};

export type SerializedEditorState = {
	name: string;
	type: 'scene' | 'model' | 'texture' | 'script';
	icon: string;
	editorId: string;
	parts: SerializedPart[];
	constraints: SerializedConstraint[];
	scripts: SerializedScript[];
	cameras: SerializedCamera[];
	selectedIds: string[];
};

function createGeometryFromType(type: string): THREE.BufferGeometry {
	switch (type) {
		case 'BoxGeometry':
			return new THREE.BoxGeometry(1, 1, 1);
		case 'SphereGeometry':
			return new THREE.SphereGeometry(0.5, 32, 16);
		case 'CylinderGeometry':
			return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
		case 'ConeGeometry':
			return new THREE.ConeGeometry(0.5, 1, 32);
		case 'TorusGeometry':
			return new THREE.TorusGeometry(0.5, 0.2, 16, 100);
		case 'PlaneGeometry':
			return new THREE.PlaneGeometry(1, 1);
		default:
			return new THREE.BoxGeometry(1, 1, 1);
	}
}

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
		try {
			const data = JSON.stringify(this.tabs.map((t) => t.serialize()));
			localStorage.setItem(`PROJECT_DATA_${this.projectName}`, data);
			console.log(`Project "${this.projectName}" saved to localStorage.`);
		} catch (e) {
			console.error(`Failed to save project "${this.projectName}":`, e);
		}
	}

	async loadProject(name: string) {
		const data = localStorage.getItem(`PROJECT_DATA_${name}`);
		if (!data) {
			console.warn(`No project found in localStorage with name "${name}".`);
			return;
		}

		this.enabled = false;
		try {
			const raw = JSON.parse(data);
			if (!Array.isArray(raw)) {
				console.error(`Failed to load project "${name}": data is not an array.`);
				return;
			}

			// Deserialize each saved tab into the matching existing tab, so any
			// `const editorState = editor.tabs.find(...)` reference stays valid.
			for (const entry of raw) {
				if (!entry || typeof entry !== 'object') continue;
				const existing = this.tabs.find((t) => t.type === entry.type);
				if (!existing) continue;
				existing.deserialize(entry as SerializedEditorState);
			}

			this.projectName = name;
			console.log(`Project "${name}" loaded from localStorage.`);
		} catch (e) {
			console.error(`Failed to load project "${name}":`, e);
		} finally {
			this.enabled = true;
		}
	}
}

export class EditorState {
	name = $state('Untitled');
	type = $state<'scene' | 'model' | 'texture' | 'script'>('model');
	icon = $state('cube');
	editorId = crypto.randomUUID();

	nodes: AnyEditorNode[] = $state([]);
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

	/** Build a plain-object snapshot of this tab suitable for JSON.stringify. */
	serialize(): SerializedEditorState {
		return {
			name: this.name,
			type: this.type,
			icon: this.icon,
			editorId: this.editorId,
			parts: this.parts.map((p) => {
				const obj = p.object3D as THREE.Object3D & {
					geometry?: { type?: string };
					material?: { color?: { getHex?: () => number } };
				};
				return {
					id: p.id,
					name: p.name,
					parentId: p.parentId,
					type: 'part' as const,
					position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
					rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
					scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
					geometryType: obj.geometry?.type ?? 'BoxGeometry',
					color: obj.material?.color?.getHex?.() ?? 0xa0a0a0
				};
			}),
			constraints: this.constraints.map((c) => ({
				id: c.id,
				name: c.name,
				type: 'constraint' as const,
				partAId: c.partAId,
				partBId: c.partBId,
				faceA: c.faceA,
				faceB: c.faceB,
				offsetA: { x: c.offsetA.x, y: c.offsetA.y, z: c.offsetA.z },
				offsetB: { x: c.offsetB.x, y: c.offsetB.y, z: c.offsetB.z },
				constraintType: c.constraintType
			})),
			scripts: this.scripts.map((s) => ({
				id: s.id,
				name: s.name,
				parentId: s.parentId,
				type: 'script' as const,
				code: s.code
			})),
			cameras: this.cameras.map((c) => ({
				id: c.id,
				name: c.name,
				parentId: c.parentId,
				type: 'camera' as const,
				fov: c.fov,
				near: c.near,
				far: c.far,
				position: {
					x: c.perspective.position.x,
					y: c.perspective.position.y,
					z: c.perspective.position.z
				},
				rotation: {
					x: c.perspective.rotation.x,
					y: c.perspective.rotation.y,
					z: c.perspective.rotation.z
				}
			})),
			selectedIds: [...this.selectedIds]
		};
	}

	/** Replace this tab's state from a previously-serialized snapshot. */
	deserialize(data: SerializedEditorState) {
		this.name = data.name;
		this.type = data.type;
		this.icon = data.icon;
		this.editorId = data.editorId;

		this.parts = data.parts.map((p) => {
			const geometry = createGeometryFromType(p.geometryType);
			const material = new THREE.MeshStandardMaterial({ color: p.color });
			const mesh = new THREE.Mesh(geometry, material);
			mesh.position.set(p.position.x, p.position.y, p.position.z);
			mesh.rotation.set(p.rotation.x, p.rotation.y, p.rotation.z);
			mesh.scale.set(p.scale.x, p.scale.y, p.scale.z);
			mesh.userData.partId = p.id;
			mesh.name = p.name;

			return {
				id: p.id,
				name: p.name,
				parentId: p.parentId,
				type: 'part',
				object3D: mesh,
				materialMap: new Map<number, THREE.Material>([[0, material]])
			} as PartNode;
		});

		this.constraints = data.constraints.map(
			(c) =>
				({
					id: c.id,
					name: c.name,
					type: 'constraint',
					partAId: c.partAId,
					partBId: c.partBId,
					faceA: c.faceA,
					faceB: c.faceB,
					offsetA: new THREE.Vector3(c.offsetA.x, c.offsetA.y, c.offsetA.z),
					offsetB: new THREE.Vector3(c.offsetB.x, c.offsetB.y, c.offsetB.z),
					constraintType: c.constraintType
				}) as ConstraintNode
		);

		this.scripts = data.scripts.map(
			(s) =>
				({
					id: s.id,
					name: s.name,
					parentId: s.parentId,
					type: 'script',
					code: s.code
				}) as ScriptNode
		);

		this.cameras = data.cameras.map((c) => {
			const perspective = new THREE.PerspectiveCamera(c.fov, 1, c.near, c.far);
			perspective.position.set(c.position.x, c.position.y, c.position.z);
			perspective.rotation.set(c.rotation.x, c.rotation.y, c.rotation.z);
			return {
				id: c.id,
				name: c.name,
				parentId: c.parentId,
				type: 'camera',
				perspective,
				fov: c.fov,
				near: c.near,
				far: c.far
			} as CameraNode;
		});

		this.selectedIds = [...data.selectedIds];
		this.selectedFaces = [];
		this.undoStack = [];
		this.redoStack = [];
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
