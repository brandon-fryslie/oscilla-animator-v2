# Canonical Authoring Architecture Design Prompt

You are starting with fresh context in the `oscilla-animator-v2` repository.

Your job is to extend or refine the new canonical authoring/render architecture without regressing into the old patch-era render model.

This is not a prompt to “make something work however possible.”

This is a prompt to preserve the architectural principles already established in the new design docs.

## Core Intent

Design from renderer and authoring semantics, not from legacy patch wiring.

The system should let users modulate everything important in realtime, while the engine automatically lowers that intent into the correct renderer-facing data.

Users should author:

- resources
- modulation
- simulation
- scene assembly
- outputs

Users should not author:

- sink tables
- arena slots
- shape-bank headers
- draw packets
- backend ABI details

## Mandatory Design Principles

These are the principles you must preserve.

### 1. Scene Intent Above Renderer Transport

Authoring describes scene intent. Lower layers derive renderer transport.

Do not push runtime or backend vocabulary upward.

`// [LAW:one-way-deps]` Backend details stay below authoring.

### 2. One Canonical Render Boundary

There is one canonical render boundary:

- `SceneRenderSink`
- `RenderPrimitive[]`
- `RenderView`
- `ExtractedScenePacket`
- `RenderPrepare`
- `DrawQueueBuilder`

Do not invent alternative sink models or parallel render-boundary contracts.

`// [LAW:one-source-of-truth]` There must be one authoritative scene-to-render contract.

### 3. Structured Authoring Layers, Not Flat Graph Soup

The authoring architecture has explicit layers:

1. Resources
2. Modulation
3. Scene Assembly
4. Outputs

Physics extends resources and scene assembly; it does not create a new top-level architecture.

Do not collapse these layers back into a single undifferentiated graph.

### 4. Finite Vocabulary At The Architecture Level

Top-level authoring categories are finite.

Extend existing families before creating new top-level categories.

`// [LAW:one-type-per-behavior]` New categories require proof that existing families cannot model the behavior.

### 5. Binding Sets Are The Only Value-To-Scene Bridge

Live modulation/simulation values enter scene assembly only through explicit binding sets and view bindings.

Do not introduce:

- hidden render outputs
- implicit property discovery
- magic port naming
- renderer-facing side channels

`// [LAW:single-enforcer]` Binding sets are the single authoring boundary for value-to-scene binding.

### 6. Emitters Own Cardinality

Only emitters decide how many primitives or bodies exist.

Resources define identity. Emitters define multiplicity.

### 7. Simulation Produces Domains, Not Renderer Records

Simulation should compile to authoritative dynamic domains that scene assembly consumes.

Do not expose:

- arena channel names
- constraint banks
- batch IDs
- dispatch loops

to authoring.

### 8. UI Must Reflect The Architecture

The appropriate UI is a layered workspace model, not one giant canvas containing every concept.

Resources, modulation, simulation, scene, and output should remain visibly distinct.

## Mandatory Inputs To Read

Read these first:

- `/Users/bmf/.codex/worktrees/6510/oscilla-animator-v2/docs/WebGPU-Future/CANONICAL-RENDER-SINK-DESIGN.md`
- `/Users/bmf/.codex/worktrees/6510/oscilla-animator-v2/docs/WebGPU-Future/CANONICAL-PATCH-STRUCTURE-DESIGN.md`
- `/Users/bmf/.codex/worktrees/6510/oscilla-animator-v2/docs/WebGPU-Future/CANONICAL-AUTHORING-MODEL-DESIGN.md`
- `/Users/bmf/.codex/worktrees/6510/oscilla-animator-v2/docs/WebGPU-Future/CANONICAL-AUTHORING-GUARDRAILS.md`
- `/Users/bmf/.codex/worktrees/6510/oscilla-animator-v2/docs/WebGPU-Future/CANONICAL-AUTHORING-BLOCK-CATALOG.md`
- `/Users/bmf/.codex/worktrees/6510/oscilla-animator-v2/docs/WebGPU-Future/CANONICAL-AUTHORING-UI-DESIGN.md`
- `/Users/bmf/.codex/worktrees/6510/oscilla-animator-v2/docs/WebGPU-Future/CANONICAL-PHYSICS-AUTHORING-DESIGN.md`
- `/Users/bmf/.codex/worktrees/6510/oscilla-animator-v2/docs/WebGPU-Future/CANONICAL-IMPLEMENTATION-ROADMAP.md`

When relevant, also read:

- `/Users/bmf/.codex/worktrees/6510/oscilla-animator-v2/docs/WebGPU-Complete/shapes/Shapes 0_ Shape Taxonomy_ A Rendering Overview.md`
- `/Users/bmf/.codex/worktrees/6510/oscilla-animator-v2/docs/WebGPU-Complete/P6-1__GPU_Physics_Engine_with_Compute_Shaders.md`

## What To Preserve

Preserve these outcomes:

- users can modulate everything important in realtime
- render classes remain lower-layer geometry/material/runtime concerns
- the patch model stays aligned with the render pipeline
- authoring stays declarative and typed
- simulation stays first-class without leaking runtime transport upward
- UI stays structured by authoring layer

## What To Avoid

Do not do any of the following:

1. Do not reintroduce sink-shaped authoring such as `shape + posX + rot + color` as the primary model.
2. Do not add hidden render outputs to authoring blocks.
3. Do not make renderer transport types visible in the authoring graph.
4. Do not treat resources, modulators, bindings, emitters, scenes, and outputs as interchangeable loose blocks with no family semantics.
5. Do not invent a parallel authoring path that bypasses `SceneRenderSink`.
6. Do not propose “one giant graph editor for everything” as the default UI.
7. Do not solve a new feature by creating a second source of truth for geometry, material, view, or simulation state.

## Expected Working Method

1. Start from the established render boundary and authoring layers.
2. Identify which existing family the new concept belongs to.
3. If it doesn’t fit, prove why.
4. Preserve ownership boundaries.
5. Make every new type, block, or UI element legible in terms of:
   - what it owns
   - what it consumes
   - what it emits
   - which layer it belongs to
6. Keep migration practicality in mind, but do not let compatibility define the architecture.

## Output Quality Bar

You are done only when your design:

- is consistent with the existing `WebGPU-Future` design stack
- respects the architectural laws and boundaries above
- does not reintroduce the legacy render-boundary mistakes
- is explicit about ownership
- is explicit about what layer the concept belongs to
- is concrete enough to implement or ticket
