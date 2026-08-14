# V2 Engine Roadmap — 30-Minute Demo Games

Goal: be able to build a short, session-length game in the V2 engine — the kind that feels
like a real game loop even if the content is small. Bee Swarm Simulator is the reference:
walk around a world, collect things, talk to NPCs, earn currency, buy upgrades, save progress,
and feel progression in a ~30 minute session.

This doc is **engine-only**. UI (menus, HUD, dialogs, shop screens) is intentionally left out
for now, but everything below is built so that UI can sit on top of it later without engine
rewrites.

---

## 1. What a BSS-style demo actually needs (engine terms)

Break a 30-minute demo into engine features:

| Gameplay need | Engine feature required |
|---|---|
| Move the player around the world | Character/player controller + camera that follows |
| Look around / aim | Scriptable camera, mouse + pointer-lock input |
| Collect pollen from flowers | Raycast / proximity interaction, respawn/timers, runtime entity spawning |
| Currency (pollen → honey) | Persisted numeric game state, readable/writable from Lua |
| Buy bees / upgrades | Same game state + a data model that survives a restart |
| Talk to NPCs / quests | Interaction events + dialog/quest data (UI later) |
| Game feels alive | Global systems (not tied to one entity), timers, per-second logic |
| Save between sessions | Full persistence of worlds/models/scripts + runtime save/load |
| Debug while making it | Script errors surfaced in the editor, not just the console |

---

## 2. Current state of V2 (verified, with file refs)

What already works:

- **ECS store**: `Entity`, `Component`, `System` base class with `setup/update/cleanup`, and
  component factories (`ecs.svelte.ts:11-65`, `83-232`). Component data types available:
  `string`, `number`, `boolean`, `vector3`, `color`, `texture`, `entity`, `model`, `script`,
  `json`, `jsonList` (`ecs.svelte.ts:21-39`).
- **Data model**: `GameData` holds `worlds/models/scripts`, `WorldData`, `ModelData`,
  `ScriptData` (`data.svelte.ts`).
- **Runtime**: `Runtime.svelte` flattens a world into world-space clones
  (`flattenWorldForRuntime`, `Runtime.svelte:103`) and runs three systems per frame:
  `ScriptingSystem → PhysicsSystem → MeshSystem` (`Runtime.svelte:226-238`). Scripts are
  started per-entity from the Test tab.
- **Physics**: Jolt integration with box / meshshape / convex-hull colliders, constraints,
  contact events (`Physics.touched`, `touchPersisted`, `touchRemoved`, `touchValidated`,
  `activated`, `deactivated`) emitted through per-entity `EventEmitter`
  (`PhysicsSystem.svelte.ts:70-197`). Dirty transforms teleport bodies; positions are read back
  after stepping (`PhysicsSystem.svelte.ts:351-438`).
- **Scripting**: Luau via wasmoon. `Vector3`, `Entity`/`Component` metatables, `getEntityById/ByName`,
  `game.inputManager.isKeyPressed` + `keyDown`/`keyUp` events, `entity:on/off/emit`.
  Coroutine scheduler with `wait()` (`ScriptScheduler.ts`).
- **Mesh rendering**: primitives + CSG custom geometry rendered into Three.js groups, consumes
  dirty flags (`MeshSystem.svelte.ts`).

What is blocking a demo game (each is expanded in the roadmap below):

1. Play mode is not launchable from the main UI and only exists in the Test tab.
2. Scripts on 2+ entities clobber each other (single shared `lua`/`currentScope`).
3. A freshly-authored script never runs (bootstrap requires a graph node + a `name`-matching block).
4. No camera control in play mode (static editor camera, `Runtime.svelte:182-187`).
5. No mouse/pointer input at all (`ScriptingSystem.svelte.ts:54-63` is keyboard-only).
6. No velocity/force API — scripts can only write `Transform.position` (teleport hack for a character).
7. Lua can only read/write `string` and `vector3` component data (`ScriptingSystem.svelte.ts:208-247`).
8. No runtime spawning, no global (non-entity) scripts, no persistence, no raycast/click events.

---

## 3. Roadmap

### Milestone 0 — Play mode is real (foundation)

Do this first. Everything else assumes a working, one-click play loop.

