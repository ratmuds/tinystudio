import * as THREE from "three";
import { System, type Entity } from "$lib/stores/ecs.svelte";
import type { GameData } from "$lib/stores/data.svelte";
import { LuaFactory, LuaReturn, type LuaThread } from "wasmoon";
const factory = new LuaFactory();

export class ScriptingSystem extends System {
    private scene: THREE.Scene | null = null;
    private gameData: GameData | null = null;
    private running = false;

    constructor(scene: THREE.Scene, gameData: GameData) {
        super();
        this.id = crypto.randomUUID();
        this.name = "ScriptingSystem";
        this.tooltip = "Executes Lua scripts for game logic and behavior.";
        this.relatedComponents = ["Script"];
        this.scene = scene;
        this.gameData = gameData;
    }

    async setup(entities: Entity[]): Promise<void> {
        if (!this.scene || !this.gameData) return;

        this.running = true;

        let lua = await factory.createEngine();

        for (const entity of entities) {
            let scriptComp = entity.components.find((c) => c.name === "Script");
            if (!scriptComp) continue;

            console.log(
                "Executing script for entity",
                entity.id,
                "in ScriptingSystem",
            );

            let scriptId = scriptComp.data.scriptId.value as string;
            let scriptData = this.gameData.scripts.find(
                (s) => s.id === scriptId,
            );
            if (!scriptData) {
                console.warn("Script data not found for entity", entity.id);
                continue;
            } else {
                console.log("Found script data for entity", entity.id);
                console.log("id:", scriptData.id);
                console.log("name:", scriptData.name);
                console.log("scriptData:", scriptData.scriptData);
                console.log(
                    "first block code:",
                    scriptData.scriptData[0]?.code,
                );
                console.log("full scriptData:", scriptData.stateData);
            }

            console.log(
                "first, step the state machine to go to the first node",
            );
            /*
            {
  "nodes": [
    {
      "id": "start",
      "type": "terminal",
      "position": {
        "x": 150,
        "y": 0
      },
      "data": {
        "kind": "start"
      }
    },
    {
      "id": "end",
      "type": "terminal",
      "position": {
        "x": 150,
        "y": 300
      },
      "data": {
        "kind": "end"
      }
    },
    {
      "id": "node-97fdb3e4",
      "type": "stateMachine",
      "position": {
        "x": 197.57264445406702,
        "y": 80.99885305461089
      },
      "data": {
        "text": "",
        "handles": [
          {
            "id": "74910258",
            "label": "Out"
          }
        ],
        "script": "uihihuhiu"
      }
    }
  ],
  "edges": [
    {
      "id": "xy-edge__start-node-97fdb3e4",
      "source": "start",
      "target": "node-97fdb3e4"
    },
    {
      "id": "xy-edge__node-97fdb3e474910258-end",
      "source": "node-97fdb3e4",
      "sourceHandle": "74910258",
      "target": "end"
    }
  ]
}*/

            let currentNode = "start";
            let changeState: undefined | string = undefined;

            let foundEdge = scriptData.stateData.edges.find(
                (e: any) => e.source === currentNode,
            );
            let nextNodeId = foundEdge?.target;
            if (nextNodeId) {
                console.log("Found next node id:", nextNodeId);
                currentNode = nextNodeId;

                if (nextNodeId === "end") {
                    console.log("Reached end node, stopping execution");
                    this.running = false;
                    lua.global.close();
                    return;
                }
            }

            // find script attached to the current node
            let currentNodeData = scriptData.stateData.nodes.find(
                (n: any) => n.id === currentNode,
            );
            let currentScript = scriptData.scriptData.find(
                (s) => s.name === currentNodeData.data.script,
            );

            if (!currentScript) {
                console.warn("No script found for current node:", currentNode);
                this.running = false;
                lua.global.close();
                return;
            } else {
                console.log("Found script for current node:", currentNode);
                console.log("script code:", currentScript.code);
            }

            try {
                await lua.doString(currentScript.code);
            } catch (e) {
                console.error(
                    "Failed to execute script for node:",
                    currentNode,
                    "Error:",
                    e,
                );
                lua.global.close();
                return;
            }

            let mainThread: LuaThread = lua.global.get("mainThread");

            lua.global.set("changeState", (newState: string) => {
                changeState = newState;
            });

            const step = async () => {
                if (!this.running) {
                    console.log("Play test stopped, closing Lua engine");
                    lua.global.close();
                    return;
                }

                if (changeState) {
                    const targetHandleLabel = changeState;
                    console.log(
                        "Changing state to the output named:",
                        targetHandleLabel,
                    );
                    changeState = undefined;

                    console.log(
                        "Closing current Lua engine and creating a new one for the new state",
                    );
                    lua.global.close();

                    console.log(
                        "finding new node in state machine:",
                        currentNode,
                    );
                    // this one is more complicated because we need to find the edge that has the current node, as well as the correct output handle
                    let foundHandle = currentNodeData.data.handles.find(
                        (h: any) => h.label === targetHandleLabel,
                    );
                    if (!foundHandle) {
                        console.warn(
                            "No handle found for output named:",
                            targetHandleLabel,
                        );
                        this.running = false;
                        return;
                    }
                    let foundEdge = scriptData.stateData.edges.find(
                        (e: any) =>
                            e.source === currentNode &&
                            e.sourceHandle === foundHandle.id,
                    );
                    console.log(scriptData.stateData.edges);
                    if (!foundEdge) {
                        console.warn(
                            "No edge found for output named:",
                            targetHandleLabel,
                        );
                        this.running = false;
                        return;
                    }

                    let nextNodeId = foundEdge.target;
                    currentNode = nextNodeId;

                    if (nextNodeId === "end") {
                        console.log("Reached end node, stopping execution");
                        alert(
                            "Reached end node, stopping execution!!!!!!!!!!!!!!!!!!",
                        );
                        this.running = false;
                        lua.global.close();
                        return;
                    }

                    let nextNodeData = scriptData.stateData.nodes.find(
                        (n: any) => n.id === nextNodeId,
                    );

                    if (!nextNodeData) {
                        console.warn(
                            "No node found for next node id:",
                            nextNodeId,
                        );
                        this.running = false;
                        return;
                    }

                    currentNodeData = nextNodeData;

                    let nextScript = scriptData.scriptData.find(
                        (s) => s.name === nextNodeData.data.script,
                    );
                    if (!nextScript) {
                        console.warn(
                            "No script found for next node id:",
                            nextNodeId,
                        );
                        this.running = false;
                        return;
                    }

                    lua = await factory.createEngine();
                    lua.global.set("changeState", (newState: string) => {
                        changeState = newState;
                    });
                    try {
                        await lua.doString(nextScript.code);
                    } catch (e) {
                        console.error(
                            "Failed to execute script for node:",
                            nextNodeId,
                            "Error:",
                            e,
                        );
                        lua.global.close();
                        this.running = false;
                        return;
                    }

                    mainThread = lua.global.get("mainThread");

                    requestAnimationFrame(step);
                    return;
                }

                const { result, resultCount } = mainThread.resume();

                if (result === LuaReturn.Ok) {
                    // Coroutine completed normally (no more yields)
                    console.log("Coroutine completed");

                    // check if there is a change state request

                    if (changeState) {
                        console.warn(
                            "I JUST REALIZED THAT I NEED TO HANDLE CHANGE STATE HERE TOO",
                        );
                        console.warn("OK LOOP WILL RUN AGAIN TO HANDLE IT BYE");
                        // we will refire the step function to handle the state change
                        requestAnimationFrame(step);
                        return;
                    }

                    lua.global.close();
                    return;
                }

                if (result !== LuaReturn.Yield) {
                    const [errorMsg] = mainThread.getStackValues(0);
                    console.error(
                        "Game loop crashed with result code:",
                        result,
                        "Error:",
                        errorMsg || "Unknown error",
                    );
                    mainThread.pop(resultCount);
                    lua.global.close();
                    return;
                }

                let waitSeconds = 0;
                if (resultCount > 0) {
                    const [first] = mainThread.getStackValues(0);
                    if (typeof first === "number") {
                        waitSeconds = first;
                    }
                    mainThread.pop(resultCount);
                }

                if (!this.running) {
                    console.log("Play test stopped, closing Lua engine");

                    lua.global.close();
                    return;
                }

                if (waitSeconds > 0) {
                    setTimeout(step, waitSeconds * 1000);
                } else {
                    requestAnimationFrame(step);
                }
            };

            requestAnimationFrame(step);
        }
    }

    update(_deltaTime: number, entities: Entity[]): void {}

    cleanup(): void {
        this.running = false;
    }
}
