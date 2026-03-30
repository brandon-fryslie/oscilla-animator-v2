# B0: The 4-Pillar Node Abstraction

**Status:** Canonical Reference
**Subject:** Block library architecture for composable, fully-modulatable rendering pipelines
**Consolidated from:** B0-4-Pillar-Arch.md, B0-4-Pillar-Arch-Codex.md, B0-4-Pillar-Arch-Gemini1.md, B0-4-Pillar-Arch-Gemini2.md, B0-4-Pillar-Arch-ChatGPT.md

---

## 1. Architectural Invariants (The Laws)

```txt
// [LAW:dataflow-not-control-flow] Variability is in compiled data arrays and compute dispatches, not runtime if/else by feature type.
// [LAW:one-source-of-truth] The compiler's artifacts (Manifest + Pass Roster) are authoritative. Rust never re-derives or guesses.
// [LAW:single-enforcer] Invariants (memory limits, routing maps) are enforced exactly once at the compile/rebuild boundary, never in the per-frame hot loop.
// [LAW:one-type-per-behavior] No parallel renderers. Everything compiles to the same primitive pass execution model.
```

---

## 2. The Problem: The "God Object" Trap

The previous design routed all parameter bindings through a single `RenderIntent`:

```
RenderIntent.paramBindings: semanticId -> valueRef  // WRONG — God Object
```

This couples *creation* of data with *presentation* of data. If `RenderIntent` manages bindings for a dynamic waveform generator *and* the color mapping *and* the render state, the node UI becomes tangled and the compiler IR validation becomes a nightmare.

**Example failure:** If a user drops a `FluidSolver` block and wires it to a `Render` block, `RenderIntent` should not own the fluid's `dyeDissipation` parameter. The `FluidSolver` block owns its generation parameters; `RenderIntent` only manages how to draw the final texture.

### Fix: Strict Linguistic Categories

| Category | Linguistic Role | Responsibility |
|----------|----------------|----------------|
| **Source** | Noun | Produces raw data (Geometry, SDFs, Fluid Textures) |
| **Material** | Adjective | Describes surface visual properties (Color, Emission, Thickness) |
| **Intent** | Verb | An instruction to the engine ("Dispatch this pass", "Draw this data") |

Modifiers (Pillar 2) sit between Nouns and Verbs as data transformers — they have no linguistic assignment because they are pipeline operators, not semantic endpoints.

---

## 3. The 4-Pillar Architecture

Each pillar owns its own parameter bindings exclusively. No pillar reaches into another's domain.

### Pillar 1: Generators (`RenderSource`)

Generators introduce physical or mathematical data topology into the pipeline. They exclusively own their structural bindings and emit a generic proxy handle.

**Sum Types:**

| Source Kind | Description | Examples |
|-------------|-------------|----------|
| `TopologySource` | Static/indexed topology + per-instance param lanes | `RectangleTopology`, `StarTopology`, `PointTopology` |
| `ParametricTemplateSource` | Type 2 continuous math domains | `CubicBezierRibbon2D`, `ClosedBlob2D` |
| `FieldSource` | Continuous mathematical fields sampled at runtime | SDF volumes, noise fields |
| `SolverResourceSource` | Products of a simulation pass | Eulerian fluid textures, pressure grids |

**IR Contract:**

```typescript
interface RenderSource {
    kind: 'Topology' | 'Parametric' | 'Field' | 'SolverResource';
    sourceBindings: Map<SemanticId, ValueExprId>;  // Generator exclusively owns these
    output: ResourceProxyId;
}
```

**Key property:** The generator owns its generation parameters (e.g., `radius`, `viscosity`, `t_step`, `resolution`). These are never exposed to downstream blocks.

### Pillar 2: Modifiers (Signal / Spatial Processors)

Modifiers sit strictly between Generators and Sinks. They take a proxy, apply a compute kernel, and output a modified proxy.

**Examples:** `TwistGeometry`, `AdvectFluid`, `RemapFieldLUT`, `TransformInstances`, `EjectFluidSpray`, `WindField`.

**IR Contract:** Takes a `ResourceProxyId`, applies math via its own `paramBindings`, outputs a new `ResourceProxyId`.

**Key properties:**
- Because WebGPU naturally maps instance cardinality to compute threads, modifiers act as implicit vectorization maps — they warp space or structure before rendering without knowing the underlying source kind.
- Transforms like `positionX/positionY/rotation` are applied here (not in `RenderIntent`).
- This is the canonical place for procedural and legacy formula injection (e.g., Milkdrop per-vertex equations).

