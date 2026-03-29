# B0: The 4-Pillar Node Abstraction

**Status:** Canonical Reference
**Subject:** Block library architecture for composable, fully-modulatable rendering pipelines
**Source:** Extracted from design conversation (B1-Block-Library-RAW.md, now removed)

---

## 1. The Problem: The "God Object" Trap

In signal processing and graphics pipelines, architectural terminology must be exact. The previous design attempted to route all parameter bindings through a single `RenderIntent` object:

```
RenderIntent.paramBindings: semanticId -> valueRef  // WRONG — God Object
```

This couples the *creation* of data with the *presentation* of data. If `RenderIntent` manages bindings for a dynamic waveform generator *and* the color mapping *and* the render state, the node UI becomes a tangled mess and the compiler IR validation becomes a nightmare.

**Example of the failure mode:** If a user drops a `FluidSolver` block and wires it to a `Render` block, the `RenderIntent` should not be responsible for the fluid's `dyeDissipation` parameter. The `FluidSolver` block should own its generation parameters, and the `RenderIntent` should only care about how to draw the final texture.

### Core Terminology

The fix is strict linguistic categories for pipeline stages:

| Category | Linguistic Role | Responsibility |
|----------|----------------|----------------|
| **Source** | Noun | Produces raw data (Geometry, SDFs, Fluid Textures) |
| **Material** | Adjective | Describes surface visual properties (Color, Emission, Thickness) |
| **Intent** | Verb | An instruction to the engine ("Dispatch this pass", "Draw this data") |

---

## 2. The 4-Pillar Abstraction

The block library and compiler IR are split into four distinct composable interfaces. Each pillar owns its own parameter bindings — no pillar reaches into another's domain.

### Pillar 1: Generators (`RenderSource`)

