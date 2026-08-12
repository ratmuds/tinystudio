import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import Module from "manifold-3d";

export type CSGOperation = "union" | "subtract";

export interface CSGResult {
    customGeometry: { positions: number[]; index: number[] | null };
    color: number;
}

let initPromise: Promise<void> | null = null;
let ManifoldClass: any = null;
let ManifoldMeshClass: any = null;
let nextManifoldID = 1;

/**
 * Lazily instantiates the manifold-3d WASM module (a singleton) and exposes
 * the Manifold / Mesh classes. Subsequent calls reuse the same instance.
 */
function ensureManifold(): Promise<void> {
    if (ManifoldClass) return Promise.resolve();
    if (!initPromise) {
        initPromise = (async () => {
            const wasm = await Module();
            wasm.setup();
            ManifoldClass = wasm.Manifold;
            ManifoldMeshClass = wasm.Mesh;
        })();
    }
    return initPromise;
}

/**
 * Converts a THREE.BufferGeometry into a manifold Mesh (triangle soup) so it
 * can be passed into a Manifold constructor for CSG operations.
 */
function geometryToManifoldMesh(
    geometry: THREE.BufferGeometry,
    id: number,
): any {
    const vertProperties = new Float32Array(geometry.attributes.position.array);
    const numVert = geometry.attributes.position.count;
    let triVerts: Uint32Array;
    if (geometry.index != null) {
        triVerts = new Uint32Array(geometry.index.array);
    } else {
        triVerts = new Uint32Array(Array.from({ length: numVert }, (_, i) => i));
    }
    const mesh = new ManifoldMeshClass({
        numProp: 3,
        vertProperties,
        triVerts,
        runIndex: new Uint32Array([0]),
        runOriginalID: new Uint32Array([id]),
    });
    mesh.merge();
    return mesh;
}

/**
 * Builds a Manifold from an arbitrary THREE.Object3D. The object's world
 * transform is baked into the geometry so CSG happens in world/model space.
 */
function objectToManifold(object: THREE.Object3D): any {
    object.updateWorldMatrix(true, false);

    let geometry: THREE.BufferGeometry;
    if (object instanceof THREE.Mesh) {
        geometry = object.geometry.clone();
        geometry.applyMatrix4(object.matrixWorld);
    } else {
        const geometries: THREE.BufferGeometry[] = [];
        object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                const cloned = child.geometry.clone();
                cloned.applyMatrix4(child.matrixWorld);
                geometries.push(cloned);
            }
        });
        if (geometries.length === 0) throw new Error("No mesh geometry found");
        geometry =
            geometries.length === 1
                ? geometries[0]
                : BufferGeometryUtils.mergeGeometries(geometries);
    }

    const id = nextManifoldID++;
    const manifoldMesh = geometryToManifoldMesh(geometry, id);
    return new ManifoldClass(manifoldMesh);
}

/**
 * Performs a CSG operation on the given meshes.
 *
 * - `union` folds all meshes together with a boolean union.
 * - `subtract` subtracts every mesh after the first from the first mesh.
 *
 * Each mesh's world transform is baked into the result. Returns a serialized
 * BufferGeometry (positions + index) and the color of the first input mesh,
 * ready to be stored on a new entity's Mesh component.
 */
export async function performCSG(
    operation: CSGOperation,
    meshes: THREE.Mesh[],
): Promise<CSGResult> {
    await ensureManifold();
    if (meshes.length < 2) {
        throw new Error("CSG requires at least 2 meshes");
    }

    const manifolds = meshes.map((m) => objectToManifold(m));

    let resultManifold = manifolds[0];
    for (let i = 1; i < manifolds.length; i++) {
        resultManifold =
            operation === "union"
                ? ManifoldClass.union(resultManifold, manifolds[i])
                : ManifoldClass.difference(resultManifold, manifolds[i]);
    }

    const resultMesh = resultManifold.getMesh();

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(resultMesh.vertProperties, 3),
    );
    geometry.setIndex(new THREE.BufferAttribute(resultMesh.triVerts, 1));

    // Merge duplicated vertices (produced by manifold) and compute normals.
    const merged = BufferGeometryUtils.mergeVertices(geometry, 0.0001);
    merged.computeVertexNormals();

    // Recenter the geometry so the new entity sits at its own origin.
    merged.computeBoundingBox();
    const center = new THREE.Vector3();
    merged.boundingBox!.getCenter(center);
    merged.translate(-center.x, -center.y, -center.z);

    const positions = Array.from(
        merged.attributes.position.array as Float32Array,
    );
    const index = merged.index
        ? Array.from(merged.index.array as Uint32Array)
        : null;

    geometry.dispose();

    const mat = meshes[0].material as
        | THREE.MeshStandardMaterial
        | THREE.Material[];
    const color = (
        Array.isArray(mat) ? mat[0] : mat
    ) as THREE.MeshStandardMaterial;

    return {
        customGeometry: { positions, index },
        color: color.color.getHex(),
    };
}
