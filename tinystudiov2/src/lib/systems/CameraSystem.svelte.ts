import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FirstPersonControls } from "three/addons/controls/FirstPersonControls.js";
import { FlyControls } from "three/addons/controls/FlyControls.js";
import { System, type Component, type Entity } from "$lib/stores/ecs.svelte";
import type { GameData } from "$lib/stores/data.svelte";

type CameraMode = "fixed" | "orbit" | "firstPerson" | "fly";

export class CameraSystem extends System {
    private scene: THREE.Scene | null = null;
    private camera: THREE.PerspectiveCamera | null = null;
    private gameData: GameData | null = null;
    private domElement: HTMLElement | null = null;
    private orbitControls: OrbitControls | null = null;
    private firstPersonControls: FirstPersonControls | null = null;
    private flyControls: FlyControls | null = null;
    private lastMode: CameraMode | null = null;
    private lastFov: number | null = null;

    constructor(
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera,
        gameData: GameData,
    ) {
        super();
        this.id = crypto.randomUUID();
        this.name = "CameraSystem";
        this.tooltip = "Drives the active camera entity in play mode.";
        this.relatedComponents = ["Camera", "Transform"];
        this.scene = scene;
        this.camera = camera;
        this.gameData = gameData;
    }

    /** Provide the viewport canvas so the controls can attach event listeners. */
    setDomElement(el: HTMLElement | null): void {
        this.domElement = el;
        this.ensureControls();
    }

    setup(_entities: Entity[]): void {}

    update(_deltaTime: number, entities: Entity[]): void {
        if (!this.camera) return;

        const cam = this.findActiveCamera(entities);
        if (!cam) return;

        const cameraComp = cam.components.find((c) => c.name === "Camera");
        const transformComp = cam.components.find(
            (c) => c.name === "Transform",
        );
        if (!cameraComp || !transformComp) return;

        const mode = (cameraComp.data.mode.value as CameraMode) ?? "orbit";
        const target = (cameraComp.data.target.value ?? {
            x: 0,
            y: 0,
            z: 0,
        }) as { x: number; y: number; z: number };
        const fov = (cameraComp.data.fov.value as number) ?? 75;

        this.ensureControls();

        // When the active camera changes (or mode changes), start from the
        // entity's Transform so switching is predictable.
        if (mode !== this.lastMode) {
            this.lastMode = mode;
            this.applyTransformToCamera(transformComp);
            if (mode === "orbit")
                this.camera.lookAt(target.x, target.y, target.z);
        }

        this.setActiveControls(mode);

        if (mode === "fixed") {
            this.applyTransformToCamera(transformComp);
            this.camera.lookAt(target.x, target.y, target.z);
        } else if (mode === "orbit") {
            if (this.orbitControls) {
                this.orbitControls.target.set(target.x, target.y, target.z);
                this.orbitControls.update(_deltaTime);
            }
        } else if (mode === "firstPerson") {
            if (this.firstPersonControls) {
                this.firstPersonControls.movementSpeed =
                    (cameraComp.data.moveSpeed.value as number) ?? 8;
                this.firstPersonControls.update(_deltaTime);
            }
        } else if (mode === "fly") {
            if (this.flyControls) {
                this.flyControls.movementSpeed =
                    (cameraComp.data.moveSpeed.value as number) ?? 8;
                this.flyControls.update(_deltaTime);
            }
        }

        // Keep the entity Transform in sync with the actual camera
        this.applyCameraToTransform(transformComp);

        if (fov !== this.lastFov) {
            this.camera.fov = fov;
            this.camera.updateProjectionMatrix();
            this.lastFov = fov;
        }
    }

    cleanup(): void {
        this.orbitControls?.dispose();
        this.firstPersonControls?.dispose();
        this.flyControls?.dispose();
        this.orbitControls = null;
        this.firstPersonControls = null;
        this.flyControls = null;
        this.domElement = null;
        this.camera = null;
    }

    private findActiveCamera(entities: Entity[]): Entity | undefined {
        const cameras = entities.filter((e) =>
            e.components.some((c) => c.name === "Camera"),
        );
        return (
            cameras.find((e) => {
                const comp = e.components.find((c) => c.name === "Camera");
                return comp?.data.active.value === true;
            }) ?? cameras[0]
        );
    }

    private applyTransformToCamera(transformComp: Component): void {
        if (!this.camera) return;
        const p = transformComp.data.position.value as {
            x: number;
            y: number;
            z: number;
        };
        const r = transformComp.data.rotation.value as {
            x: number;
            y: number;
            z: number;
        };
        this.camera.position.set(p.x, p.y, p.z);
        this.camera.rotation.set(r.x, r.y, r.z);
    }

    private applyCameraToTransform(transformComp: Component): void {
        if (!this.camera) return;
        transformComp.data.position.value = {
            x: this.camera.position.x,
            y: this.camera.position.y,
            z: this.camera.position.z,
        };
        transformComp.data.rotation.value = {
            x: this.camera.rotation.x,
            y: this.camera.rotation.y,
            z: this.camera.rotation.z,
        };
        transformComp.data.position.dirty = true;
        transformComp.data.rotation.dirty = true;
    }

    private ensureControls(): void {
        if (!this.camera || !this.domElement) return;
        if (!this.orbitControls) {
            this.orbitControls = new OrbitControls(
                this.camera,
                this.domElement,
            );
            this.orbitControls.enableDamping = true;
            this.orbitControls.dampingFactor = 0.08;
            this.orbitControls.enabled = false;
        }
        if (!this.firstPersonControls) {
            this.firstPersonControls = new FirstPersonControls(
                this.camera,
                this.domElement,
            );
            this.firstPersonControls.lookSpeed = 0.003;
            this.firstPersonControls.enabled = false;
        }
        if (!this.flyControls) {
            this.flyControls = new FlyControls(this.camera, this.domElement);
            this.flyControls.dragToLook = true;
            this.flyControls.rollSpeed = 0.05;
            this.flyControls.enabled = false;
        }
    }

    private setActiveControls(mode: CameraMode): void {
        const active =
            mode === "orbit"
                ? this.orbitControls
                : mode === "firstPerson"
                  ? this.firstPersonControls
                  : mode === "fly"
                    ? this.flyControls
                    : null;
        for (const c of [
            this.orbitControls,
            this.firstPersonControls,
            this.flyControls,
        ]) {
            if (c) c.enabled = c === active;
        }
    }
}