**0.1 Wire the Play button to actually run the game**
- Why: today the MenuBar Play button is cosmetic (fake save + shimmer); you must click
  Test tab → Play. Nobody making a game wants that friction on every iteration.
- Current: `MenuBar.svelte:281-298`; Test workspace has the real `toggleRuntime`.
- Build: a single "play the current world" entry point that switches to/opens the Test/Runtime
  view and calls `startRuntime()`, and a Stop that tears it down. One Run/Stop path only.

**0.2 Fix multi-script concurrency (critical)**
- Why: any demo game has 2+ scripted things (player, NPC, collectible). Today they break each other.
- Current: `ScriptingSystem` has one shared `this.lua` and `this.currentScope`
  (`ScriptingSystem.svelte.ts:32,37`); `__entityOn`/`__inputManagerOn` route through whatever the
  *current* scope is; `startScript` is called without `await` (`Runtime.svelte:249`).
- Build: one Lua engine + `StateScope` per scripted entity (the scope pattern already exists in
  `ScriptScheduler.ts`; just stop sharing it), a `Map<entityId, scope>` on the system, and register
  entity/input events against the owning scope instead of `this.currentScope`.

**0.3 Fresh scripts actually run**
- Why: a new game's first script must not silently no-op.
- Current: `startScript` walks a state graph and looks for a block whose `name` matches a node's
  `data.script` (`ScriptingSystem.svelte.ts:431-449`), but the default `ScriptData` block has no
  `name` field (`data.svelte.ts:86`).
- Build: a simpler fallback — if the script has one block, run it directly. Treat the state-machine
  walk as an advanced path, not a requirement.

---

### Milestone 1 — Player + camera (interactivity)

This is the milestone that turns "physics falls and settles" into "I can walk around."

**1.1 Scriptable camera + follow/third-person/FPS helpers**
- Why: BSS is third-person behind the player. No camera control = no game feel at all.
- Current: play camera is a fixed `PerspectiveCamera(45, ...)` at `(6,5,8)` with OrbitControls
  (`Runtime.svelte:182-187`), not exposed to Lua, not tied to any entity.
- Build:
  - A `Camera` component / entity type (there is a `camera` base type in `ecs.svelte.ts:7` but no
    factory). Camera entity carries `fov`, `near/far`, a mode (fixed / follow / fps).
  - A `CameraSystem` that updates a real THREE camera each frame from components.
  - Lua API: `game.camera.setPosition/setLookAt/getPosition/getYaw`, `game.camera.follow(entityId, offset, lerp)`,
    `game.camera.mode("fps" | "thirdPerson" | "fixed")`.
- Note: expose the camera *yaw* so scripts can do camera-relative movement (see 1.3).

**1.2 Mouse/pointer input to Lua**
- Why: BSS is click-driven (click flowers). Only keyboard exists today.
- Current: `keysPressed` Set + `inputManagerEvents` `keyDown/keyUp` on `window`
  (`ScriptingSystem.svelte.ts:54-63`); `__isKeyPressedJS` (`:302`).
- Build:
  - Track pointer position (normalized viewport coords), mouse buttons, scroll wheel.
  - Extend `game.inputManager`:
    - `isMouseButtonDown(button)`, `getMousePosition() -> Vector2`, `getMouseDelta() -> Vector2`
      (for look), `getScroll()`
    - events `mouseDown`, `mouseUp`, `mouseMove`, `scroll`
  - Optional pointer-lock helper for FPS look (`requestPointerLock` on canvas click).
  - Add a `Vector2` type to the Lua metatable set.

**1.3 Camera-relative movement math in Lua**
- Why: "move forward" should mean "away from the camera", not "+Z". This is the #1 thing that makes
  a character feel like a game.
- Build: Lua helpers, e.g. `Vector3.fromCameraYaw(yaw)` or a `game.camera.forward/right` API, plus a
  `Vector3:setYaw`, `Vector3:getYaw` / `lerp` to keep a character facing its movement direction.

**1.4 Player/character controller**
- Why: walking + jumping is the core loop of a BSS-style game.
- Current: nothing. Entities are rigid bodies with no grounded/jump concept.
- Build (two acceptable levels):
  - **Simple**: script-driven — read input, compute target velocity, write to a velocity API
    (Milestone 2.1) or transform each frame.
  - **Built-in (recommended later)**: a `CharacterController` component (speed, jumpForce, gravity
    factor) handled by a `MovementSystem`, so game makers don't hand-roll the same code per game.
