import * as THREE from "three";
import { System, type Entity } from "$lib/stores/ecs.svelte";
import type { GameData } from "$lib/stores/data.svelte";
import initJolt from "jolt-physics";

export class PhysicsSystem extends System {
    private scene: THREE.Scene | null = null;
    private gameData: GameData | null = null;
    private jolt: any = null;
    private joltInterface: any = null;
    private bodyInterface: any = null;
    private bodyByEntityId = new Map<string, any>();

    constructor(scene: THREE.Scene, gameData: GameData) {
        super();
        this.id = crypto.randomUUID();
        this.name = "PhysicsSystem";
        this.tooltip =
            "Handles physics simulation for entities with Physics components.";
        this.relatedComponents = ["ModelRef", "Transform", "Physics"];
        this.scene = scene;
        this.gameData = gameData;
    }

    async setup(entities: Entity[]): Promise<void> {
        console.log("Setting up PhysicsSystem...");
        this.jolt = await initJolt();

        if (!this.scene || !this.gameData) return;

        console.log("Setting up physics...");
        const MY_LAYER = 0;
        let objectFilter = new this.jolt.ObjectLayerPairFilterTable(1);
        objectFilter.EnableCollision(MY_LAYER, MY_LAYER);

        // Create very simple broad phase layer interface with only a single layer
        const BP_LAYER = new this.jolt.BroadPhaseLayer(0);
        let bpInterface = new this.jolt.BroadPhaseLayerInterfaceTable(1, 1);
        bpInterface.MapObjectToBroadPhaseLayer(MY_LAYER, BP_LAYER);
        this.jolt.destroy(BP_LAYER); // 'BP_LAYER' has been copied into bpInterface

        // Create broad phase filter
        let bpFilter = new this.jolt.ObjectVsBroadPhaseLayerFilterTable(
            bpInterface,
            1,
            objectFilter,
            1,
        );

        // Initialize Jolt
        let settings = new this.jolt.JoltSettings();
        settings.mObjectLayerPairFilter = objectFilter;
        settings.mBroadPhaseLayerInterface = bpInterface;
        settings.mObjectVsBroadPhaseLayerFilter = bpFilter;
        this.joltInterface = new this.jolt.JoltInterface(settings); // Everything in 'settings' has now been copied into 'jolt', the 3 interfaces above are now owned by 'jolt'
        this.jolt.destroy(settings);

        // Typing shortcuts
        let physicsSystem = this.joltInterface.GetPhysicsSystem();
        this.bodyInterface = physicsSystem.GetBodyInterface();

        for (const entity of entities) {
            const physicsComp = entity.components.find(
                (c) => c.name === "Physics",
            );
            if (!physicsComp) continue;
            if (physicsComp.data.enabled.value !== true) continue;

            const transformComp = entity.components.find(
                (c) => c.name === "Transform",
            );
            if (!transformComp) continue;

            const anchored = physicsComp.data.anchored?.value === true;
            const motionType = anchored
                ? this.jolt.EMotionType_Static
                : this.jolt.EMotionType_Dynamic;

            console.warn("only box colliders supported rn!!!");

            // Create a box shape for the entity
            let boxShape = new this.jolt.BoxShape(
                new this.jolt.Vec3(
                    transformComp.data.scale.value.x / 2,
                    transformComp.data.scale.value.y / 2,
                    transformComp.data.scale.value.z / 2,
                ),
                0.0,
            );

            // Create body creation settings
            let bodyPosition = new this.jolt.RVec3(
                transformComp.data.position.value.x,
                transformComp.data.position.value.y,
                transformComp.data.position.value.z,
            );
            let bodyRotation = new this.jolt.Quat(0, 0, 0, 1);
            let creationSettings = new this.jolt.BodyCreationSettings(
                boxShape,
                bodyPosition,
                bodyRotation,
                motionType,
                MY_LAYER,
            );
            this.jolt.destroy(bodyPosition);
            this.jolt.destroy(bodyRotation);

            // Create the body and add it to the simulation
            let body = this.bodyInterface.CreateBody(creationSettings);
            this.jolt.destroy(creationSettings);
            this.bodyInterface.AddBody(
                body.GetID(),
                this.jolt.EActivation_Activate,
            );

            // Store the bodyID in the map for later use
            console.log(
                "Created physics body for entity",
                entity.id,
                "with bodyID",
                body.GetID(),
            );
            this.bodyByEntityId.set(entity.id, body.GetID());
        }
    }

    update(_deltaTime: number, entities: Entity[]): void {
        this.joltInterface.Step(1.0 / 60.0, 1);

        for (const entity of entities) {
            const bodyID = this.bodyByEntityId.get(entity.id);
            if (!bodyID) continue;

            const transformComp = entity.components.find(
                (c) => c.name === "Transform",
            );
            if (!transformComp) continue;

            // Read position FROM physics body
            const pos = this.bodyInterface.GetPosition(bodyID);
            transformComp.data.position.value = {
                x: pos.GetX(),
                y: pos.GetY(),
                z: pos.GetZ(),
            };
            transformComp.data.position.dirty = true;
            console.log(transformComp.data.position.value);

            // Read rotation FROM physics body (convert quaternion to Euler)
            const rot = this.bodyInterface.GetRotation(bodyID);
            const quat = new THREE.Quaternion(
                rot.GetX(),
                rot.GetY(),
                rot.GetZ(),
                rot.GetW(),
            );
            const euler = new THREE.Euler().setFromQuaternion(quat);
            transformComp.data.rotation.value = {
                x: euler.x,
                y: euler.y,
                z: euler.z,
            };
            transformComp.data.rotation.dirty = true;
        }
    }

    cleanup(): void {
        if (!this.scene) return;

        for (const [id, bodyID] of this.bodyByEntityId) {
            this.bodyInterface.RemoveBody(bodyID);
            this.bodyInterface.DestroyBody(bodyID);
        }

        this.bodyByEntityId.clear();

        if (this.joltInterface) {
            this.jolt.destroy(this.joltInterface);
            this.joltInterface = null;
            this.bodyInterface = null;
        }
        this.jolt = null;
    }

    private spawnEntity(entity: Entity): void {
        if (!this.scene || !this.gameData) return;
    }
}