### Pillar 3: Materials (Surface Evaluators)

Materials evaluate surface visual properties. They are entirely agnostic to whether they are painting a rigid mesh, a parametric ribbon, or a 2D fluid quad.

**Examples:** `MatCap2.5D`, `FluidColorWarp`, `BasicUnlit`, `UnlitMaterial`, `SprayDroplet`.

**IR Contract:**

```typescript
interface Material {
    kind: 'ShaderAST' | 'ComputeComposite';
    materialBindings: Map<SemanticId, ValueExprId>;  // Material exclusively owns these
    output: MaterialProxyId;
}
```

**Key property:** Materials request data from their attached source via semantic names (e.g., `"age"`, `"vel_x"`), not physical memory addresses. They do not inspect or unpack the source's internal bindings.

### Pillar 4: The Render Sink (`RenderIntent`)

The final, incredibly thin instruction block. This is the *only* block that generates a `RenderIntent`. It zips a Source and a Material together and hands them to the Rust backend's pass roster.

**Examples:** `DrawInstances`, `DrawFullScreenQuad`, `DrawToTexture`.

**IR Contract:**

```typescript
interface RenderIntent {
    source: ResourceProxyId;
    material: MaterialProxyId;
    intentBindings: Map<'blendMode' | 'depthTest', ValueExprId>;  // ONLY presentation/rasterizer logic
    camera?: CameraRef;  // Optional — for render-to-texture or explicit camera binding
}
```

**Key property:** The Render Sink knows nothing about what kind of geometry it draws or what the material does. It only manages presentation state.

---

## 4. Proxy Type Taxonomy

These are the semantic types flowing between blocks during compilation — not raw WebGPU buffers, but typed proxy handles.

### Base Primitives (Dataflow)

| Type | Scope | Description |
|------|-------|-------------|
| `Scalar<T>` | Per-frame (Uniform) | A single value evaluated once per frame (global time, slider value) |
| `Field<T>` | Per-instance (Varying) | A value evaluated per-instance/per-thread (spatial noise, position) |

### Resource Proxies (Pillars 1 & 2)

| Type | Description |
|------|-------------|
| `GeometryTopology` | Static vertex/index progressions (e.g., wireframe) |
| `ParametricTemplate` | Continuous mathematical domains (e.g., `ClosedBlob2D`) |
| `ParticlePool` / `InstancePool` | Flat SoA memory layout of independent agents with physics state |
| `SolverResource` | Transient 2D/3D grid data (fluid textures, SDF volumes) |

### Presentation Proxies (Pillars 3 & 4)

| Type | Description |
|------|-------------|
| `MaterialProxy` | Compiled surface-evaluation AST and its required SoA bindings |
| `RenderIntent` | Terminal — produces no downstream proxies, only a final draw command |

---

## 5. The InstanceDomain Block

`InstanceDomain` is the invisible heartbeat of the engine. It establishes execution cardinality and emits mathematical intrinsics — consuming **zero VRAM** for its outputs.

### Dual Nature: Allocation vs. Modulation

| Concern | Timing | Owner |
|---------|--------|-------|
| **Maximum capacity** (allocation) | Compile-time | `MemoryManifest` — determines SoA slot count |
| **Active count** (modulation) | Per-frame | Written to arena scalar, read by `DrawPrep` pass |

**Mechanism:** If a UI slider ranges 0–50,000, the manifest allocates 50,000 SoA slots. Per-frame, the evaluated slider value is written to `active_lanes`. The `DrawPrep` compute pass reads this and writes it into the `DrawIndirectArgs` buffer. The renderer executes `draw_indirect` for fewer instances, leaving tail memory untouched.

### Hardware Intrinsics (Zero Allocation)

Instead of physically generating coordinate arrays, `InstanceDomain` emits AST expression generators:

| Output | Type | Expression | Use Case |
|--------|------|------------|----------|
| `index` | `Field<u32>` | `global_invocation_id.x` | Integer seed for noise/Halton sequences |
| `rank` | `Field<f32>` | `f32(gid.x) / (active_lanes - 1.0)` | Normalized [0,1] for phase/interpolation |

