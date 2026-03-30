# B0: 4-Pillar Architecture (Canonical)

Status: Canonical source for 4-pillar architecture extracted from `design-docs/B1-Block-Library-RAW.md`.
Scope: Block-library architecture, IR boundaries, modulation rules, and hard constraints.

```txt
// [LAW:one-source-of-truth] This file is the authoritative spec for 4-pillar architecture decisions previously embedded in chat transcripts.
// [LAW:one-type-per-behavior] The architecture defines one RenderSource abstraction with variants, not parallel per-family systems.
// [LAW:dataflow-not-control-flow] Runtime variability is represented in data/bindings, not dynamic block-routing control flow.
// [LAW:single-enforcer] Memory layout and byte/offset resolution are enforced in Rust/WASM MMU, not duplicated in JS lowering.
```

## 1. Why This Exists

The old direction (`RenderIntent.paramBindings`) created a "God Object" by mixing data creation and data presentation responsibilities.

Canonical fix:
- Deprecate monolithic `RenderIntent` ownership of generation params.
- Split responsibilities into 4 composable pillars aligned to strict terminology:
  - Source = Noun (produces data)
  - Material = Adjective (describes appearance)
  - Intent = Verb (issues draw/dispatch instruction)

## 2. Core Model

### 2.1 Pillar 1: Generators (`RenderSource`)

Purpose: Introduce physical/mathematical data topology and own generation bindings.

Variants:
- `TopologySource`
- `ParametricTemplateSource`
- `FieldSource`
- `SolverResourceSource`

Contract:
- Owns source parameters (e.g., `radius`, `viscosity`, `t_step`, resolution).
- Emits `ResourceProxyId`.

```ts
interface RenderSource {
  kind: 'Topology' | 'Parametric' | 'Field' | 'SolverResource';
  sourceBindings: Map<SemanticId, ValueExprId>;
  output: ResourceProxyId;
}
```

### 2.2 Pillar 2: Modifiers (Signal / Spatial Processors)

Purpose: Transform resource proxies between generation and rendering.

Contract:
- Input: `ResourceProxyId`
- Performs compute/math using its own bindings.
- Output: new/updated `ResourceProxyId`

Notes:
- This is where transforms like `positionX/positionY/rotation` are applied (not in `RenderIntent`).
- Modifiers are the canonical place for procedural and legacy formula injection.

### 2.3 Pillar 3: Materials (Surface Evaluators)

Purpose: Evaluate appearance independent of source family.

Contract:
- Owns visual bindings (e.g., hue, roughness, emissive).
- Emits `MaterialProxyId`.

```ts
interface Material {
  kind: 'ShaderAST' | 'ComputeComposite';
  materialBindings: Map<SemanticId, ValueExprId>;
  output: MaterialProxyId;
}
```

### 2.4 Pillar 4: Render Sink (`RenderIntent`)

Purpose: Terminal instruction that pairs source + material + presentation state.

Contract:
- Thin by design.
- No generation bindings.
- Only presentation/raster state (e.g., blend/depth/camera binding when needed).

```ts
interface RenderIntent {
  source: ResourceProxyId;
  material: MaterialProxyId;
  intentBindings: Map<'blendMode' | 'depthTest', ValueExprId>;
}
```

## 3. Data Types and Proxy Taxonomy

Base dataflow primitives:
- `Scalar<T>`: uniform-like per-frame value.
- `Field<T>`: per-lane/per-thread value.

Resource proxies (Pillars 1-2):
- `GeometryTopology`
- `ParametricTemplate`
- `ParticlePool` / `InstancePool`
- `SolverResource`

Presentation proxies (Pillars 3-4):
- `MaterialProxy`
- `RenderIntent` (terminal command, no downstream proxy)

## 4. Compiler and Runtime Boundary

### 4.1 Non-negotiable boundary

- JS/TS compiler elaborates typed graph and lowers to serializable symbolic IR.
- JS/TS does not own physical GPU byte math, alignment, or final offsetting.
- Rust/WASM MMU resolves symbolic fields to physical layout and patches shader IR.

```txt
// [LAW:single-enforcer] MMU in Rust is the only enforcer for physical memory layout.
```

### 4.2 Blocks are not 1:1 with shaders

A block may lower to:
- zero shader stages,
- a snippet injected into shared shader structure,
- or multiple sequential compute passes.

