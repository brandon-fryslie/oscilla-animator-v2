# GPU Architecture Plan: The Strangler Fig Refactor

> Reconstructed from the Gemini planning session (2026-03-20 through 2026-03-22).
> This document captures the full technical design for transforming the Oscilla engine
> from a TypeScript-managed memory model to a Rust-owned GPU architecture.

---

## Table of Contents

1. [The Core Thesis](#1-the-core-thesis)
2. [The Transformation Model (Strangler Fig)](#2-the-transformation-model)
3. [Phase 0: The Brutal Hardening](#3-phase-0-the-brutal-hardening)
4. [Phase 1: The Memory & Control Boundary](#4-phase-1-the-memory--control-boundary)
5. [Phase 2: The Compute Kernel & Fluid Boundary](#5-phase-2-the-compute-kernel--fluid-boundary)
6. [Phase 3: Decoupled Domain Topology Mapping](#6-phase-3-decoupled-domain-topology-mapping)
7. [Phase 4: The 2.5D MatCap Upgrade](#7-phase-4-the-25d-matcap-upgrade)
8. [Phase 5: Compute Dynamics (Fluid & Physics)](#8-phase-5-compute-dynamics)
9. [Phase 6: Textures & Type 5 Shapes (MSDF Text)](#9-phase-6-textures--msdf-text)
10. [Phase 7: Continuity & GPU Dynamics](#10-phase-7-continuity--gpu-dynamics)
11. [Current State & Audit Status](#11-current-state--audit-status)
12. [Reference Documents](#12-reference-documents)

---

## 1. The Core Thesis

The Oscilla engine has a fundamental architectural problem: **TypeScript is acting as a makeshift Memory Management Unit (MMU).** The TS compiler calculates byte offsets, `std140` padding, and SoA strides, then hardcodes literal byte offsets into the IR or concatenates them into WGSL strings.

This is a dead end for three reasons:

1. **WebGPU Padding Nightmares.** GPUs have draconian alignment rules. Letting JavaScript guess how a Rust/wgpu backend will pack memory is a ticking time bomb for memory corruption.

2. **Recompilation Cascades.** If a user changes an instance count from 100 to 200, the SoA byte offsets for everything downstream shift. TS has to completely re-lower the AST and re-emit the shader because an array got larger.

3. **The WGSL String Hack.** The fluid implementation (`fluid-gpu-bundle.ts`) bypasses the clean Naga IR and injects literal strings (`const PARAM_OFFSET: u32 = 123u;`). This is incompatible with the engine's Naga AST firewall.

### The Target Architecture

**TypeScript owns the Topology (the "What"). Rust owns the Silicon (the "Where").**

| Concern | Current (Broken) | Target (Correct) |
|---------|------------------|-------------------|
| **Controls** | UI Slider → `ConstantPatcher.ts` → triggers AST rebuild → re-uploads shader | UI Slider → Wasm Fast-Path → Rust updates Uniform Buffer → zero recompilation |
| **Memory** | TS Compiler calculates SoA strides, `std140` padding, embeds literal byte offsets into IR | TS Compiler emits a Symbolic `MemoryManifest` → IR uses Symbolic IDs (`state:velocities`) |
| **Execution** | Rust receives flat bytes and strings, blindly uploads to GPU | Rust reads Manifest → calculates all offsets → allocates SSBOs and Texture2Ds → resolves Symbolic IDs into physical offsets |
| **Fluids** | `fluid-gpu-bundle.ts` calculates offsets → concatenates raw WGSL strings → sends to Rust | TS emits `DispatchKernel("fluid_advect", { target: "state:velocities" })` → Rust binds physical textures to static `.wgsl` files |
| **Domains** | `GridBasis` → allocates physical VRAM for `uv` → emits Compute instructions to write to it | `InstanceDomain` → TS emits Intrinsic IR → Rust translates to `global_invocation_id.x` |

---

## 2. The Transformation Model

The plan uses a **Strangler Fig** pattern applied via graph transformations. Rather than building new features on top of the broken memory model (which would need to be ripped out later), the plan:

1. **Burns the ships** (Phase 0) — deletes all legacy code that could tempt agents into writing fallback shims
2. **Swaps the foundation** (Phase 1-2) — builds the correct memory/control boundary
3. **Builds features on clean ground** (Phase 3+) — domains, 2.5D, physics, text

Each phase follows a **Tighten → Swap → Harden** cycle:
- **Tighten**: Map the boundary, introduce the new interfaces
- **Swap**: Mechanically cut over from old to new
- **Harden**: Rip out the legacy, make the old path impossible

### Sequencing Rationale

The sequence is designed so that:
- No work is thrown away (each phase builds on the previous)
- Agents cannot write hacky fallbacks (legacy code is deleted before new code is written)
- Success is mechanically verifiable at each boundary

---

## 3. Phase 0: The Brutal Hardening

**Goal:** Delete everything that could tempt agents to write legacy-compatible shims. Create a "clean room" where the only way to succeed on Phase 1 is to build the pristine architecture.

### 3.1 Purge Tests (`phase-0-tests-0qe`)

Delete any test that asserts TS-owned memory layouts or WGSL string generation. If a test breaks because code was deleted, the test itself must be deleted — not "fixed" by building a simpler graph.

**Critical instruction:** Agents must NOT attempt to "fix" test expectations. The goal is physical deletion.

### 3.2 Purge Fluid Bundle (`phase-0-fluid-purge-9lz`)

Delete `fluid-gpu-bundle.ts` and all related blocks (`FluidDynamics2D`, `FluidSplat`, `FluidCurl`, etc.). This destroys the current fluid implementation so agents cannot adapt the new Symbolic Memory model to support string injection.

### 3.3 Purge ConstantPatcher (`phase-0-constantpatcher-dzg`)

Delete `ConstantPatcher.ts` and the old hot-swapping AST logic. This forces the true Live Parameter Fast-Path to be built.

### 3.4 Purge Legacy Continuity (`phase-0-continuity-purge-2vk`)

Purge all legacy CPU continuity code (`ContinuityApply.ts`, etc.). Continuity will be reimplemented on the GPU in Phase 7.

### 3.5 Final Purge (`phase-0-final-purge-36f`)

Remove `GridBasis`, `SpiralBasis`, and all remaining blocks that violate the decoupled domain model. Scrub registries (`all.ts`, `panelRegistry.ts`) clean.

**Rule 9 (from AGENT_ENGINEERING_STANDARDS.md):** During a Purge task, the goal is to physically remove code, not to preserve functionality. If a test breaks because you deleted a block, you MUST delete the test.

---

## 4. Phase 1: The Memory & Control Boundary

**Goal:** Strip memory byte-offset math out of TypeScript. Force Rust to act as the true MMU. Create a direct UI-to-GPU fast path for 120fps slider scrubs without recompiling the graph.

This is the fundamental architectural shift. Everything built after this phase lands on correct foundations.

### 4.1 The Symbolic Memory Manifest

#### Design

Instead of computing byte offsets (`ArenaAddressPlan`), the TS Compiler declares intent using **Symbolic IDs**:

```json
{
  "resources": [
    { "id": "arena:node_12_out", "type": "vec2", "cardinality": 500, "packing": "soa" },
    { "id": "state:fluid_vel", "type": "vec2", "cardinality": 4096, "packing": "soa" },
    { "id": "state:fluid_pressure", "type": "float", "topology": "grid_2d", "width": 512, "height": 512 }
  ]
}
```

The `NagaEmitterInstruction`s in TS never see a byte offset. They reference the symbolic ID:

```json
{ "op": "StateRead", "resourceId": "state:fluid_vel", "lane": "gid.x" }
```

#### Implementation (`phase-1-manifest-2kk`)

- Delete the `ArenaAddressPlan` class from TypeScript
- The compiler emits a `MemoryManifest` describing resources by name and semantic type
- `ScheduleNagaLowering.ts` emits `load_symbolic` and `store_symbolic` instructions instead of raw buffer pointers
- **FAIL CASE:** IDs like `offset_128` are forbidden. IDs must be true semantic symbols (e.g., `field:particles:pos`)

#### Topology Support

The manifest supports two memory topologies:

| Topology | Manifest Declaration | Rust Allocation |
|----------|---------------------|-----------------|
| `linear_1d` (SoA) | `{ "topology": "linear_1d", "max_elements": 10000 }` | Standard `wgpu::Buffer` (SSBO) |
| `grid_2d` (Texture) | `{ "topology": "grid_2d", "width": 512, "height": 512 }` | `wgpu::Texture` with `TextureUsages::STORAGE_BINDING` |

This is critical for fluid simulation: Eulerian solvers need `Texture2D` for cache-efficient neighbor access (Morton/Z-order curves), not 1D linear arrays where reading vertical neighbors (`y-1`, `y+1`) destroys L1/L2 cache.

### 4.2 The Rust MMU

#### Design

Rust receives the `MemoryManifest`, calculates `std140`/`std430` alignment, and assigns physical byte offsets. It allocates physical `wgpu::Buffer`s (handling ping-pong double buffering for state automatically).

When the Rust Naga Builder processes a `{ op: "StateRead" }` instruction, it looks up the symbolic ID in its internal map, retrieves the Rust-calculated byte offset and stride, and generates the exact Naga AST math: `base_offset + (lane * stride)`.

**Massive Win:** If the user changes an instance count, TS sends the same IR with a new cardinality in the manifest. Rust resizes the buffer, updates its internal offset map, and the shader may not even need recompilation (offsets can be passed via uniforms).

#### Implementation (`phase-1-rust-mmu-0m3`)

- `SymbolResolver` in `memory.rs` consumes the JSON manifest
- Calculates physical offsets using strict `std430` alignment rules
- Provides `get_wgsl_accessor(resource_id, lane, component) -> String` for the Naga Emitter
- O(1) symbol-to-offset lookups with zero heap allocation during the render loop
- Rust is the **sole authority** for padding math

#### Opaque Accessors

The MMU provides accessors so the emitter never sees raw strings:

| Resource Type | Accessor Output |
|---------------|----------------|
| Arena | `arena_in[offset + lane*stride + component]` |
| UBO | `global_controls[index].x` |
| State | `state_in[base + lane*stride]` |

The emitter (`compute.rs`) simply calls the accessor method. It has zero knowledge of `state:` or `arena:` prefix strings.

### 4.3 Update Classes

#### Design

Every input port on every block declares one of three strict mutability contracts:

| Update Class | Examples | Behavior |
|-------------|----------|----------|
| `CompileTime` | Instance counts, loop bounds, array sizes, blob `resolution` | Changes force a full graph recompile |
| `InstallTime` | Type 1 (rigid) control points, texture URLs, font files | Changes trigger Rust-side resource rebuild, but not re-lowering |
| `FrameTime` | Colors, transforms, Type 2/3/4 parameters, fluid sliders, opacity | Mapped directly to GPU Parameter Buffer. Skips compiler entirely. |

#### The Silicon Data Flow (from `.agent_planning/SILICON-PHASE-1-PLAN.md`)

The `UpdateClass` flows **forward** through the compiler stages — never re-derived via forensic string-parsing:

1. **Registry**: `InputDef` declares the capability (`updateClass`)
2. **Frontend Bridge**: `draft-graph-bridge.ts` carries this into `InputPortPolicy`
3. **Lowering**: `lower-blocks.ts` passes the policy and the **Source Identity** (`{ blockId, portId }`) into the `IRBuilder`
4. **Binding Pass (Intersection)**: `IRBuilderImpl.registerSlotType` unifies requirements
   - If a slot is shared by a `FrameTime` slider and a `CompileTime` wire, the slot **MUST** be `CompileTime`
   - Intersection rule: `min(requirements)` (most restrictive wins)
5. **Artifact Generation**: `compile.ts` emits two critical data structures:
   - `MemoryManifestIR`: Symbolic requirements for Rust
   - `fastPathOffsets`: A `Record<string, number>` mapping `'blockId:portId'` → UBO float offset

#### Implementation (`phase-1-update-classes-mqr`, `phase-1-silicon-ble`)

- Add `updateClass` field to `InputDef` in the block registry
- Flow `updateClass` through `InputPortPolicy` → `lower-blocks.ts` → `IRBuilderImpl`
- Implement `intersectUpdateClass()` in `IRBuilderImpl`: when multiple consumers share a slot, the most restrictive class wins
- **FORBIDDEN:** No string-parsing of block IDs. No forensic lookups. The data must flow through the IR.

### 4.4 The Live Parameter Fast-Path

#### Design

When a user scrubs a slider, React bypasses the TS Compiler entirely. It sends a tiny payload directly to the Rust backend: `updateControl(index, value)`. Rust performs a memcopy into the GPU's Uniform Buffer. The shader reads the new value on the next frame. Zero recompilation.

#### The O(1) UI Path

```
React Slider onChange
    ↓
PatchStore.updateControlValue()  ← emits ParamChanged event, nothing else
    ↓
FastPathController.onParamChanged()  ← O(1) lookup: program.fastPathOffsets[key]
    ↓
WASM bridge: update_control(offset, value)
    ↓
Rust: queue.write_buffer(control_ubo, offset, &[value])
    ↓
Next frame: shader reads new value from uniform buffer
```

#### Implementation (`phase-1-fastpath-3uk`, `phase-1-silicon-fxf`)

- **`PatchStore`**: Remains a pure data source. Emits `ParamChanged` event and nothing else. Does NOT peek into `RootStore`, `RuntimeService`, or `DebugIndex`.
- **`FastPathController` (NEW service)**: Listens to `PatchStore` events. Performs a single O(1) lookup: `program.fastPathOffsets[key]`. If a match exists, calls the WASM `update_control(offset, value)` bridge.
- **Rust side**: Allocate a `GlobalControlUBO` (Uniform Buffer Object). Map `FrameTime` ports to indices in this buffer.

**FORBIDDEN:**
- No O(N) searches through debug indices
- No forensic `parseSlotPortLabel()` string-parsing
- No circular dependency Store → Runtime → Store

### 4.5 Instance Count Sizing Strategy

Users must be able to smoothly scrub an instance count slider (100 → 5,000) without triggering a graph recompile or UI jank.

The strategy is **over-allocation**:

1. **TS Compiler (CompileTime):** When the user drops an `InstanceDomain`, the compiler inspects the maximum possible bounds (e.g., a globally configured ceiling like `65536`). It builds the `MemoryManifest` telling Rust: "Allocate an SoA buffer block for 65,536 items."
2. **Rust (InstallTime):** Creates the massive WebGPU buffers. The Naga AST is compiled with a boundary check: `if (gid.x >= active_lanes) { return; }`
3. **UI Fast-Path (FrameTime):** The user scrubs from 100 to 200. React sends `{ id: "control:active_lanes", value: 200 }` to Rust.
4. **Rust (FrameTime):** Writes `200` into the uniform control buffer. The compute shader reads it, and the next frame evaluates 200 lanes instead of 100.

---

## 5. Phase 2: The Compute Kernel & Fluid Boundary

**Goal:** Reintroduce fluids the correct way: native WGSL files running over `Texture2D` memory, dispatched from TS using Symbolic IDs.

### 5.1 The DispatchKernel Instruction

#### Design

Instead of building WGSL strings, TS tells Rust to dispatch a predefined kernel, passing Symbolic IDs as arguments:

```json
{
  "op": "DispatchKernel",
  "kernelId": "fluid_advect",
  "workgroups": [64, 1, 1],
  "arguments": {
    "velocity_in": "state:fluid_vel",
    "dye_in": "state:fluid_dye",
    "dt": "uniform:delta_time"
  }
}
```

#### Rust Execution

1. Rust sees `DispatchKernel("fluid_advect")`. It has a static `fluid.wgsl` shader pre-compiled for this kernel.
2. Rust looks up the physical byte offsets and strides for `"state:fluid_vel"` and `"state:fluid_dye"` from its MMU allocator.
3. Rust writes those offsets into a small, dynamic Uniform Buffer (or uses WebGPU Pipeline Overridable Constants) bound to that compute pass.
4. The static `fluid.wgsl` shader uses `textureLoad()` and `textureStore()` to evaluate the math at maximum hardware efficiency.

#### Implementation (`phase-2-dispatch-8yr`)

- Add `DispatchKernel` variant to `NagaEmitterInstruction` in TypeScript
- TS compiler emits the instruction with symbolic arguments
- Rust side: Match `NagaEmitterInstruction::DispatchKernel`, look up `kernelId` in a kernel registry, resolve `arguments` Symbolic IDs to physical `wgpu::Buffer` offsets via MMU, execute `compute_pass.dispatch_workgroups(...)`
- **Critical:** The Rust execution must actually resolve arguments into bind groups. A skeletal implementation that ignores the `arguments` map is incomplete.

### 5.2 Port Fluid Dynamics to Native Kernels

#### Design

Move the raw WGSL strings from `fluid-gpu-bundle.ts` into static `.wgsl` files inside the Rust crate. The TS compiler emits `DispatchKernel` instructions; Rust binds the Symbolic IDs to the kernel pass.

The manifest requests `grid_2d` topologies for fluid buffers:

```json
{ "id": "state:fluid_pressure", "type": "float", "topology": "grid_2d", "width": 512, "height": 512 }
```

Rust allocates `wgpu::Texture` objects instead of linear arrays, providing:
- Morton/Z-order curve memory layout for cache-efficient 2D neighbor access
- Free bilinear interpolation (mandatory for the Advection pass)
- Native `textureLoad()` / `textureStore()` in WGSL

#### Implementation (`phase-2-fluid-port-045`)

- Create a `FluidSim` block in TS that emits `DispatchKernel` instructions
- Move fluid WGSL into static `.wgsl` files in the Rust crate
- Implement `Texture2D` resource creation in `memory.rs` for `grid_2d` topology entries
- Wire up dynamic `BindGroup` creation so kernel arguments resolve to physical textures
- Delete `fluid-gpu-bundle.ts` entirely — TS is now completely purged of WGSL string concatenation

---

## 6. Phase 3: Decoupled Domain Topology Mapping

**Goal:** Replace monolithic layout blocks (GridBasis, SpiralBasis) with virtual, zero-allocation domains. Turn Oscilla from a grid-placer into a relational dataflow engine.

> Full specification: `docs/NEW_LAYOUT_SYSTEM.md`

### 6.1 The Core Paradigm Shift

In the old model, a `Grid` block physically allocated memory for `uv` and `rank` and wrote to VRAM.

In the new model, **domain generation is free.** `rank` and `index` are not arrays in the Compute Arena. They are **Hardware Intrinsics** evaluated on-the-fly from `global_invocation_id.x`. They only materialize into physical memory if explicitly wired into a `Render` block or transformed by an expensive node whose result needs caching.

### 6.2 InstanceDomain Block

The invisible heartbeat of the patch. Dictates the WebGPU compute thread dispatch count.

- **Input:** `count` (`Scalar<int>`). Example: 500.
- **Outputs:**
  - `rank` (`Field<float>`): $0.0 \rightarrow 1.0$
  - `index` (`Field<int>`): $0 \rightarrow N-1$
- **Compiler Action:** Mints a unique `instanceId`. Tells `ScheduleNagaLowering.ts` to set `maxActiveLanes = 500`.

#### Intrinsic Resolution (Zero-Allocation)

When the compiler encounters `Domain.rank`, it does NOT issue a `buffer_load`. It emits the hardware derivation directly into the AST:

```typescript
// Inside emitMaterializeExprComponentF32()
if (expr.intrinsicKind === 'domain_property') {
  if (expr.property === 'index') {
    // Returns gid.x directly as a float
    return emitLaneAsF32(args.ctx, args.laneExpr, args.source);
  }
  if (expr.property === 'rank') {
    // Returns gid.x / (laneCount - 1.0)
    const laneAsF32 = emitLaneAsF32(args.ctx, args.laneExpr, args.source);
    const denom = emitLiteralF32(args.ctx, args.builtins,
      args.targetPlan.laneCount - 1, args.source);
    return args.ctx.addExpression(
      { kind: 'binary', op: 'div', left: laneAsF32, right: denom },
      args.source
    );
  }
}
```

### 6.3 ScatterUV Block (Halton Sequence)

Replaces `Grid.uv` for organic distributions. Uses Halton sequence math to generate mathematically perfect, non-overlapping 2D distributions.

- **Input:** `index` (`Field<int>`). Sourced from `InstanceDomain`.
- **Output:** `uv` (`Field<vec2>`). Organic distribution in $[0, 1]^2$.
- **Implementation:** Port existing `emitHaltonFromLane` prime-base digit extraction logic. Runs entirely in the ALU, outputting `vec2` dynamically.

### 6.4 SamplePath Block (Relational Mapping)

The crown jewel of the new architecture. Allows instances to spatially map themselves to the surface of Type 2 Bezier curves.

- **Inputs:**
  - `path` (`ParametricShape`): The target Type 2 curve
  - `t` (`Field<float>`): Where along the curve to sample (usually `Domain.rank`)
- **Outputs:**
  - `position` (`Field<vec2>`)
  - `tangent` (`Field<vec2>`)

#### WGSL Compute Kernel

The compiler evaluates Type 2 Bezier math **inside the Compute Shader**, independent of the Vertex Shader. Because the engine uses strict SoA memory ABI for Type 2 parameters, the Compute Shader can trivially read source curve control points from `arena_out`:

```wgsl
@compute @workgroup_size(64, 1, 1)
fn compute_sample_path(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let gid = global_id.x;
    if (gid >= 500u) { return; }

    // 1. Fetch 't' for this specific instance (from Domain.rank)
    let t = arena_out[t_offset + gid];

    // 2. Fetch source curve's parameters (Scalar → stride 1, broadcast read)
    let path_base = path_param_offset;
    let p0 = vec2<f32>(arena_out[path_base + 0u], arena_out[path_base + 1u]);
    let p1 = vec2<f32>(arena_out[path_base + 2u], arena_out[path_base + 3u]);
    let p2 = vec2<f32>(arena_out[path_base + 4u], arena_out[path_base + 5u]);
    let p3 = vec2<f32>(arena_out[path_base + 6u], arena_out[path_base + 7u]);

    // 3. Evaluate Cubic Bezier at 't'
    let u = 1.0 - t;
    let pos = (u*u*u)*p0 + (3.0*u*u*t)*p1 + (3.0*u*t*t)*p2 + (t*t*t)*p3;
    let tangent = (3.0*u*u)*(p1 - p0) + (6.0*u*t)*(p2 - p1) + (3.0*t*t)*(p3 - p2);

    // 4. Write to target instance's SoA layout (Field → stride = gid)
    arena_out[target_pos_x_offset + gid] = pos.x;
    arena_out[target_pos_y_offset + gid] = pos.y;
    arena_out[target_tan_x_offset + gid] = tangent.x;
    arena_out[target_tan_y_offset + gid] = tangent.y;
}
```

### 6.5 Acceptance Criteria

**AC 1 (Zero-Allocation Intrinsics):** Compile `InstanceDomain(100) → rank → Math.Multiply(5.0) → Render.scale`. The compiler must allocate exactly ONE `arena_out` block (for `Render.scale`). It must NOT allocate a block for `rank`. The multiply expression must inline `gid.x / 99.0`.

**AC 2 (Organic Halton Scattering):** Compile `InstanceDomain(256) → index → ScatterUV → Render.positionXY`. Shapes must be visually distributed evenly across `[0,1]` with no discernible rows/columns.

**AC 3 (Cross-Cardinality Transfer):** `CubicBezier(laneCount: 1)` wired to `SamplePath.path`. `InstanceDomain(10) → rank` wired to `SamplePath.t`. The compute shader must use base offset `0` for `p0..p3` (Scalar broadcast) but write with `+ gid` (Field iteration).

---

## 7. Phase 4: The 2.5D MatCap Upgrade

**Goal:** Transition from flat 2D vector shapes to 3D-lit, depth-sorted 2.5D materials.

### 7.1 Orthographic View-Projection Matrix

Introduce a proper camera system:
- **View Matrix (V):** 4x4 matrix representing the inverse camera transform. For isometric 2.5D, rotated 30° on X-axis and 45° on Y-axis.
- **Projection Matrix (P):** Orthographic (no perspective divide). Parallel lines remain parallel.
- **Camera UBO:** Uploaded once per frame. All sprites multiply local vertices against global `viewProj`.

The Uber Shader transforms vertices via:
```wgsl
let clip_pos = global.view_proj_matrix * model_matrix * vec4<f32>(local_pos, 0.0, 1.0);
```

**Hard Invariant:** The w-component must always evaluate to `1.0` after orthographic projection. If w ≠ 1.0, the perspective divide will warp sprites.

### 7.2 Render Queue Routing (Opaque vs Transparent)

Two rendering strategies based on material type:

| Queue | Depth Strategy | Sort Strategy | Performance |
|-------|---------------|---------------|-------------|
| **Opaque** | Hardware Z-Buffer (`GL_DEPTH_TEST` + `glDepthMask(true)`) | None needed (hardware handles it) | Maximum GPU throughput |
| **Transparent** | Hardware depth TEST but NO depth WRITE (`glDepthMask(false)`) | CPU Radix sort, back-to-front | Required for blending |

#### Sort Key Generation (for Transparent queue)

Generate a 64-bit sort key: `(depth << 32) | (material_id << 16)`. Execute back-to-front rendering with depth mask disabled.

### 7.3 MatCap Material Node

MatCap (Material Capture) shading maps 2D surface normals to a pre-photographed spherical material texture.

#### Shader Logic

The Uber Shader takes normals generated by Bezier/Blob math, transforms them into View Space via the Inverse-Transpose matrix, and samples the spherical texture:

```wgsl
// Transform 2D parametric normal to View Space
let normal_view = (global.normal_matrix * vec4<f32>(surface_normal, 0.0, 0.0)).xy;

// Map to MatCap UV (sphere → 2D texture)
let matcap_uv = normal_view * 0.5 + 0.5;

// Sample the spherical texture
let material_color = textureSample(matcap_texture, matcap_sampler, matcap_uv);
```

This gives flat vector shapes the appearance of polished 3D manufactured materials (clay, brushed steel, glass, liquid gold) with virtually zero performance cost.

### 7.4 Pitfalls

- **Z-Fighting:** Coplanar sprites at identical Z coordinates will flicker. Enforce minuscule depth offsets (`z + 0.0001`) for coplanar elements.
- **Alpha-Discard Trap:** Transparent quad corners will write to Z-buffer, masking geometry behind them. Fragment shader must `discard` fully transparent pixels.
- **Sub-Pixel Jitter:** Slow camera movements cause pixel art to shimmer. Snap camera position to screen-pixel boundaries.

---

## 8. Phase 5: Compute Dynamics

**Goal:** Give the Naga AST the hardware intrinsics required for particles to react to each other — crossing the gap from Kinematics (independent particles) to Dynamics (interacting particles).

### 8.1 Atomic Naga Intrinsics

Add `AtomicAdd` and `AtomicExchange` to the `NagaEmitterInstruction` specification. These must compile down to Naga `Statement::Atomic` AST nodes interacting with `read_write` SSBO targets.

```typescript
// New NagaEmitterInstruction variants
{ op: 'AtomicAdd', target: 'state:spatial_grid', lane: 'cell_index', value: 1 }
{ op: 'AtomicExchange', target: 'state:linked_list', lane: 'cell_index', value: 'gid.x' }
```

### 8.2 Ping-Pong Double-Buffered State

Expand `planStatefulStorage` to support double-buffered SSBOs. Frame N safely reads from Frame N-1's buffer while writing to the current frame's buffer. This eliminates Read-After-Write hazards.

#### Implementation

- `planStatefulStorage` allocates two identical memory buffers
- Manage `Bind Group 0` (Read) vs `Bind Group 1` (Write) flipping per-frame
- The `MemoryManifest` handles this automatically for `state:` resources

### 8.3 Spatial Hashing

Build the compute blocks that sort particles into a virtual grid for localized collision detection and Eulerian fluid simulation.

#### Multi-Pass Linked List Algorithm

1. **Clear Grid:** Zero out the grid counter and head arrays
2. **Count (AtomicAdd):** Each particle atomically increments the counter for its grid cell
3. **Link (AtomicExchange):** Each particle atomically swaps itself into the head of the linked list for its cell
4. **Read Neighbors:** Each particle reads the linked list for its cell and adjacent cells to find neighbors

---

## 9. Phase 6: Textures & Type 5 Shapes (MSDF Text)

**Goal:** Support sampled textures and crisp, scale-independent typography.

### 9.1 Texture Atlas Bindings

Expand the Resource Library to pack and bind `sampler2DArray`. Using a texture array avoids breaking draw batching across different fonts/materials.

### 9.2 CPU Text Shaping (HarfBuzz/Metrics)

Integrate HarfBuzz (or similar) on the CPU side to convert UTF-8 strings into positioned glyph layout metrics. This generates cached `4N` vertices and `6N` indices (quads per visible character), with bounding boxes mapped to `[0.0, 1.0]` atlas coordinates.

**Hard Invariants:**
- For N visible characters, generate exactly 4N vertices and 6N indices
- All UV coordinates strictly within `[0.0, 1.0]`
- Font atlas texture is read-only after generation
- UTF-8 parser must validate strictly (invalid bytes → U+FFFD replacement character)

### 9.3 MSDF Rendering in Uber Shader

Implement sub-pixel interpolation for razor-sharp vector text at any scale:

```wgsl
// Sample the MSDF texture (3-channel signed distance field)
let msd = textureSample(font_atlas, font_sampler, uv).rgb;

// Compute the median of the three channels
let sd = median(msd.r, msd.g, msd.b);

// Screen-space derivative for scale-independent thresholding
let screen_px_range = font_px_range * (dpdx(uv.x) + dpdy(uv.y)) * 0.5;
let screen_px_distance = screen_px_range * (sd - 0.5);
let opacity = clamp(screen_px_distance + 0.5, 0.0, 1.0);
```

The `dFdx`/`dFdy` (WGSL: `dpdx`/`dpdy`) derivatives ensure the threshold adapts to screen-space scaling, keeping text crisp at any zoom level.

---

## 10. Phase 7: Continuity & GPU Dynamics

**Goal:** Re-implement the core Continuity system (Gauge math, Slew filtering, Crossfading) on the GPU.

> **Depends on:** Phase 5 (Atomics/Dynamics primitives)

This phase was originally implemented prematurely on the legacy CPU architecture and had to be reverted. It must be rebuilt using the GPU compute primitives from Phase 5.

### Key Objectives

1. Migrate Gauge Apply and Gauge Decay math to GPU compute using Atomics
2. Implement Slew filtering and Crossfade policies natively in the compute pass
3. Replace the CPU-side `ContinuityApply.ts` with a zero-allocation GPU execution boundary

### State Ownership

- **The UI (React):** Owns the *definition* of the user's intent
- **The PatchStore:** Stays as the high-level representation of the graph
- **The Fast-Path:** When a slider moves, React triggers a direct Wasm call to Rust. Rust updates the GPU Control Uniform Buffer instantly.
- **Result:** The PatchStore reflects state for persistence/serialization, but the **Rust Control Buffer** is the operational source of truth for the renderer

---

## 11. Current State & Audit Status

### Commit History (on `bmf/fix-safari-surface-resize-race`)

| Phase | Commits | Audit Status |
|-------|---------|-------------|
| Phase 0 | `98cda8d` through `b162831` (5 commits) | Work verified by Gemini |
| Phase 1 (Manifest/MMU) | `e125c56` | Verified by Gemini — `ArenaAddressPlan` deleted, symbolic manifest emitted, Rust MMU resolves symbols |
| Phase 1 (Silicon) | `fb01a04` through `d6fddcd` (5 commits) | **Verified correct** by Gemini audit. Forensic string-parsing removed, O(1) fast-path map works, intersection logic correct |
| Phase 2 | `05dc77e` through `3adaa30` (5 commits) | **SUSPECT — Incomplete.** Gemini found the Rust `DispatchKernel::execute` was skeletal — arguments not resolved to bind groups. Agent committed additional fixes but was not re-audited. |
| Phase 3 | `14dc6d5` through `a27c0e1` (4 commits) | **SUSPECT — Never audited.** Created in final minutes of conversation. Given Phase 2 was incomplete, these are highly suspect. |

### What Needs Verification

1. **Phase 2 Rust execution:** Does `compute.rs` actually resolve `DispatchKernel` arguments to physical bind groups? Or is it still skeletal?
2. **Phase 2 Texture2D creation:** Does `memory.rs` actually create `wgpu::Texture` objects for `grid_2d` manifest entries?
3. **Phase 3 InstanceDomain:** Does the compiler actually emit zero-allocation intrinsics? Or does it allocate arena buffers for `rank`/`index`?
4. **Phase 3 SamplePath:** Does the compute shader actually read source curve control points via SoA addressing?

### Tickets Never Created

The following phases from the plan have **no tickets in the tracker** — they were defined in the roadmap but the original tickets were purged during backlog cleanup and never recreated:

- **Phase 4:** 2.5D MatCap Upgrade (Ortho projection, render queues, MatCap material)
- **Phase 5:** Compute Dynamics (Atomics, Ping-Pong state, Spatial Hashing)
- **Phase 6:** Textures & MSDF Text
- **Phase 7:** Continuity & GPU Dynamics (exists as `oscilla-phase-6-8qv` but depends on nonexistent Phase 5)

---

## 12. Reference Documents

| Document | Location | Contents |
|----------|----------|----------|
| Agent Engineering Standards | `design-docs/gemini-plan/AGENT_ENGINEERING_STANDARDS.md` | Hard invariants: zero-alloc, ABI safety, absolute vs relative addressing, Naga AST firewall, SoA addressing formula |
| Rust Renderer Spec | `docs/current/renderer/RUST-RENDERER.md` | 4-stage renderer architecture: Memory, Compute, Render Pipeline, Execution Loop |
| New Layout System | `design-docs/gemini-plan/NEW_LAYOUT_SYSTEM.md` | InstanceDomain, ScatterUV, SamplePath — full spec with WGSL and acceptance criteria |
| Silicon Phase 1 Plan | `.agent_planning/SILICON-PHASE-1-PLAN.md` | UpdateClass data flow, O(1) UI fast-path, Rust MMU opaque accessors |
| WebGPU Complete Specs | `docs/current/webgpu-specs/` | 20+ documents covering memory layout, Naga lowering, compute dispatch, render pass, observability |
| Dual Representation for Shapes | `design-docs/gemini-plan/Dual_Representation_for_Shapes-2026-03-20-17-44-29.md` | Shape taxonomy (Types 1-5), SoA memory ABI, 2.5D projection, MSDF text, fluid dynamics |
| Canonical Spec | `design-docs/CANONICAL-oscilla-v2.5-20260109/` | The master spec — type system, invariants, all domain specs |
