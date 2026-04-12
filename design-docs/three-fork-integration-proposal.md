# Three Fork Integration Proposal

**Date:** 2026-04-11
**Status:** Proposal

## Goal

Adopt a forked Three.js `WebGPURenderer` + TSL stack as the rendering substrate for Oscilla, while keeping Oscilla as the owner of user-facing patch semantics, live-modulation workflow, and graph authoring.

This proposal is intentionally product-first:

- Oscilla's value is the live visual instrument and ergonomic authoring experience.
- Oscilla does not need to win by owning a custom renderer, shader IR, or pipeline compiler.
- Three should be used where it reduces implementation surface and gives us a larger reusable corpus of geometry, materials, postprocessing, and WebGPU infrastructure.

Relevant current references:

- [design-docs/DEMO-PATCHES.md](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/design-docs/DEMO-PATCHES.md)
- [design-docs/gpu-ir-gap-analysis.md](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/design-docs/gpu-ir-gap-analysis.md)
- [design-docs/renderer-webgpu-coverage-audit.md](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/design-docs/renderer-webgpu-coverage-audit.md)

External references:

- [Three WebGPU renderer manual](https://threejs.org/manual/en/webgpurenderer)
- [TSL docs](https://threejs.org/docs/TSL.html)
- [NodeBuilder docs](https://threejs.org/docs/pages/NodeBuilder.html)
- [WGSLNodeBuilder docs](https://threejs.org/docs/pages/WGSLNodeBuilder.html)
- [Renderer docs](https://threejs.org/docs/pages/Renderer.html)
- [LoadingManager docs](https://threejs.org/docs/pages/LoadingManager.html)
- [GLTFLoader docs](https://threejs.org/docs/pages/GLTFLoader.html)
- [TextureLoader docs](https://threejs.org/docs/pages/TextureLoader.html)
- [NodeMaterialLoader docs](https://threejs.org/docs/pages/NodeMaterialLoader.html)

## 1. Ownership: Oscilla vs Three

### Oscilla should own

`// [LAW:one-source-of-truth]` Oscilla must remain the canonical owner of user intent.

- Patch graph authoring model
  - [src/graph/Patch.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/graph/Patch.ts)
  - [src/pillars/types.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/pillars/types.ts)
- Graph editor and future non-graph authoring UX
  - [src/ui/graphEditor](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/ui/graphEditor)
- Domain concepts
  - instance domains
  - generator / modifier / intent semantics
  - modulation routing
  - solver resources as author-facing concepts
- Patch compilation from user graph to backend-neutral execution plan
  - current seam starts in [src/pillars/compile.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/pillars/compile.ts)
- Runtime lifecycle, patch swapping, persistence, fault handling
  - [src/services/RuntimeService.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/services/RuntimeService.ts)

### Three should own

`// [LAW:single-enforcer]` General shader/material/post/geometry execution should have one owner.

- Scene graph and render object lifecycle
- WebGPU pipeline construction and binding orchestration
- TSL material, postprocessing, and compute node graphs
- Built-in geometry/material/effect ecosystem
- Asset loaders and runtime asset decoding
- General-purpose shader authoring surface

### What this means in practice

Oscilla should not keep widening the current custom boundary contract into a full general shader language. Three/TSL should become the general render/compute authoring substrate. Oscilla should compile patch semantics into Three-facing render plans.

## 2. Integration Points in the Existing Application

These are the best insertion points in the codebase as it exists today.

### 2.1 Patch graph and frontend normalization

- User patch model:
  - [src/graph/Patch.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/graph/Patch.ts)
  - [src/pillars/types.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/pillars/types.ts)
- Frontend normalization:
  - [src/pillars/frontend/normalized-graph.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/pillars/frontend/normalized-graph.ts)
  - [src/compiler/frontend/draft-graph.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/compiler/frontend/draft-graph.ts)

Proposal:

- Keep this layer as-is conceptually.
- Do not expose Three node classes or scene objects in the user patch model.
- Add backend-neutral semantic outputs from normalization/lowering rather than directly producing the current Rust payload shape.

### 2.2 Pillars lowering and assembly

- Current compiler entry:
  - [src/pillars/compile.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/pillars/compile.ts)
- Current block ABI:
  - [src/pillars/block-api.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/pillars/block-api.ts)
- Current payload assembly:
  - [src/pillars/assembly/payload.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/pillars/assembly/payload.ts)

Proposal:

- Replace `PipelineInstallPayload` as the primary assembly target.
- Introduce a backend-neutral `RenderPlan` / `ScenePlan` layer.
- Add a Three backend assembler that lowers Oscilla semantics into:
  - scene objects
  - geometry refs
  - material refs
  - post chain refs
  - compute jobs

### 2.3 Runtime boundary

- Runtime orchestrator:
  - [src/services/RuntimeService.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/services/RuntimeService.ts)
- Renderer facade:
  - [src/render/index.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/render/index.ts)
  - [src/render/webgpu/index.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/render/webgpu/index.ts)

Important current fact:

- The exported WebGPU renderer is currently a stub in [src/render/webgpu/index.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/render/webgpu/index.ts).

Proposal:

- Keep the `createWebGPURenderer()` seam.
- Rebuild that seam as a `ThreeForkRenderer` implementation first.
- Do not route the first steel thread through the Rust worker boundary.

### 2.4 Worker / Rust boundary

- Current worker:
  - [src/render/rust/engine.worker.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/render/rust/engine.worker.ts)
- Current Rust/WASM stack:
  - [src/render/wasm/rust/oscilla-rust-renderer](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/render/wasm/rust/oscilla-rust-renderer)

Proposal:

- Treat this as a replaceable backend, not the long-term center of the architecture.
- Keep it available only where a future Oscilla-specific GPU feature needs a path Three cannot serve.
- Do not keep evolving vm4-style IR expansion as the main strategy if the Three migration is approved.

## 3. Oscilla Graph vs Three Node Graph

This is the most important conceptual distinction.

### Oscilla graph today

The current graph is a user-intent graph:

- block instances
- exposed ports
- authored controls
- lenses
- generator / modifier / intent semantics
- patch serialization and undoable state

Relevant files:

- [src/graph/Patch.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/graph/Patch.ts)
- [src/ui/graphEditor/types.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/ui/graphEditor/types.ts)

### Three node graph

Three's node graph is not a patch-editor graph. It is a render/compiler graph for:

- shader expressions
- material graphs
- postprocessing chains
- compute graphs
- per-object/per-frame update hooks

It is closer to an internal shading/computation graph than to Oscilla's user-facing patch model.

### Alignment

There is strong alignment at the semantic level:

- Oscilla fields / expressions align with TSL expressions
- Oscilla materials align with `NodeMaterial` and TSL material nodes
- Oscilla solver resources align with TSL compute + storage resources
- Oscilla fullscreen/post pipelines align with Three postprocessing pass nodes

### Difference

There is weak alignment at the authoring-graph level:

- Oscilla graph nodes are user concepts
- Three nodes are renderer/shader/compiler concepts

### Reuse recommendation

`// [LAW:locality-or-seam]` Reuse Three nodes inside the backend, not as the user graph.

What we can reuse:

- `NodeMaterial`
- TSL expression and function composition
- compute nodes
- postprocessing nodes
- builder/runtime machinery such as `NodeBuilder`, `WGSLNodeBuilder`, and `NodeFrame`
- serialized node materials where useful through `NodeMaterialLoader`

What we should not reuse directly:

- Three's internal node graph as the editor's canonical graph model
- Three node IDs / classes as user patch objects
- Three scene object graphs as patch serialization format

## 4. Data Model Changes Needed to Align with Three

The current data model is too renderer-specific in some places and not explicit enough in others.

### 4.1 Separate user patch model from backend execution model more aggressively

Today the pipeline still trends toward:

- user patch -> normalized graph -> lowered graph -> Rust boundary contract

Proposal:

- user patch -> normalized graph -> backend-neutral scene/render plan -> Three backend

The current `ManifestContribution`, `LoweredBundle`, and `LoweredIntent` types in [src/pillars/block-api.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/pillars/block-api.ts) are already oriented toward the current custom renderer contract. That needs to be loosened.

### 4.2 Introduce first-class asset references

Today many resources are still effectively inline declarations:

- textures
- shapes
- samplers
- manifests

Proposal:

- Add stable `AssetId` references in the authored/compiled model for:
  - geometry assets
  - texture assets
  - material assets
  - model assets
  - node-material assets
  - palette assets
  - audio-reactive analysis assets if needed later

### 4.3 Add backend-neutral render resource types

Oscilla should have its own canonical runtime resource concepts:

- `GeometryRef`
- `MaterialRef`
- `TextureRef`
- `SceneObjectRef`
- `ComputeResourceRef`
- `PostChainRef`

These should be backend-neutral handles in the compiled plan, even if the initial backend implementation is a Three object.

### 4.4 Expand block outputs beyond bundle-only assumptions

Current lowering is centered on `SourceBundle` and render intents. That is good for the current Pillars shape, but it is too narrow for alignment with Three.

Proposal:

- Keep `SourceBundle` for field/domain semantics
- Add explicit output categories for:
  - geometry-producing nodes
  - material-producing nodes
  - texture/resource-producing nodes
  - scene-object-producing nodes
  - post/compute chain-producing nodes

### 4.5 Keep the user graph free of backend artifacts

Do not store in patch data:

- Three UUIDs
- object references
- material JSON blobs as the canonical patch representation
- scene graph layout as authored truth

Patch data should reference assets and semantic blocks, not renderer internals.

## 5. How Three Assets Are Managed

### 5.1 General Three asset management

Three's built-in approach is:

- `LoadingManager` tracks asset loading and allows URL rewriting and grouped loading.
- Format-specific loaders decode assets:
  - `TextureLoader`
  - `GLTFLoader`
  - many others
- loaded resources become runtime objects such as:
  - `Texture`
  - `BufferGeometry`
  - `Material`
  - `Scene`

Three also supports:

- URL indirection via `LoadingManager.setURLModifier()`
- plugin registration on some loaders such as `GLTFLoader.register()`
- JSON-based node-material parsing via `NodeMaterialLoader`

### 5.2 Proposed asset model inside Oscilla

Oscilla should own a project-level asset registry and use Three only as the decoder/runtime layer.

Proposal:

- Add an `AssetRegistry` service owned by Oscilla
- Persist assets in app/project space, not only in browser local storage
- Store authoring references by stable `assetId`
- Store metadata separately from decoded Three runtime objects

Suggested asset categories:

- `image`
- `texture`
- `palette`
- `geometry`
- `model`
- `material`
- `nodeMaterial`
- `audioSource`
- `videoSource`

Suggested split:

- Authoring store:
  - stable IDs
  - labels
  - import metadata
  - tags
  - patch references
- Runtime cache:
  - loaded `Texture`
  - loaded `BufferGeometry`
  - loaded glTF scenes
  - compiled node materials

### 5.3 Proposal for this app specifically

`// [LAW:one-source-of-truth]` Asset ownership should be centralized in one Oscilla service, not scattered across blocks or loaders.

Recommended design:

- `AssetRegistry`
  - canonical metadata, IDs, import paths, ownership
- `AssetRuntimeCache`
  - resolved Three runtime objects keyed by `assetId` + variant
- `ThreeLoadingBridge`
  - the only place that knows about `LoadingManager`, `TextureLoader`, `GLTFLoader`, and fork-specific loader behavior

Patch blocks should refer to assets by ID. They should never create ad hoc runtime loader instances themselves.

## 6. First Steel Thread

The steel thread should prove the architecture, not chase maximum features.

### Goal

Get one Oscilla patch rendering live through a forked Three backend in the existing app shell.

### Recommended first steel thread

Use a simple Pillars patch from [design-docs/DEMO-PATCHES.md](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/design-docs/DEMO-PATCHES.md):

- `Grid of Squares` or `Spirograph Trace`

Why:

- no solver complexity
- no postprocessing requirement
- no external assets required
- exercises live animation and per-instance variation
- still proves the core user value

### Concrete first slice

1. Add a forked Three package to the workspace.
2. Implement a new renderer backend behind [src/render/index.ts](/Users/bmf/.codex/worktrees/356b/oscilla-animator-v2/src/render/index.ts).
3. Keep `RuntimeService` as the owner of lifecycle.
4. Bypass the Rust worker for the first slice.
5. Add a minimal backend-neutral `ScenePlan` that can represent:
   - one instanced shape
   - one material
   - one time-driven modulation input
6. Compile one known fixture into that plan.
7. Render it with:
   - `InstancedMesh` or `Points`
   - a simple TSL/NodeMaterial path
   - time updates from the existing animation loop

### Suggested exact path

- Authoring input:
  - existing Pillars fixture or a single hardcoded `PillarPatch`
- Compile:
  - `compilePillarPatch()` still runs
  - add an alternate assembler path to produce `ScenePlan`
- Runtime:
  - `RuntimeService` creates `ThreeForkRenderer`
- Render:
  - one canvas
  - one scene
  - one camera
  - one instanced object
  - one animated material

### Success criteria

`// [LAW:verifiable-goals]` The first steel thread succeeds when:

- the app boots with the existing runtime shell
- `createWebGPURenderer()` returns a real Three-backed renderer instead of the current stub
- one known patch renders continuously on the canvas
- time-based modulation updates visibly every frame
- no Rust worker / WASM renderer is required for the steel thread
- the patch still originates from Oscilla's authored graph model, not a hand-authored Three scene

## 7. Recommendation

Proceed with a forked Three backend.

Not because Oscilla should become a Three app, but because Oscilla should stop paying to own infrastructure that does not define the product.

Recommended sequence:

1. Add the proposal-approved backend seam: `ScenePlan` and `ThreeForkRenderer`.
2. Land the first steel thread with one demo patch.
3. Add asset registry + runtime cache.
4. Move material/post/compute semantics toward TSL-backed implementations.
5. Re-evaluate the remaining custom Rust renderer scope after the steel thread is working.

The main non-goal is important:

- do not transplant Three's internal node graph into the user-facing patch graph

The goal is to use Three as the execution engine while keeping Oscilla's authoring semantics and UX fully product-owned.
