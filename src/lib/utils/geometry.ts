import * as THREE from "three";

export type Vec3 = { x: number; y: number; z: number };

export type CustomGeometry = { positions: number[]; index: number[] | null };

/**
 * Creates a Three.js BufferGeometry based on the geometry type and size.
 * @param geomType - The type of geometry ("sphere", "cylinder", or "box")
 * @param size - The dimensions of the geometry
 * @param customGeometry - Optional serialized geometry (positions + index). When
 *   present it overrides the primitive geometry types entirely (used for CSG results).
 * @returns A Three.js BufferGeometry instance
 */
export function createGeometry(
    geomType: string,
    size: Vec3,
    customGeometry?: CustomGeometry | null,
): THREE.BufferGeometry {
    if (customGeometry && customGeometry.positions.length > 0) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(customGeometry.positions, 3),
        );
        if (customGeometry.index && customGeometry.index.length > 0) {
            geometry.setIndex(customGeometry.index);
        }
        geometry.computeVertexNormals();
        return geometry;
    }

    switch (geomType) {
        case "sphere":
            return new THREE.SphereGeometry(size.x / 2);
        case "cylinder":
            return new THREE.CylinderGeometry(size.x / 2, size.x / 2, size.y);
        default:
            return new THREE.BoxGeometry(size.x, size.y, size.z);
    }
}

/**
 * Creates a Three.js Mesh with standard material and shadow settings.
 * @param geometry - The geometry for the mesh
 * @param color - The color for the material (hex number or string)
 * @param entityId - Optional entity ID to tag the mesh with
 * @returns A configured Three.js Mesh
 */
export function createMesh(
    geometry: THREE.BufferGeometry,
    color: number | string,
    entityId?: string,
): THREE.Mesh {
    const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (entityId) {
        mesh.userData.entityId = entityId;
    }
    return mesh;
}

/**
 * Sets position, rotation, and scale on a Three.js Object3D from Vec3 values.
 * @param object - The Three.js object to transform
 * @param position - Position values
 * @param rotation - Rotation values (Euler angles in radians)
 * @param scale - Scale values
 */
export function applyTransform(
    object: THREE.Object3D,
    position: Vec3,
    rotation: Vec3,
    scale: Vec3,
): void {
    object.position.set(position.x, position.y, position.z);
    object.rotation.set(rotation.x, rotation.y, rotation.z);
    object.scale.set(scale.x, scale.y, scale.z);
}