**Why `rank` vs `index`:**
- `rank` (normalized float) is for phase-based math: multiply by 2π for circles, lerp between points for lines
- `index` (absolute integer) is for algorithms requiring integer seeds: Halton sequences, hash functions, pseudo-random scatter

This destroys the "Grid Trap" — geometry (where) is completely decoupled from cardinality (how many).

---

## 6. Camera as Global Context

The Camera is not a Source (Noun), a Material (Adjective), or an Intent (Verb). The Camera is **Global Context**.

**Mechanism:**
1. User drops a `PerspectiveCamera` block into the graph
2. Wires modulators (e.g., `Oscillator`) to camera ports (`positionX`, `fov`, etc.)
3. Compiler maps outputs to the `FrameHeader` Uniform Buffer Object (UBO) — not treated as a standard visual node
4. During the first compute pass, the GPU calculates the math and writes the View/Projection matrix directly into global memory

**Advanced use:** For render-to-texture (e.g., security camera feed), the `RenderIntent` block exposes an optional `camera` input port, allowing explicit `CameraRef` binding.

---

## 7. Total Modulation & Memory ABI

By isolating parameter ownership to the block that actually uses the data, the engine achieves **Total Modulation**:

1. Wire an `Oscillator` → `FluidSolver.viscosity` (**Source Binding**)
2. Wire a `SimplexNoise` field → `FluidColor.hue` (**Material Binding**)
3. Wire a `Constant` → `Draw.blendMode` (**Intent Binding**)

Everything is modulatable, but the compiler resolves them into perfectly isolated compute/render stages.

### Binding Ownership (Strict)

| Binding Type | Owner | Example |
|-------------|-------|---------|
| `sourceBindings` | Generator (Pillar 1) | `radius`, `viscosity`, `resolution` |
| `modifierBindings` | Modifier (Pillar 2) | `twistAngle`, `windStrength` |
| `materialBindings` | Material (Pillar 3) | `hue`, `roughness`, `emissive` |
| `intentBindings` | RenderIntent (Pillar 4) | `blendMode`, `depthTest` |

### Structure of Arrays (SoA)

All dynamic parameters are pre-allocated in SoA formats to guarantee perfect 256-bit memory coalescing during compute dispatches. Never AoS — SoA is mandatory for 120fps zero-allocation WebGPU execution.

---

## 8. The JS/Rust Compilation Boundary

### Principle: Symbolic JS Compiler, Physical Rust MMU

The JS compiler is a **semantic orchestrator** that builds syntax trees. The Rust backend is the **Memory Management Unit** that resolves symbols to physical byte offsets.

| Responsibility | Owner |
|----------------|-------|
| Graph validation, type solving, constraint enforcement | JS Frontend |
| Symbolic IR emission, pass ordering, proxy routing | JS Backend (lowering) |
| Byte calculation, stride/alignment, SoA layout | Rust MMU (`GpuMemoryArena`) |
| Naga AST construction, pipeline compilation | Rust (`naga` crate) |
| Buffer allocation, dispatch execution | Rust WebGPU runtime |

### The Symbolic Memory Manifest

JS emits symbolic requirements; Rust resolves them physically:

```json
{
  "manifest": {
    "arenaRequirements": {
      "globalCapacity": 50000,
      "scalars": ["param:spray_thresh", "sys:active_lanes"],
      "fields": ["pool_01:pos_x", "pool_01:pos_y", "pool_01:vel_x", "pool_01:vel_y", "pool_01:age"]
    },
    "transientTextures": [
      { "id": "tex_fluid_vel", "width": 256, "height": 256, "format": "rgba16float" }
    ]
  }
}
```

### Symbolic AST (crosses WASM boundary as JSON)

JS lowering functions emit a serializable IR (`NagaModuleIR_TS`) using symbolic memory references:

```typescript
type ExprIR =
  | { type: 'LiteralF32', value: number }
  | { type: 'Intrinsic', name: string }           // e.g., 'global_invocation_id.x'
  | { type: 'SymbolicLoad', symbolId: string }     // e.g., 'pool_01:age'
  | { type: 'BinaryOp', op: string, left: ExprIR, right: ExprIR }
  | { type: 'TextureSample', textureId: string, uv: ExprIR };

type StatementIR =
  | { type: 'SymbolicStore', symbolId: string, value: ExprIR }
  | { type: 'If', condition: ExprIR, accept: StatementIR[], reject: StatementIR[] };
```

### Rust MMU Resolution

