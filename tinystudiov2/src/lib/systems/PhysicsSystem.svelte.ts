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
    private joltBodyByEntityId = new Map<string, any>();
    private joltConstraints: any[] = [];

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

        let constraints = [];

        for (const entity of entities) {
            // Check if it is a constraint
            const constraintComp = entity.components.find(
                (c) => c.name === "Constraint",
            );

            if (constraintComp) {
                const entityAId = constraintComp.data.entityA.value;
                const entityBId = constraintComp.data.entityB.value;

                const entityA = entities.find((e) => e.id === entityAId);
                const entityB = entities.find((e) => e.id === entityBId);

                if (!entityA || !entityB) {
                    console.warn(
                        `Constraint ${entity.id} references non-existent entities.`,
                    );
                    continue;
                }

                // We need to store this for later since the physics bodies for entityA and entityB might not be created yet
                constraints.push({
                    entityA,
                    entityB,
                    constraintComp,
                });

                // don't continue, because it is technically possible for the user to add it as a component to a physics body manually
            }

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
            // Convert Euler rotation to quaternion
            let euler = new THREE.Euler(
                transformComp.data.rotation.value.x,
                transformComp.data.rotation.value.y,
                transformComp.data.rotation.value.z,
            );
            let quaternion = new THREE.Quaternion().setFromEuler(euler);
            let bodyRotation = new this.jolt.Quat(
                quaternion.x,
                quaternion.y,
                quaternion.z,
                quaternion.w,
            );
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
            this.joltBodyByEntityId.set(entity.id, body);
        }

        console.log("constraints:", constraints);

        // Now that all bodies are created, create constraints
        for (const { entityA, entityB, constraintComp } of constraints) {
            const joltBodyA = this.joltBodyByEntityId.get(entityA.id);
            const joltBodyB = this.joltBodyByEntityId.get(entityB.id);

            if (!joltBodyA || !joltBodyB) {
                console.warn(
                    `Constraint references entities without physics bodies.`,
                );
                continue;
            }

            const constraintType = constraintComp.data.constraintType
                .value as string;

            console.log(
                "Creating",
                constraintType,
                "constraint between",
                entityA.id,
                "and",
                entityB.id,
            );

            let constraint: any = null;

            switch (constraintType) {
                case "hinge": {
                    const settings = new this.jolt.HingeConstraintSettings();
                    settings.mAutoDetectPoint = true;
                    // TODO: set axis/limits from constraintComp data
                    constraint = settings.Create(joltBodyA, joltBodyB);
                    break;
                }
                case "ballSocket": {
                    const settings =
                        new this.jolt.SwingTwistConstraintSettings();
                    settings.mAutoDetectPoint = true;
                    // TODO: set swing/twist limits from constraintComp data
                    constraint = settings.Create(joltBodyA, joltBodyB);
                    break;
                }
                case "fixed":
                default: {
                    const settings = new this.jolt.FixedConstraintSettings();
                    settings.mAutoDetectPoint = true;
                    constraint = settings.Create(joltBodyA, joltBodyB);
                    break;
                }
            }

            if (constraint) {
                physicsSystem.AddConstraint(constraint);
                this.joltConstraints.push(constraint);
                console.log(
                    `Created ${constraintType} constraint between ${entityA.id} and ${entityB.id}`,
                );
            }
        }
    }

    update(_deltaTime: number, entities: Entity[]): void {
        // Before stepping: sync dirty transforms → physics bodies (teleport)
        for (const entity of entities) {
            const bodyID = this.bodyByEntityId.get(entity.id);
            if (!bodyID) continue;

            const transformComp = entity.components.find(
                (c) => c.name === "Transform",
            );
            if (!transformComp) continue;

            const posDirty = transformComp.data.position.dirty;
            const rotDirty = transformComp.data.rotation.dirty;

            if (!posDirty && !rotDirty) continue;

            // Activate the body so Jolt accepts the teleport
            this.bodyInterface.ActivateBody(bodyID);

            if (posDirty) {
                const pos = transformComp.data.position.value as {
                    x: number;
                    y: number;
                    z: number;
                };
                this.bodyInterface.SetPosition(
                    bodyID,
                    new this.jolt.RVec3(pos.x, pos.y, pos.z),
                    this.jolt.EActivation_Activate,
                );
                transformComp.data.position.dirty = false;
            }

            if (rotDirty) {
                const rot = transformComp.data.rotation.value as {
                    x: number;
                    y: number;
                    z: number;
                };
                const quat = new THREE.Quaternion().setFromEuler(
                    new THREE.Euler(rot.x, rot.y, rot.z),
                );
                this.bodyInterface.SetRotation(
                    bodyID,
                    new this.jolt.Quat(quat.x, quat.y, quat.z, quat.w),
                    this.jolt.EActivation_Activate,
                );
                transformComp.data.rotation.dirty = false;
            }
        }

        // Step the simulation
        this.joltInterface.Step(1.0 / 60.0, 1);

        // After stepping: read back transforms FROM physics bodies
        for (const entity of entities) {
            const bodyID = this.bodyByEntityId.get(entity.id);
            if (!bodyID) continue;

            const transformComp = entity.components.find(
                (c) => c.name === "Transform",
            );
            if (!transformComp) continue;

            const pos = this.bodyInterface.GetPosition(bodyID);
            transformComp.data.position.value = {
                x: pos.GetX(),
                y: pos.GetY(),
                z: pos.GetZ(),
            };
            transformComp.data.position.dirty = true;

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

        // Remove constraints first
        if (this.joltInterface) {
            const physicsSystem = this.joltInterface.GetPhysicsSystem();
            for (const constraint of this.joltConstraints) {
                physicsSystem.RemoveConstraint(constraint);
            }
        }
        this.joltConstraints = [];

        for (const [id, bodyID] of this.bodyByEntityId) {
            this.bodyInterface.RemoveBody(bodyID);
            this.bodyInterface.DestroyBody(bodyID);
        }

        this.bodyByEntityId.clear();
        this.joltBodyByEntityId.clear();

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
