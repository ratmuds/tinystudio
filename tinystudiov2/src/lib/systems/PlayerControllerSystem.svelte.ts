import * as THREE from "three";
import { System, type Entity } from "$lib/stores/ecs.svelte";

export class PlayerControllerSystem extends System {
    private camera: THREE.Camera | null = null;
    private keysPressed = new Set<string>();
    private onKeyDown: ((e: KeyboardEvent) => void) | null = null;
    private onKeyUp: ((e: KeyboardEvent) => void) | null = null;
    private groundedEntities = new Set<string>();

    constructor(camera?: THREE.Camera) {
        super();
        this.id = crypto.randomUUID();
        this.name = "PlayerControllerSystem";
        this.tooltip =
            "Controls playable entities with camera-relative WASD movement and Space jumping.";
        this.relatedComponents = ["PlayerController", "Transform", "Physics"];
        this.camera = camera ?? null;
    }

    setCamera(cam: THREE.Camera) {
        this.camera = cam;
    }

    setup(entities: Entity[]): void {
        this.onKeyDown = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return;
            this.keysPressed.add(e.code);
        };
        this.onKeyUp = (e: KeyboardEvent) => {
            this.keysPressed.delete(e.code);
        };
        window.addEventListener("keydown", this.onKeyDown);
        window.addEventListener("keyup", this.onKeyUp);

        // Grounding detection via physics collision
        for (const entity of entities) {
            const pc = entity.components.find(
                (c) => c.name === "PlayerController",
            );
            if (!pc) continue;

            entity.events.on("Physics.touched", () => {
                this.groundedEntities.add(entity.id);
            });
            // Initial ground assumption
            this.groundedEntities.add(entity.id);
        }
    }

    update(_deltaTime: number, entities: Entity[]): void {
        for (const entity of entities) {
            const pcComp = entity.components.find(
                (c) => c.name === "PlayerController",
            );
            const transformComp = entity.components.find(
                (c) => c.name === "Transform",
            );
            const physicsComp = entity.components.find(
                (c) => c.name === "Physics",
            );
            if (!pcComp || !transformComp || !physicsComp) continue;

            const enabled = pcComp.data.enabled?.value !== false;
            if (!enabled) continue;

            const speed = Number(pcComp.data.speed?.value ?? 8);
            const jumpForce = Number(pcComp.data.jumpForce?.value ?? 9);
            const airControl = Number(pcComp.data.airControl?.value ?? 0.6);

            // Compute input direction
            let moveZ = 0;
            let moveX = 0;
            if (this.keysPressed.has("KeyW") || this.keysPressed.has("ArrowUp"))
                moveZ += 1;
            if (this.keysPressed.has("KeyS") || this.keysPressed.has("ArrowDown"))
                moveZ -= 1;
            if (this.keysPressed.has("KeyA") || this.keysPressed.has("ArrowLeft"))
                moveX -= 1;
            if (this.keysPressed.has("KeyD") || this.keysPressed.has("ArrowRight"))
                moveX += 1;

            // Compute camera-relative forward & right
            const forward = new THREE.Vector3(0, 0, -1);
            const right = new THREE.Vector3(1, 0, 0);

            if (this.camera) {
                this.camera.getWorldDirection(forward);
                forward.y = 0;
                forward.normalize();
                right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
            }

            const moveDir = new THREE.Vector3();
            if (moveZ !== 0) moveDir.addScaledVector(forward, moveZ);
            if (moveX !== 0) moveDir.addScaledVector(right, moveX);

            const isGrounded = this.groundedEntities.has(entity.id);
            const effectiveSpeed = isGrounded ? speed : speed * airControl;

            if (moveDir.lengthSq() > 0) {
                moveDir.normalize().multiplyScalar(effectiveSpeed);

                // Smoothly rotate character toward movement direction
                const targetAngle = Math.atan2(moveDir.x, moveDir.z);
                transformComp.data.rotation.value.y = targetAngle;
                transformComp.data.rotation.dirty = true;
            }

            // Keep upright (zero angular velocity)
            entity.events.emit("Physics.lockRotation");

            // Check Jump
            if (this.keysPressed.has("Space") && isGrounded) {
                entity.events.emit("Physics.setVelocity", {
                    x: moveDir.x,
                    y: jumpForce,
                    z: moveDir.z,
                });
                this.groundedEntities.delete(entity.id);
                entity.events.emit("player.jump");
            } else if (moveDir.lengthSq() > 0) {
                entity.events.emit("Physics.setVelocity", {
                    x: moveDir.x,
                    preserveY: true,
                    z: moveDir.z,
                });
            } else if (isGrounded) {
                // Apply slight damping when stopped on ground
                entity.events.emit("Physics.setVelocity", {
                    x: 0,
                    preserveY: true,
                    z: 0,
                });
            }
        }
    }

    cleanup(): void {
        if (this.onKeyDown)
            window.removeEventListener("keydown", this.onKeyDown);
        if (this.onKeyUp) window.removeEventListener("keyup", this.onKeyUp);
        this.keysPressed.clear();
        this.groundedEntities.clear();
    }
}