- Expose `deltaTime` to Lua (`game.dt` or a `deltaTime` global) so movement isn't frame-rate dependent
  (today the scheduler only knows `wait(seconds)`).

---

### Milestone 2 — Physics gameplay API

**2.1 Velocity / force API**
- Why: the only ways to move a body today are teleporting the transform or it falling under gravity.
- Current: no `SetLinearVelocity`/`applyForce` anywhere; the transform-dirty teleport path is
  `PhysicsSystem.svelte.ts:352-400`.
- Build (bridge on `PhysicsSystem`, exposed to Lua via `entity.Physics` or `game.physics`):
  - `setLinearVelocity(entity, vec3)`, `getLinearVelocity(entity) -> vec3`
  - `applyForce(entity, vec3)` / `applyImpulse(entity, vec3)` / `applyTorque(entity, vec3)`
  - `isGrounded(entity) -> bool` (raycast straight down, or track contacts via `Physics.touched`)
  - `getPosition/getRotation` as plain reads (already implied by transform read-back).

**2.2 Physics component properties**
- Why: flowers/collectibles shouldn't collide or fall; the player needs a mass; floors need friction.
- Current: `Physics` component has only `enabled`, `anchored`, `customCollider`
  (`ecs.svelte.ts:126-150`); `customCollider` is never read by `PhysicsSystem`.
- Build: add `mass`, `friction`, `restitution`, `density`, `ccd`, `collisionGroup`, `kinematic`
  to the component and honor them when creating bodies in `PhysicsSystem` (setup path around
  `createPhysicsShape`, `PhysicsSystem.svelte.ts:486`).

**2.3 Raycast + entity click/hover**
- Why: clicking a flower to collect it, hovering an NPC, picking things up — all raycasts.
- Current: nothing in the runtime (editor `Renderer.svelte` has its own raycast for selection only).
- Build:
  - `game.raycast(from, direction, maxDist) -> { entityId, point, normal } | nil`
  - `game.physics.raycastAll(...)` variant
  - Entity events from the camera ray each frame: `entity:on("pointerEnter"/"pointerExit"/"pointerDown"/"pointerUp", ...)`
    — this requires a system that raycasts the camera ray against runtime bodies and emits via the
    per-entity `EventEmitter` (events already work end-to-end).

---

### Milestone 3 — World gameplay systems

**3.1 Runtime entity spawning / despawning from Lua**
- Why: collectibles must respawn, bees/particles appear, enemies spawn.
- Current: the runtime entity list is fixed at `startRuntime` time; systems hold `Map`s keyed by id
  and don't support add/remove.
- Build:
  - `game.spawn(modelId, position, rotation) -> entityId` and `game.destroy(entityId)`
  - Wire it through `ScriptingSystem → PhysicsSystem → MeshSystem` (each gets a real `spawnEntity`
    — currently `PhysicsSystem.spawnEntity` is an empty stub at `PhysicsSystem.svelte.ts:598`).
  - A `Destroyed` marker or tombstones so systems clean up bodies/groups.

**3.2 Full component data types in Lua**
- Why: scripts need to read/write `Physics.enabled` (boolean), colors, numbers, and JSON state.
- Current: `Component.__index/__newindex` only handle `string` and `vector3`, else warn
  (`ScriptingSystem.svelte.ts:208-247`).
- Build: map each `ComponentDataEntry.type` to a Lua value:
  - `number` → number, `boolean` → boolean, `color` → 0xRRGGBB int or table
  - `json`/`jsonList` → Lua table (with nested tables kept in sync, careful: either deep-copy or
    mirror by reference through a JS-side bridge)
  - `entity`/`model`/`script` → entity/asset wrappers (resolve via id, as `getEntityById` already does)

**3.3 Global / system scripts**
- Why: timers, day/night, economy, global currency — logic that isn't owned by one entity.
- Current: scripts are always attached to an entity via `startScript(entity)` and require a
  `Script` component.
- Build: a `game.scripts` concept — a `Script` attached to the game/world (not an entity), started by
  `Runtime` like entity scripts but with no entity context. The `StateScope`/scheduler machinery is
  already entity-agnostic.

