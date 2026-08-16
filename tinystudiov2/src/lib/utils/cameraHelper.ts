import * as THREE from "three";
import type { Entity } from "$lib/stores/ecs.svelte";

const BODY_SIZE = 0.15;

export type CameraHelperEntry = {
    group: THREE.Group;
    dummy: THREE.PerspectiveCamera;
    helper: THREE.CameraHelper;
};

/**
 * Creates a debug representation of a camera entity for the editor viewports:
 * a wireframe frustum (`THREE.CameraHelper`) plus a small pickable body, all
 * inside a `group` tagged with the entity id so the Renderer's selection and
 * TransformControls gizmo work on it out of the box.
 */
export function createCameraHelper(
    entity: Entity,
    scene: THREE.Scene,
): CameraHelperEntry | null {
    const transformComp = entity.components.find((c) => c.name === "Transform");
    const cameraComp = entity.components.find((c) => c.name === "Camera");
    if (!transformComp || !cameraComp) return null;

    const group = new THREE.Group();

    const dummy = new THREE.PerspectiveCamera(75, 1, 0.1, 10);
    const helper = new THREE.CameraHelper(dummy);
    group.add(helper);

    // Small body so the camera is easy to pick/see in the viewport.
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(BODY_SIZE, BODY_SIZE, BODY_SIZE),
        new THREE.MeshBasicMaterial({ color: 0x22ffaa }),
    );
    group.add(body);

    group.userData.entityId = entity.id;
    scene.add(group);

    const entry = { group, dummy, helper };
    syncCameraHelper(entry, entity);
    return entry;
}

/** Applies the entity's Transform + fov to the camera helper. */
export function syncCameraHelper(
    entry: CameraHelperEntry,
    entity: Entity,
): void {
    const transformComp = entity.components.find((c) => c.name === "Transform");
    const cameraComp = entity.components.find((c) => c.name === "Camera");
    if (!transformComp || !cameraComp) return;

    const pos = (transformComp.data.position.value ?? {
        x: 0,
        y: 0,
        z: 0,
    }) as { x: number; y: number; z: number };
    const rot = (transformComp.data.rotation.value ?? {
        x: 0,
        y: 0,
        z: 0,
    }) as { x: number; y: number; z: number };

    // Position + rotation only (scale makes no sense :)
    entry.group.position.set(pos.x, pos.y, pos.z);
    entry.group.rotation.set(rot.x, rot.y, rot.z);

    const fov = cameraComp.data.fov.value as number;
    if (typeof fov === "number" && fov !== entry.dummy.fov) {
        entry.dummy.fov = fov;
        entry.dummy.updateProjectionMatrix();
    }
    entry.dummy.updateMatrixWorld();
    entry.helper.update();
}

/** delete */
export function disposeCameraHelper(
    entry: CameraHelperEntry,
    scene: THREE.Scene,
): void {
    scene.remove(entry.group);
    entry.helper.geometry.dispose();
    const mat = entry.helper.material;
    if (Array.isArray(mat)) {
        for (const m of mat) m.dispose();
    } else if (mat) {
        mat.dispose();
    }
    entry.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            const cm = child.material;
            if (Array.isArray(cm)) {
                for (const m of cm) m.dispose();
            } else if (cm) {
                cm.dispose();
            }
        }
    });
}