When Rust receives the payload:
1. **Calculate stride** — reads `globalCapacity`, computes 256-bit alignment padding
2. **Assign offsets** — loops through `fields`, assigns physical byte offsets
3. **Allocate** — sums exact byte total, calls `device.create_buffer`
4. **Patch the AST** — replaces every `SymbolicLoad("pool_01:pos_x")` with physical Naga IR math: `base_offset + (lane_stride * gid.x)`
5. **Compile** — hands patched AST to Naga, caches the pipeline

### Uniform vs. Field Lowering Semantics

Lowering distinguishes:
- **Uniform** requirements (must be dispatch-constant) — e.g., `simResolution` grid size
- **Field/Varying** requirements (may vary per lane) — e.g., per-instance noise threshold

This distinction belongs to typed elaboration + lowering semantics, not runtime heuristics. The frontend compiler enforces it during type checking — wiring a `Field` into a Uniform-only port fails early validation.

---

## 9. Blocks Are Not 1:1 With Shaders

A "Block" is an authoring concept. A single block might compile into:
- **Zero shaders** — if it's a pure math routing node
- **A single WGSL snippet** — injected into the Uber Shader's `compute_main` pass
- **An entire sequence of distinct Compute Passes** — e.g., `EulerianFluidSolver` compiles to ~30 sequential passes

### Pure Lowering Functions

All lowering functions are **pure / referentially transparent**. They return a `LoweredBlock` record rather than mutating builder state:

```typescript
interface LoweredBlock {
    outputProxy: ResourceProxyId | MaterialProxyId | null;
    arenaRequests: ArenaFieldRequest[];
    textureRequests: TextureRequest[];
    computePasses: CompiledComputePassSpec[];
    renderIntents: RenderIntentSpec[];
}
```

The compiler orchestrator (a fold/reduce loop) takes these records and purely concatenates dependencies and passes. This enables:
- **Dead code elimination:** if `outputProxy` is never routed to a `RenderIntent`, drop the `LoweredBlock`
- **Caching:** unchanged inputs → reuse previous output

---

## 10. Scheduling: The Pass Roster

WebGPU requires explicit synchronization between dispatches that read/write the same memory. The scheduler flattens the graph into a strict, linear **Compute Pass Roster** respecting topological data dependencies.

**Example full-pipeline schedule (fluid + spray):**

| Pass | ID | Action |
|------|----|--------|
| 0 | `compute_main` | Evaluate all user math (LFOs, noise fields). Write parameter values to arena. |
| 1 | `fluid_splat` | Read mouse input + arena params. Write impulses to fluid textures. |
| 2 | `fluid_curl` | Curl computation |
| 3 | `fluid_divergence` | Divergence computation |
| 4–28 | `fluid_pressure_iter_N` | Ping-pong pressure solver (25 Jacobi iterations) |
| 29 | `fluid_advect` | Push dye/velocity through grid. Write final frame to `fluid_dye_A`. |
| 30 | `eject_fluid_spray` | 50,000 threads: dead particles sample fluid, alive particles do ballistic physics |
| 31 | `sys_draw_prep` | Read `active_lanes`, write `DrawIndirectArgs` |
| Render | `intent_draw_01` | Bind Uber Shader, bind arena SoA buffers, execute `draw_indirect` |

**Key insight:** A single block (e.g., `EulerianFluidSolver`) can compile into *multiple sequential compute passes*. Blocks are authoring concepts, not 1:1 shader mappings.

---

## 11. Architecture Validation

### 11.1 Total Modulation
Every parameter in the system is modulatable at its owning pillar boundary. Modulators (Oscillator, Noise, etc.) wire to the block that owns the parameter. The compiler resolves them into isolated passes. Runtime executes blindly.

### 11.2 Zero Duplicate Code
One `Draw` block accepts any `ResourceProxyId` and any `MaterialProxyId`. No parallel render blocks (`RenderFluid`, `RenderRibbon`, `RenderMesh`). The Rust backend's Uber Shader blindly executes the combination based on `RenderSource.kind` metadata.

### 11.3 Future-Proofing
When complex mathematical equation systems (e.g., Milkdrop presets with dozens of per-vertex/per-pixel equations) are introduced, they become **Modifier** blocks that manipulate `ResourceProxyId`s. The rest of the engine processes them natively without knowing they are legacy presets.

---

## 12. Hard Boundaries