Generators introduce physical or mathematical data topology into the pipeline. They own their specific structural bindings and emit a generic proxy handle.

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
    // The generator exclusively owns its own parameter modulation
    sourceBindings: Map<SemanticId, ValueExprId>;
    output: ResourceProxyId;
}
```

**Key property:** The generator block owns its generation parameters (e.g., `radius`, `viscosity`, `t_step`). These are never exposed to downstream blocks.

### Pillar 2: Modifiers (Signal / Spatial Processors)

Modifiers sit strictly between Generators and Sinks. They take a proxy, apply a compute kernel, and output a modified proxy.

**Examples:** `TwistGeometry`, `AdvectFluid`, `RemapFieldLUT`, `TransformInstances`, `EjectFluidSpray`, `WindField`.

**IR Contract:** Takes a `ResourceProxyId`, applies math via its own `paramBindings`, outputs a new `ResourceProxyId`.

**Key property:** Because WebGPU naturally maps instance cardinality to compute threads, modifiers act as implicit vectorization maps — they warp space or structure before rendering without knowing the underlying source kind.

### Pillar 3: Materials (Surface Evaluators)

Materials evaluate surface visual properties. They are entirely agnostic to whether they are painting a rigid mesh, a parametric ribbon, or a 2D fluid quad.

**Examples:** `MatCap2.5D`, `FluidColorWarp`, `BasicUnlit`, `UnlitMaterial`, `SprayDroplet`.

**IR Contract:**

```typescript
interface Material {
    kind: 'ShaderAST' | 'ComputeComposite';
    // The material exclusively owns its visual bindings
    materialBindings: Map<SemanticId, ValueExprId>;
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
    // Intent bindings are ONLY for presentation/rasterizer logic
    intentBindings: Map<'blendMode' | 'depthTest', ValueExprId>;
}
```

**Key property:** The Render Sink knows nothing about what kind of geometry it draws or what the material does. It only manages presentation state (blend mode, depth test, etc.).

---

## 3. Proxy Type Taxonomy

These are the semantic types flowing between blocks during compilation — not raw WebGPU buffers, but typed proxy handles.

### Base Primitives (Dataflow)

| Type | Scope | Description |
|------|-------|-------------|
| `Scalar<T>` | Per-frame (Uniform) | A single value evaluated once per frame (global time, slider value) |
| `Field<T>` | Per-instance (Varying) | A value evaluated per-instance/per-thread (spatial noise, position) |

### Pillar 1 & 2: Resource Proxies (Nouns)

| Type | Description |
|------|-------------|
| `GeometryTopology` | Static vertex/index progressions (e.g., wireframe) |
| `ParametricTemplate` | Continuous mathematical domains (e.g., `ClosedBlob2D`) |
| `ParticlePool` / `InstancePool` | Flat SoA memory layout of independent agents with physics state |
| `SolverResource` | Transient 2D/3D grid data (fluid textures, SDF volumes) |

### Pillar 3 & 4: Presentation Proxies (Adjectives & Verbs)

| Type | Description |
|------|-------------|
| `MaterialProxy` | Compiled surface-evaluation AST and its required SoA bindings |
| `RenderIntent` | Terminal — produces no downstream proxies, only a final draw command |

---

## 4. The InstanceDomain Block

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

## 5. Camera as Global Context

The Camera is not a Source (Noun), a Material (Adjective), or an Intent (Verb). The Camera is **Global Context**.

**Mechanism:**
1. User drops a `PerspectiveCamera` block into the graph
2. Wires modulators (e.g., `Oscillator`) to camera ports (`positionX`, `fov`, etc.)
3. Compiler maps outputs to the `FrameHeader` Uniform Buffer Object (UBO) — not treated as a standard visual node
4. During the first compute pass, the GPU calculates the math and writes the View/Projection matrix directly into global memory

**Advanced use:** For render-to-texture (e.g., security camera feed), the `RenderIntent` block exposes an optional `camera` input port, allowing explicit `CameraRef` binding.

---

## 6. Architecture Validation

### 6.1 Total Modulation

By isolating parameter ownership to the block that actually uses the data:

1. Wire an `Oscillator` → `FluidSolver.viscosity` (**Source Binding**)
2. Wire a `SimplexNoise` field → `FluidColor.hue` (**Material Binding**)
3. Wire a `Constant` → `Draw.blendMode` (**Intent Binding**)

Everything is infinitely modulatable, but the compiler resolves them into perfectly isolated compute/render stages.

### 6.2 Zero Duplicate Code

One `Draw` block accepts any `ResourceProxyId` and any `MaterialProxyId`. No parallel render blocks (`RenderFluid`, `RenderRibbon`, `RenderMesh`). The Rust backend's Uber Shader blindly executes the combination based on `RenderSource.kind` metadata.

### 6.3 Future-Proofing

When complex mathematical equation systems (e.g., Milkdrop presets with dozens of per-vertex/per-pixel equations) are introduced, they become **Modifier** blocks that manipulate `ResourceProxyId`s. The rest of the engine processes them natively without knowing they are legacy presets.

---

## 7. The JS/Rust Compilation Boundary

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

---

## 8. Pure Lowering Functions

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

The compiler orchestrator (a fold/reduce loop) takes these records and purely concatenates dependencies and passes. This enables dead code elimination (if `outputProxy` is never routed to a `RenderIntent`, drop the `LoweredBlock`) and caching (unchanged inputs → reuse previous output).

---

## 9. Scheduling: The Pass Roster

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

## 10. Hard Boundaries

The architecture natively supports modulating **values** (positions, counts, colors, camera matrices) at 120fps because they map cleanly to SoA memory and Uniforms. It strictly prohibits modulating **structure** at runtime.

### Boundary 1: Dynamic Topology Resolution

You **cannot** dynamically modulate the *resolution* of a Type 2 Parametric shape per-frame. If a `ClosedBlob2D` is compiled with 64 segments, changing to 128 segments requires a full `REBUILD_GPU_PIPELINES` operation (new index buffer to VRAM).

### Boundary 2: Data-Dependent Spawning

You **cannot** do GPU particle spawning where one particle emits N new particles based on a collision — the architecture relies on predictable `InstanceDomain` counts mapped to exact SoA allocations. Variable-length output requires staging buffers and atomic counters, which break the pure predictable dataflow rule.

**Workaround:** Deterministic Object Pooling — allocate a fixed maximum pool at compile time, use "dead/alive" state per instance. All threads run every frame; dead particles randomly sample for respawn conditions. See [Section 11](#11-deterministic-object-pooling) for the full pattern.

### Boundary 3: Graph Topology Modulation

You **cannot** wire an oscillator to dynamically bypass or inject blocks. `[LAW:dataflow-not-control-flow]` — the compute passes are statically compiled sequentially.

**Workaround:** Route through both blocks and modulate a `mix` or `strength` parameter down to `0.0`.

---

## 11. Deterministic Object Pooling

For effects like fluid-to-particle spray without breaking the predictable dataflow architecture:

**Strategy:** Treat the spray not as a dynamic array but as a continuous field of evaluation. Allocate the maximum pool at compile time. All threads run every frame.

- **Dead particle** (age ≤ 0): Randomly samples a cell in the fluid texture using a hash of `(lane_id, time)`. If the cell's velocity exceeds the `ejectThreshold`, the particle "wakes up" — snaps to that coordinate, inherits fluid velocity, and sets age to 1.0.
- **Alive particle** (age > 0): Follows standard ballistic physics (gravity, drag) until lifespan expires, then "dies" and waits for respawn.

**Why this works:**
1. **Zero atomics** — particles randomly check the fluid grid; no `atomicAdd` for active counters
2. **Stable framerate** — whether 0 or 50,000 particles are active, computational cost is predictable
3. **Composable** — because `EjectFluidSpray` is a Modifier, you can stack further Modifiers (e.g., `WindField`) after it

---

## 12. Implementation Guardrails

When building the IR compilation for this architecture, enforce these invariants:

1. **Never rediscover Nouns.** `RenderSource.kind` metadata must travel faithfully in IR. The Rust runtime must never use heuristics to guess what kind of geometry it is rendering. `// [LAW:one-source-of-truth]`

2. **No leaky bindings.** A `RenderIntent` compilation step must throw a validation error if asked to resolve a semantic binding that belongs to a Source (e.g., `radius`). Each pillar owns its own bindings exclusively.

3. **Proxy integrity.** Sinks and Modifiers must rely purely on `ResourceProxyId` routing. They must not unpack or inspect the internal `sourceBindings` of upstream generators.

4. **One type per behavior.** There are no parallel renderers (a fluid path vs. a shape path). Everything compiles to the exact same pass execution model. `// [LAW:one-type-per-behavior]`

5. **Dataflow, not control flow.** Variability is represented in compiled data arrays and compute dispatches, not runtime `if/else` branching by feature type. `// [LAW:dataflow-not-control-flow]`

6. **JS compiler is hardware-agnostic.** No byte calculations, stride math, or alignment logic in JS. The Rust MMU handles all physical memory concerns.

---

## 13. Architectural Invariants

* `[LAW:dataflow-not-control-flow]` Variability lives in values, not in whether operations execute.
* `[LAW:one-source-of-truth]` The compiler's generated artifacts (Manifest + Pass Roster) are authoritative. Rust must never re-derive or guess intended execution values.
* `[LAW:single-enforcer]` Invariants (memory limits, routing maps) are enforced exactly once at the system boundary (install/rebuild phase), never inside the per-frame hot loop.
* `[LAW:one-type-per-behavior]` No parallel renderers. Everything compiles to the same primitive pass execution model.
