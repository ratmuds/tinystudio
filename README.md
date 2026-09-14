# tinystudio

![Screenshot of Engine](/static/readme/engineScreenshot.png)

# Status: Proof of Concept

This engine is just me exploring what an engine would look like if I designed it to be how I like it. It has many architectural flaws that would require significant rewrites to fix, and the code isn't very clean in some areas, but I'm pretty happy with how it turned out.

This means there isn't proper tests and documentation, but feel free to clone the repo and explore the demo projects :)

There are significant limitations with this engine, especially with the runtime in general.

## Demo (hopefully still working?)
[https://tinystudio.ratmud.studio/](https://tinystudio.ratmud.studio/)

# Basic Video (no audio)


https://github.com/user-attachments/assets/d691c3f3-5595-4b22-bd1a-a0482c8c9b7b


# What Is It?

This engine sort of combines what I like from Roblox Studio and Godot. It uses Lua and has a basic ECS, scripting system & scheduler, model prefab system, physics, and retro shader renderer. I wanted to design it to be able to prototype games as fast as possible, so the model workspace mainly is similar to Roblox Studio by being based around Models and CSG operations like combining and subtracting objects from each other.

I also tried to keep the UI looking somewhat modern, although a lot of the ECS properties ended up looking pretty basic as this is just a prototype :)

# Features

- **CSG 3D Modeling:** Union and subtract geometry in the browser (powered by Manifold 3D) with face selection and transform gizmos. ![GIF](/static/readme/tinystudio_csg.gif)
- **Entity Component System:** Simple ECS setup for parts, models, lights, cameras, physics, and scripts. ![GIF](/static/readme/tinystudio_ecs.gif)
- **Physics (Jolt):** Rigid bodies, collision callbacks (`touched`) ![GIF](/static/readme/tinystudio_physics.gif)
- **Lua Scripting:** In-browser Lua runtime (via Wasmoon) with cooperative coroutines, lifecycle hooks, and a task scheduler. ![GIF](/static/readme/tinystudio_scripting.gif)
- **Code Editor:** Embedded Monaco editor for editing code with custom styling.
- **Visual State Machines:** Simple node-based state graphs using Svelte Flow. ![GIF](/static/readme/tinystudio_statemachine.gif)
- **Scheduler & Profiler Panel:** Real-time execution monitor with graphs to track script CPU time and coroutine states. ![GIF](/static/readme/tinystudio_scheduler.gif)
- **Basic UI System:** Create and edit UI elements in the editor. (Currently basic and limited) ![GIF](/static/readme/tinystudio_ui.gif)
- **Demo Projects:** Save/load project files as JSON, with a few sample scenes (Lunar Lander, Platformer, Physics sandbox). ![GIF](/static/readme/tinystudio_demos.png)

# How to Run?

```sh
pnpm install
pnpm run dev
```

# AI Usage

I used Google Gemini for debugging and refactoring my code when it got super messy. Some small parts I made it do, like the scheduler profiler page and graphs.