The architecture natively supports modulating **values** (positions, counts, colors, camera matrices) at 120fps. It strictly prohibits modulating **structure** at runtime.

### Boundary 1: Dynamic Topology Resolution

You **cannot** dynamically modulate the *resolution* of a Type 2 Parametric shape per-frame. If a `ClosedBlob2D` is compiled with 64 segments, changing to 128 segments requires a full `REBUILD_GPU_PIPELINES` operation (new index buffer to VRAM).

### Boundary 2: Data-Dependent Spawning

You **cannot** do GPU particle spawning where one particle emits N new particles based on a collision — the architecture relies on predictable `InstanceDomain` counts mapped to exact SoA allocations. Variable-length output requires staging buffers and atomic counters, which break the pure predictable dataflow rule.

**Workaround:** Deterministic Object Pooling (see Section 13).

### Boundary 3: Graph Topology Modulation

You **cannot** wire an oscillator to dynamically bypass or inject blocks. `[LAW:dataflow-not-control-flow]` — the compute passes are statically compiled sequentially.

**Workaround:** Route through both blocks and modulate a `mix` or `strength` parameter down to `0.0`.

---

## 13. Deterministic Object Pooling

For effects like fluid-to-particle spray without breaking the predictable dataflow architecture:

**Strategy:** Treat the spray not as a dynamic array but as a continuous field of evaluation. Allocate the maximum pool at compile time. All threads run every frame.

1. **The Pool (Source A):** `InstanceDomain` allocates a massive, fixed pool of particles (e.g., 50,000 SoA slots). All ages start at `-1.0` (dead).
2. **The Fluid (Source B):** `EulerianFluidSolver` outputs transient textures (velocity, dye).
3. **The Bridge (Modifier):** `EjectFluidSpray` modifier bridges the two. Every frame, all 50,000 compute threads run:
   - **Dead particle** (age ≤ 0): Randomly samples a cell in the fluid texture using a hash of `(lane_id, time)`. If the cell's velocity exceeds the `ejectThreshold`, the particle "wakes up" — snaps to that coordinate, inherits fluid velocity, and sets age to 1.0.
   - **Alive particle** (age > 0): Follows standard ballistic physics (gravity, drag) until lifespan expires, then "dies" and waits for respawn.

**Why this works:**
1. **Zero atomics** — particles randomly check the fluid grid; no `atomicAdd` for active counters
2. **Stable framerate** — whether 0 or 50,000 particles are active, computational cost is predictable
3. **Composable** — because `EjectFluidSpray` is a Modifier, you can stack further Modifiers (e.g., `WindField`) after it

---

## 14. Implementation Guardrails

When building the IR compilation for this architecture, enforce these invariants:

1. **Never rediscover Nouns.** `RenderSource.kind` metadata must travel faithfully in IR. The Rust runtime must never use heuristics to guess what kind of geometry it is rendering. `// [LAW:one-source-of-truth]`

2. **No leaky bindings.** A `RenderIntent` compilation step must throw a validation error if asked to resolve a semantic binding that belongs to a Source (e.g., `radius`). Each pillar owns its own bindings exclusively.

3. **Proxy integrity.** Sinks and Modifiers must rely purely on `ResourceProxyId` routing. They must not unpack or inspect the internal `sourceBindings` of upstream generators.

4. **One type per behavior.** There are no parallel renderers (a fluid path vs. a shape path). Everything compiles to the exact same pass execution model. `// [LAW:one-type-per-behavior]`

5. **Dataflow, not control flow.** Variability is represented in compiled data arrays and compute dispatches, not runtime `if/else` branching by feature type. `// [LAW:dataflow-not-control-flow]`

6. **JS compiler is hardware-agnostic.** No byte calculations, stride math, or alignment logic in JS. The Rust MMU handles all physical memory concerns. `// [LAW:single-enforcer]`

---

## 15. Acceptance Criteria

The implementation is compliant when all are true:

1. No block type outside Pillars 1–4 owns semantics that belong to another pillar.
2. `RenderIntent` is thin and free of source/material generation bindings.
3. JS lowering emits symbolic, serializable IR only.
4. Rust/WASM MMU is the sole resolver of byte size/offset/alignment.
5. Runtime pass execution is static in shape; variability is in values.
6. Each stage validates independently: Sources validate required semantics, Modifiers validate input/output compatibility, Materials validate shader bindings, Intents validate rendering state only.