**3.4 Script-to-script communication**
- Why: player collects pollen → currency global updates → NPC dialog unlocks → shop can buy. These
  are separate scripts talking to each other.
- Current: no cross-scope messaging; each scope has its own `StateScope` and (after 0.2) its own engine.
- Build:
  - A `game.eventBus` / `game.broadcast(eventName, ...)` on `ScriptingSystem` with
    `game.on("event", callback)` — routes to scopes via the existing deferred-dispatch path.
  - Optional: a lightweight shared global store (`game.state`) that all scopes read/write
    (a JSON object mirrored to JS) — this doubles as the save game state (Milestone 4).

**3.5 State-machine improvements (later)**
- Why: quests/NPCs need branching, not just a straight walk.
- Current: `startScript` does a single forward graph walk; no loops/conditions.
- Build later: node transitions on emitted events, conditions, shared state checks. Not required for
  the first demo.

---

### Milestone 4 — Game state & persistence

**4.1 Full project persistence**
- Why: today refresh loses everything (save is a fake `setTimeout`). Nobody iterates on a 30-min game
  without saving.
- Current: `triggerSave` cosmetic (`+page.svelte:179`); `handleSave` only regenerates a thumbnail
  (`ModelWorkspace.svelte:211`); menu items are cosmetic.
- Build: serialize `GameData` (worlds, models, scripts, components) to JSON; persist to `localStorage`
  first, structured for a backend later. Load on startup.

**4.2 Runtime game-state save/load**
- Why: "close and come back" — the demo must remember honey, owned bees, completed quests.
- Current: nothing; runtime entities are in-memory clones.
- Build:
  - A `game.save()` / `game.load()` or autosave that serializes:
    - persistent numeric/string/JSON game state (via 3.4's shared `game.state`)
    - respawned/collected entity state (which collectibles are taken, remaining count)
  - Keep it generic: an "save/load hook" per script (`onSave() -> table`, `onLoad(table)`) plus the
    built-in world-state snapshot.

**4.3 Data model for demo mechanics**
- Why: currency/inventory/quests need shape before UI.
- Build: as `json` fields on a `GameState`/world script (e.g. `stateData = { pollen=0, honey=0,
  bees={}, quests={} }`) with Lua accessors. No new core type needed if 3.2 lands; this is more about
  documenting the pattern than engine work.

---

### Milestone 5 — Demo-quality feel (after the game loop works)

- **Audio**: a small `AudioSystem` (play one-shot SFX + looping music from script;
  `game.audio.play("collect.wav")`), asset bucket in `GameData`. SFX/music are the cheapest way to
  make a demo feel like a game.
- **Respawn/timer helpers**: `game.schedule(fn, seconds)` / `game.after(seconds, fn)` on top of the
  scheduler; collectible respawn becomes one line.
- **Lights/environment presets**: a `Sky`/environment component (BSS has bright, cheerful worlds).
- **Error surfacing in the editor**: route Lua errors into a visible panel (or the SchedulerPanel)
  instead of only `console.error` — essential for iterating fast.
- **Particles/VFX**: optional; keep behind `game.particles` later.

---

## 4. Suggested build order (short version)

1. **M0**: real Play button + single-run path.
2. **M0**: multi-script scopes; fresh scripts run.
3. **M1**: mouse/pointer input + `game.camera` follow/FPS + camera-relative movement + `game.dt`.
4. **M1/M2**: `setLinearVelocity/applyForce/isGrounded` + movement helper (script-side player controller).
5. **M3**: full component types in Lua + `game.spawn/destroy` + global scripts + `game.state`/event bus.
6. **M4**: project persistence, then runtime save/load.
7. **M5**: audio, timers, error panel.

After ~steps 3–5 you can already build a playable vertical slice: walk a character, collect
respawning objects, accumulate currency, buy an upgrade that affects the world. That is the
30-minute demo loop.

## 5. Out of scope for now (explicitly)

- HUD / menus / shop / dialog UI (you'll add later; the data + events above are the hooks).
- Multiplayer / networking.
- Model/texture authoring improvements in the editor (works enough today).
- The old v1 engine — this roadmap only concerns the V2 rewrite.