### 4.3 Pure lowering contract

Lowering functions are referentially transparent and return records (no builder side effects required by architecture).

```ts
interface LoweredBlock {
  outputProxy: ResourceProxyId | MaterialProxyId | null;
  arenaRequests: ArenaFieldRequest[];
  textureRequests: TextureRequest[];
  computePasses: CompiledComputePassSpec[];
  renderIntents?: RenderIntentSpec[];
}
```

## 5. Scheduling and Modulation Semantics

- Scheduler topologically orders passes so dependencies resolve by execution order.
- Modulation ownership is local to the block that consumes it:
  - source params in sources,
  - transform params in modifiers,
  - surface params in materials,
  - raster/presentation params in intent.
- This yields total modulation without cross-pillar coupling.

### 5.1 Architecture outcomes (canonical terms)

- **Total Modulation:** all relevant parameters are modulatable at their owning pillar boundary.
- **Zero Duplicate Code:** one draw/intent family composes arbitrary `ResourceProxyId` + `MaterialProxyId` pairs (no per-source render block duplication).
- **Future-Proofing:** new procedural systems integrate as source/modifier/material additions without changing sink semantics.

## 6. Boundaries and Constraints

### 6.1 Supported at frame rate

The model supports modulating values at runtime, including:
- per-instance position/rotation/color fields,
- active instance count,
- camera/global uniforms.

### 6.2 Structural changes require rebuild

Runtime does not modulate structure. Changes below require `REBUILD_GPU_PIPELINES`:
- topology resolution/buffer-size changes,
- variable-length data-dependent spawning that requires dynamic allocation,
- dynamic graph topology changes (block bypass/injection).

```txt
// [LAW:dataflow-not-control-flow] Do not express graph-level variability as runtime branchy block routing.
```

### 6.3 Canonical workaround for variable spawn effects

Use deterministic fixed-capacity pools with activation/deactivation logic (value modulation), not dynamic allocation.

### 6.4 InstanceDomain canonical behavior

`InstanceDomain` owns cardinality and exports intrinsics:
- `index`: absolute lane/thread id domain (integer-seed semantics).
- `rank`: normalized `0..1` domain (phase/interpolation semantics).

Cardinality model:
- allocation ceiling is fixed for the compiled artifact,
- active lane count is value-modulated at runtime,
- indirect draw uses active count while inactive tail lanes remain allocated.

### 6.5 Camera/global context handling

Camera is global context, not a source/material/intent block responsibility.

Canonical handling:
- camera/global params map to dedicated global frame/header uniform semantics,
- intent variants may optionally accept explicit camera references for advanced workflows,
- pillar ownership rules stay unchanged.

### 6.6 Uniform vs field lowering semantics

Lowering distinguishes:
- uniform-like requirements (must be dispatch-constant),
- field/varying requirements (may vary per lane).

This distinction belongs to typed elaboration + lowering semantics, not runtime heuristics.

## 7. Guardrails (Must Enforce)

- Never rediscover source kind at runtime; carry metadata in IR.
- `RenderIntent` must reject source/material-owned semantics.
- Modifiers/sinks route by proxy ID; they do not inspect upstream internals.
- Keep one `Draw` family that accepts any `ResourceProxyId` + `MaterialProxyId` (avoid type-specific render block explosion).

## 8. Acceptance Criteria for This Architecture

The implementation is compliant when all are true:
1. No block type outside Pillars 1-4 owns semantics that belong to another pillar.
2. `RenderIntent` is thin and free of source/material generation bindings.
3. JS lowering emits symbolic, serializable IR only.
4. Rust/WASM MMU is the sole resolver of byte size/offset/alignment.
5. Runtime pass execution is static in shape; variability is in values.

## 9. Source Extraction Map

Primary extraction anchors in `design-docs/B1-Block-Library-RAW.md`:
- Problem + 4 pillars: ~38-109, ~245-344
- Canonical ARD framing: ~221-233
- Guardrails: ~353-361
- Modulation boundaries (instance/camera/limits): ~375-435
- Shader/pass boundary (blocks not 1:1 shaders): ~580-582
- Pure lowering + semantic proxy taxonomy: ~1148-1241
- Material+Intent terminal role and schedule: ~1249-1424
