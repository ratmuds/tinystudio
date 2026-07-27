import * as THREE from "three";
import { System, type Entity } from "$lib/stores/ecs.svelte";
import type { GameData } from "$lib/stores/data.svelte";

export class MeshSystem extends System {
    private scene: THREE.Scene | null = null;
    private gameData: GameData | null = null;
    private groupByEntityId = new Map<string, THREE.Group>();

    constructor(scene: THREE.Scene, gameData: GameData) {
        super();
        this.id = crypto.randomUUID();
        this.name = "MeshSystem";
        this.tooltip =
            "Renders entities with ModelRef or Mesh components as Three.js meshes.";
        this.relatedComponents = ["ModelRef", "Mesh", "Transform"];
        this.scene = scene;
        this.gameData = gameData;
    }

    setup(entities: Entity[]): void {
        if (!this.scene || !this.gameData) return;
        for (const entity of entities) {
            console.log("Spawning entity", entity.id, "in MeshSystem");
            this.spawnEntity(entity);
        }
    }

    update(_deltaTime: number, entities: Entity[]): void {
        for (const entity of entities) {
            const group = this.groupByEntityId.get(entity.id);
            if (!group) continue;

            const transformComp = entity.components.find(
                (c) => c.name === "Transform",
            );
            if (!transformComp) continue;

            if (transformComp.data.position.dirty) {
                const pos = transformComp.data.position.value as {
                    x: number;
                    y: number;
                    z: number;
                };
                group.position.set(pos.x, pos.y, pos.z);

                transformComp.data.position.dirty = false;
            }

            if (transformComp.data.rotation.dirty) {
                const rot = transformComp.data.rotation.value as {
                    x: number;
                    y: number;
                    z: number;
                };
                group.rotation.set(rot.x, rot.y, rot.z);

                transformComp.data.rotation.dirty = false;
            }

            if (transformComp.data.scale.dirty) {
                const scl = transformComp.data.scale.value as {
                    x: number;
                    y: number;
                    z: number;
                };
                group.scale.set(scl.x, scl.y, scl.z);

                transformComp.data.scale.dirty = false;
            }
        }
    }

    cleanup(): void {
        if (!this.scene) return;
        for (const [id, group] of this.groupByEntityId) {
            this.scene.remove(group);
            group.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    const mat = child.material;
                    if (Array.isArray(mat)) {
                        for (const m of mat) m.dispose();
                    } else if (mat) {
                        mat.dispose();
                    }
                }
            });
        }
        this.groupByEntityId.clear();
    }

    private spawnEntity(entity: Entity): void {
        if (!this.scene) return;

        const transformComp = entity.components.find(
            (c) => c.name === "Transform",
        );
        const meshComp = entity.components.find((c) => c.name === "Mesh");

        if (!transformComp || !meshComp) return;

        const geomType = meshComp.data.geometryType.value as string;
        const size = meshComp.data.size.value as {
            x: number;
            y: number;
            z: number;
        };
        const color = meshComp.data.color.value as number;

        let geometry: THREE.BufferGeometry;
        switch (geomType) {
            case "sphere":
                geometry = new THREE.SphereGeometry(size.x / 2);
                break;
            case "cylinder":
                geometry = new THREE.CylinderGeometry(
                    size.x / 2,
                    size.x / 2,
                    size.y,
                );
                break;
            default:
                geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        }

        const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({ color }),
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.entityId = entity.id;

        const group = new THREE.Group();
        group.add(mesh);

        const pos = transformComp.data.position.value as {
            x: number;
            y: number;
            z: number;
        };
        group.position.set(pos.x, pos.y, pos.z);

        const rot = transformComp.data.rotation.value as {
            x: number;
            y: number;
            z: number;
        };
        group.rotation.set(rot.x, rot.y, rot.z);

        const scl = transformComp.data.scale.value as {
            x: number;
            y: number;
            z: number;
        };
        group.scale.set(scl.x, scl.y, scl.z);

        group.userData.entityId = entity.id;
        this.scene.add(group);
        this.groupByEntityId.set(entity.id, group);
    }
}
