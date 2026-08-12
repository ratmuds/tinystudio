import * as THREE from "three";
import { System, type Entity, type Component } from "$lib/stores/ecs.svelte";
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
    private entityIdByBodyId = new Map<number, string>();
    private joltConstraints: any[] = [];
    private entities: Entity[] = [];
    private activationListener: any = null;
    private contactListener: any = null;
    private activeContacts = new Set<string>();
    private eventQueue: { entity: Entity; event: string; data: any }[] = [];

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
        this.jolt = await initJolt();
        this.entities = entities;

        if (!this.scene || !this.gameData) return;

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

        // Activation listener
        this.activationListener = new this.jolt.BodyActivationListenerJS();

        this.activationListener.OnBodyActivated = (
            bodyId: any,
            userData: any,
        ) => {
            bodyId = this.jolt.wrapPointer(bodyId, this.jolt.BodyID);
            const entityId = this.entityIdByBodyId.get(
                bodyId.GetIndexAndSequenceNumber(),
            );
            if (!entityId) return;
            const entity = this.entities.find((e) => e.id === entityId);
            if (!entity) return;
            entity.events.emit("Physics.activated");
        };

        this.activationListener.OnBodyDeactivated = (
            bodyId: any,
            userData: any,
        ) => {
            bodyId = this.jolt.wrapPointer(bodyId, this.jolt.BodyID);
            const entityId = this.entityIdByBodyId.get(
                bodyId.GetIndexAndSequenceNumber(),
            );
            if (!entityId) return;
            const entity = this.entities.find((e) => e.id === entityId);
            if (!entity) return;
            entity.events.emit("Physics.deactivated");
        };
        physicsSystem.SetBodyActivationListener(this.activationListener);

        // Contact Listener
        this.contactListener = new this.jolt.ContactListenerJS();

        // TODO: the contact validator can be used to filter out contacts if wanted later
        this.contactListener.OnContactValidate = (
            body1: any,
            body2: any,
            baseOffset: any,
            collideShapeResult: any,
        ) => {
            body1 = this.jolt.wrapPointer(body1, this.jolt.Body);
            body2 = this.jolt.wrapPointer(body2, this.jolt.Body);

            let entityId1 = this.entityIdByBodyId.get(body1.GetID().GetIndexAndSequenceNumber());
            let entityId2 = this.entityIdByBodyId.get(body2.GetID().GetIndexAndSequenceNumber());

            if (!entityId1 || !entityId2) return;

            let entity1 = this.entities.find((e) => e.id === entityId1);
            let entity2 = this.entities.find((e) => e.id === entityId2);

            if (!entity1 || !entity2) return;

            entity1.events.emit("Physics.touchValidated", entity2);
            entity2.events.emit("Physics.touchValidated", entity1);

            return this.jolt.ValidateResult_AcceptAllContactsForThisBodyPair;
        };

        this.contactListener.OnContactAdded = (
            body1: any,
            body2: any,
            manifold: any,
            settings: any,
        ) => {
            body1 = this.jolt.wrapPointer(body1, this.jolt.Body);
            body2 = this.jolt.wrapPointer(body2, this.jolt.Body);

            let entityId1 = this.entityIdByBodyId.get(body1.GetID().GetIndexAndSequenceNumber());
            let entityId2 = this.entityIdByBodyId.get(body2.GetID().GetIndexAndSequenceNumber());

            if (!entityId1 || !entityId2) return;

            let entity1 = this.entities.find((e) => e.id === entityId1);
            let entity2 = this.entities.find((e) => e.id === entityId2);

            if (!entity1 || !entity2) return;

            entity1.events.emit("Physics.touched", entity2);
            entity2.events.emit("Physics.touched", entity1);
        };

        this.contactListener.OnContactPersisted = (
            body1: any,
            body2: any,
            manifold: any,
            settings: any,
        ) => {
            body1 = this.jolt.wrapPointer(body1, this.jolt.Body);
            body2 = this.jolt.wrapPointer(body2, this.jolt.Body);

            let entityId1 = this.entityIdByBodyId.get(body1.GetID().GetIndexAndSequenceNumber());
            let entityId2 = this.entityIdByBodyId.get(body2.GetID().GetIndexAndSequenceNumber());

            if (!entityId1 || !entityId2) return;

            let entity1 = this.entities.find((e) => e.id === entityId1);
            let entity2 = this.entities.find((e) => e.id === entityId2);

            if (!entity1 || !entity2) return;

            entity1.events.emit("Physics.touchPersisted", entity2);
            entity2.events.emit("Physics.touchPersisted", entity1);
        };
        this.contactListener.OnContactRemoved = (subShapePair: any) => {
            subShapePair = this.jolt.wrapPointer(
                subShapePair,
                this.jolt.SubShapeIDPair,
            );
            let entityId1 = this.entityIdByBodyId.get(
                subShapePair.GetBody1ID().GetIndexAndSequenceNumber(),
            );
            let entityId2 = this.entityIdByBodyId.get(
                subShapePair.GetBody2ID().GetIndexAndSequenceNumber(),
            );

            if (!entityId1 || !entityId2) return;

            let entity1 = this.entities.find((e) => e.id === entityId1);
            let entity2 = this.entities.find((e) => e.id === entityId2);

            if (!entity1 || !entity2) return;

            entity1.events.emit("Physics.touchRemoved", entity2);
            entity2.events.emit("Physics.touchRemoved", entity1);
        };
        physicsSystem.SetContactListener(this.contactListener);

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

            // Build the collider. Entities with custom (CSG) geometry get a
            // dedicated mesh/hull collider instead of a transform-scaled box.
            const shape = this.createPhysicsShape(
                entity,
                transformComp,
                anchored,
            );
            if (!shape) continue;

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
                shape,
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
            this.bodyByEntityId.set(entity.id, body.GetID());
            this.joltBodyByEntityId.set(entity.id, body);
            this.entityIdByBodyId.set(
                body.GetID().GetIndexAndSequenceNumber(),
                entity.id,
            );
        }

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
            if (this.contactListener) {
                physicsSystem.SetContactListener(null);
                this.jolt.destroy(this.contactListener);
                this.contactListener = null;
            }
        }
        this.joltConstraints = [];

        for (const [id, bodyID] of this.bodyByEntityId) {
            this.bodyInterface.RemoveBody(bodyID);
            this.bodyInterface.DestroyBody(bodyID);
        }

        this.bodyByEntityId.clear();
        this.joltBodyByEntityId.clear();
        this.entityIdByBodyId.clear();
        this.activeContacts.clear();
        this.entities = [];

        if (this.joltInterface) {
            this.jolt.destroy(this.joltInterface);
            this.joltInterface = null;
            this.bodyInterface = null;
        }
        this.jolt = null;
    }

    /**
     * Build the Jolt collider for an entity.
     *
     * Entities with custom (CSG) geometry get a collider derived from the
     * serialized vertex data instead of a transform-scaled box:
     *  - anchored/static bodies use an exact concave triangle `MeshShape`
     *  - dynamic bodies use a `ConvexHullShape` (a convex approximation, since
     *    Jolt only allows static meshes)
     * Everything else falls back to a box sized from the transform scale.
     */
    private createPhysicsShape(
        entity: Entity,
        transformComp: Component,
        anchored: boolean,
    ): any | null {
        const meshComp = entity.components.find((c) => c.name === "Mesh");
        const custom = meshComp?.data.customGeometry?.value as
            | { positions: number[]; index?: number[] | null }
            | null
            | undefined;

        const hasCustom = !!custom && (custom.positions?.length ?? 0) >= 9;

        if (hasCustom) {
            const scale = transformComp.data.scale.value as {
                x: number;
                y: number;
                z: number;
            };
            // The custom geometry is stored in local/model space, so apply the
            // entity's scale so the collider matches the rendered mesh.
            const n = custom.positions.length;
            const verts = new Float32Array(n);
            for (let i = 0; i < n; i += 3) {
                verts[i] = custom.positions[i] * scale.x;
                verts[i + 1] = custom.positions[i + 1] * scale.y;
                verts[i + 2] = custom.positions[i + 2] * scale.z;
            }
            const idx = custom.index as number[] | null | undefined;

            try {
                if (anchored && idx && idx.length >= 3) {
                    // Exact concave triangle mesh for static bodies.
                    const vl = new this.jolt.VertexList();
                    for (let i = 0; i < n; i += 3) {
                        vl.push_back(
                            new this.jolt.Float3(
                                verts[i],
                                verts[i + 1],
                                verts[i + 2],
                            ),
                        );
                    }
                    const il = new this.jolt.IndexedTriangleList();
                    for (let i = 0; i < idx.length; i += 3) {
                        il.push_back(
                            new this.jolt.IndexedTriangle(
                                idx[i],
                                idx[i + 1],
                                idx[i + 2],
                                0,
                            ),
                        );
                    }
                    const settings = new this.jolt.MeshShapeSettings(vl, il);
                    const result = settings.Create();
                    if (!result.IsValid()) {
                        console.warn(
                            "MeshShape creation failed:",
                            result.GetError(),
                        );
                        return null;
                    }
                    return result.Get();
                }

                // Convex hull approximation for dynamic bodies.
                const pts = new this.jolt.ArrayVec3();
                for (let i = 0; i < n; i += 3) {
                    pts.push_back(
                        new this.jolt.Vec3(
                            verts[i],
                            verts[i + 1],
                            verts[i + 2],
                        ),
                    );
                }
                const settings = new this.jolt.ConvexHullShapeSettings(pts, 0.1);
                const result = settings.Create();
                if (!result.IsValid()) {
                    console.warn(
                        "ConvexHullShape creation failed:",
                        result.GetError(),
                    );
                    return null;
                }
                return result.Get();
            } catch (e) {
                console.warn(
                    "Failed to build collider from custom geometry:",
                    e,
                );
                // Fall through to the box fallback on error.
            }
        }

        // Fallback: box sized from the transform scale.
        const scale = transformComp.data.scale.value as {
            x: number;
            y: number;
            z: number;
        };
        return new this.jolt.BoxShape(
            new this.jolt.Vec3(
                scale.x / 2,
                scale.y / 2,
                scale.z / 2,
            ),
            0.0,
        );
    }

    private spawnEntity(entity: Entity): void {
        if (!this.scene || !this.gameData) return;
    }
}
