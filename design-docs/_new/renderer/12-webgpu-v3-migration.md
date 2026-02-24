# Oscilla WebGPU v3.0 Migration (f32-Only, Safari+Chrome)

Status: Draft  
Date: February 22, 2026  
Audience: Runtime, Compiler, Renderer maintainers

## 1. Scope And Constraints

This document evaluates the proposed WebGPU v3.0 architecture against the current app and defines the migration plan.

// [LAW:one-source-of-truth] One canonical runtime target: WebGPU only.
- Runtime target: WebGPU only.
- Browser support target: latest Safari and latest Chrome.
- If WebGPU is unavailable or device creation fails, app fails fast (no fallback renderer).

// [LAW:single-enforcer] Numeric policy is enforced once at compiler and WGSL emission boundaries.
- Numeric policy: `f32` only across runtime and shaders.
- No `f16` path and no `shader-f16` dependency.
- No `f64` in shader code (WGSL does not support it).

## 2. Current State (As Implemented)

### 2.1 Runtime Execution
- Frame execution is CPU-side (`src/runtime/ScheduleExecutor.ts`) with two-phase semantics.
- Render output contract is `RenderFrameIR` (`src/render/types.ts`), currently path-instance based.
- CPU computes scalar/field/state logic and assembles draw ops before render submission.

### 2.2 Renderer
- Initial WebGPU renderer exists (`src/render/webgpu/WebGPURenderer.ts`):
  - Path fill rendering using WGSL vertex+fragment pipeline.
  - CPU tessellation for MOVE/LINE/CLOSE via `PathTessellator`.
  - Compute scaffolding pass exists but is not yet connected to runtime graph semantics.
- Animation loop renders through WebGPU runtime path (`src/services/AnimationLoop.ts` + `src/services/RuntimeService.ts`).
- Fail-fast behavior exists for missing `navigator.gpu`.

### 2.3 What Is Not Yet v3
- Runtime data model is still CPU-owned arrays + CPU schedule execution.
- Blocks are not yet compiled directly into WGSL compute kernels.
- State/gauge continuity is not yet GPU-native.
- Draw-indirect path is not yet wired.
- Observability readback path is not yet decoupled GPU snapshot compute.

### 2.4 Terminology Baseline (Current Canonical Terms)
// [LAW:one-source-of-truth] Terminology must reflect current architecture to prevent dual meanings.
- `slotMeta` was not deleted; it remains the semantic slot catalog in `CompiledProgramIR`.
- `arenaLayout` is the physical numeric memory layout (offset/stride/laneCount/length) emitted by the compiler.
- `RuntimeState.arena` (`Float32Array`) is the canonical numeric runtime store.
- `ExprAddressTable` (`slotToArena`, `slotLookup`, `scalarExprToArenaOffset`) is the canonical runtime address index.
- `values.objects` still exists for non-numeric/object payloads (including render frame output refs).
- `values.shape2d` remains a dedicated packed `Uint32Array` bank.
- `RuntimeState.state` (stateful primitive memory) is still CPU `Float64Array` today and is a migration target.

### 2.5 Old -> New Vocabulary Map

| Old phrase | Use this now |
| --- | --- |
| "slotMeta was replaced by arena" | "Runtime numeric addressing moved to `arenaLayout` + `ExprAddressTable`; `slotMeta` remains semantic metadata." |
| "slotMeta maps runtime reads/writes" | "`ExprAddressTable.slotToArena` maps runtime numeric reads/writes; `slotMeta` provides type/storage metadata." |
| "signal array vs field array storage" | "Unified numeric arena with lane semantics (`laneCount`), plus object/shape side banks where needed." |
| "storage class `f64` means Float64 runtime numeric store" | "In current runtime hot paths, numeric values are read/written from `RuntimeState.arena` (Float32). Storage labels are metadata compatibility." |
| "everything already GPU-ready" | "Arena groundwork is in place; state/gauge/render-indirect/readback are still migration phases." |

## 3. Spec Evaluation Against Current App

| Proposed v3 Area | Current Status | Decision |
| --- | --- | --- |
| Unified GPU buffer ownership for scalar/field/state/gauge | Partial | Adopt fully |
| Schedule as compute dispatch graph | Not implemented | Adopt fully |
| Blocks compiled to shader code | Not implemented | Adopt fully |
| Renderer as absolute sink over GPU-resident data | Partial | Adopt fully |
| Indirect draw command generation on GPU | Not implemented | Adopt |
| Continuity/gauge compute pre-pass | Not implemented | Adopt |
| Async debug snapshot readback | Not implemented | Adopt |
| Optional `f16` optimization | Not needed | Reject for v3 |

## 4. Target v3 Architecture (Oscilla-Specific)

## 4.1 Canonical GPU Storage Model
// [LAW:one-source-of-truth] One canonical numeric store: unified arena offsets emitted by compiler, consumed by runtime and WGSL.
- Compiler emits one canonical `GpuLayout` derived from `arenaLayout` + schedule metadata, with semantic joins from `slotMeta` where needed.
- Runtime addressing for compute/render bindings is generated from one index source (v3 successor to `ExprAddressTable`).
- Runtime allocates persistent buffers:
  1. `ArenaRead` (`storage`, `f32`) and `ArenaWrite` (`storage`, `f32`) as full-frame ping-pong buffers.
  2. `ShapeBank` (`storage`, `u32`) for handles/topology/packed geometry metadata.
  3. `DrawIndirectBuffer` (`storage | indirect`, `u32`) for GPU-written draw commands.
  4. `DebugSnapshotBuffer` (`storage`) + `DebugReadbackBuffer` (`copy_dst | map_read`) for bounded observability.
- `ArenaRead`/`ArenaWrite` are segmented by offset ranges:
  - external inputs
  - scalars
  - fields
  - state
  - gauge
- No CPU object references are permitted in compute hot paths; cross-stage references are numeric handles only.
- Memory packing policy for hot paths is SoA only (AoS disallowed).

## 4.2 Memory Layout Rules (WebGPU-Compatible)
// [LAW:single-enforcer] Compiler layout stage is the only authority enforcing GPU alignment and stride rules.
- Arena numeric storage uses scalar addressing (`array<f32>`) and explicit float offsets.
- Typed storage structs (for non-arena buffers) follow WebGPU alignment constraints:
  - `f32`: 4-byte alignment
  - `vec2<f32>`: 8-byte alignment
  - `vec3<f32>`: 16-byte alignment (padded)
  - `vec4<f32>`: 16-byte alignment
- `ShapeBank` and indirect command payloads are `u32`-typed and packed as explicit integer lanes.

## 4.3 Compute Phase Graph Per Frame
// [LAW:dataflow-not-control-flow] Pass order is fixed every frame; behavior variability is data-driven by buffer values/counts.
- Fixed pass order:
  1. `InputWritePass` (host writes current external inputs to the designated arena segment before eval)
  2. `GaugeApplyPass`
  3. `ScalarEvalPass`
  4. `FieldEvalPass`
  5. `StateWritePass`
  6. `DrawPrepPass` (instance cull/count + indirect args)
  7. `DebugExtractPass` (throttled by write range, not by changing pass topology)
  8. `ArenaSwap` (`ArenaRead <-> ArenaWrite`)

## 4.4 Blocks-To-WGSL Compilation
// [LAW:one-type-per-behavior] One lowering path: block semantics lower to a shared WGSL IR, then emitted to WGSL text.
- Introduce WGSL IR stages:
  - `BlockGraph -> EvalIR -> WgslModuleIR -> WGSL source`.
- Scalar and field blocks lower to separate entry points with shared function library.
- Stateful blocks lower to read/write operations against state ping/pong bindings.
- No backend-specific semantics in blocks; only lowering adapters at compile boundary.

## 4.5 Geometry And Rendering
// [LAW:single-enforcer] Geometry ownership is enforced by one Assembler boundary; renderer never reinterprets graph semantics.
- Generator/deformer compute writes vertex payloads into GPU field segments.
- Assembler provides stable mesh metadata (`vertexOffset`, `indexOffset`, `indexCount`) and topology mode.
- Render pass consumes:
  - Vertex streams from GPU buffers
  - Instance transforms from layout buffers
  - Color/style from GPU buffers
  - Indirect draw args from `DrawIndirectBuffer`

## 4.6 Observability
// [LAW:single-enforcer] UI reads one bounded snapshot interface, not arbitrary runtime buffers.
- Dedicated compute extracts bounded debug views.
- UI polls async readback at 15 Hz (or configured rate), decoupled from render cadence.

## 5. Prerequisite Refactors (Must Complete Before Full WebGPU Cutover)

// [LAW:verifiable-goals] Prerequisites are hard gates with explicit completion checks.
- P1: Remove `f64` state dependency from hot runtime paths.
  - Stateful time primitives (`Phasor`, related oscillators) must use bounded phase accumulation (`phase = fract(phase + freq * dt)`).
  - Runtime no longer depends on unbounded `tMs` accumulation inside state slots.
- P2: Remove `values.objects` from compute/render hot path contracts.
  - All runtime-crossing references lower to numeric handles (`u32`) into arena/shape banks.
  - `RenderFrameIR` and intermediate runtime products are handle-driven, not object-graph-driven.
- P3: Enforce GPU-compatible layout at compiler boundary.
  - Arena offset emission is authoritative and consumed unchanged by runtime and WGSL emission.
  - Typed non-arena buffers satisfy required alignment/stride constraints.
- P4: Enforce SoA memory packing for GPU-evaluated payloads.
  - Lane-major SoA buffers are canonical for compute and render bindings.
  - AoS layouts are rejected for GPU hot-path payloads.

## 6. Migration Plan

## Phase A: Compiler Layout + GPU Runtime Skeleton
- Deliverables:
  - `GpuLayout` generation from current `arenaLayout` + schedule metadata (with semantic annotations from `slotMeta` only where required).
  - One canonical runtime address table for GPU bindings (replacing split lookup logic in consumers).
  - Persistent `ArenaRead`/`ArenaWrite` allocator + bind-group schema.
  - Persistent `ShapeBank` and `DrawIndirectBuffer` allocation + binding schema.
  - Frame graph runner with no-op compute kernels to validate wiring.
- Exit criteria:
  - App boots on Safari+Chrome with WebGPU device creation.
  - Frame graph executes all phases without rendering regressions.

## Phase B: Scalar + Field Compute Lowering
- Deliverables:
  - Scalar compute kernel generation for current scalar ops.
  - Field compute kernel generation for current field math/deform ops.
  - CPU execution path replaced for migrated ops.
- Exit criteria:
  - Golden demo parity for migrated blocks.
  - CPU runtime no longer evaluates migrated ops.

## Phase C: Stateful/Gauge Compute
- Deliverables:
  - GPU ping/pong full-arena model with state/gauge segments for UnitDelay/Lag/Phasor class.
  - Gauge apply/decay compute pass.
  - Hot-swap migration kernels (`copyBufferToBuffer` + transform compute when needed).
- Exit criteria:
  - Continuity invariants preserved across graph edits.
  - Stateful demos match expected temporal behavior.

## Phase D: Renderer Sink Finalization
- Deliverables:
  - Full path feature parity (curves, multi-contour, stroke strategy).
  - Draw-indirect submission path from GPU-produced command buffer.
  - Removal of legacy runtime renderer code paths.
- Exit criteria:
  - Render pass consumes only GPU-resident data.
  - No runtime Canvas2D/SVG submission path remains.

## Phase E: Observability + Perf Hardening
- Deliverables:
  - Debug snapshot extraction compute + async readback.
  - Upload/staging minimization and stable frame-time tuning.
  - Memory layout docs and perf baselines.
- Exit criteria:
  - UI debug panels work via snapshot pipeline.
  - Benchmarks show no per-frame allocation spikes in hot path.

## 7. Verification Strategy

// [LAW:verifiable-goals] Each milestone has machine-checkable acceptance criteria.
- Automated checks per phase:
  - `npm run -s typecheck`
  - targeted `vitest` suites for compiler/runtime/renderer modules
  - screenshot regression script:
    - `./scripts/get-screenshot-of-demo-patch.sh simple.hcl`
  - browser matrix manual+automated smoke:
    - Safari latest
    - Chrome latest
- Add phase-specific fixtures:
  - continuity hot-swap scenario
  - high-instance field deformation scenario
  - debug readback throughput scenario

## 8. Immediate Next Work (Kickoff)

1. Implement prerequisite P1 (`f64` state eradication with bounded-phase temporal math).
2. Implement prerequisite P2 (numeric handles replacing `values.objects` in hot path contracts).
3. Implement prerequisite P3+P4 (GPU layout enforcement + SoA-only hot path packing).
4. Define and implement `GpuLayout` schema in compiler output.
5. Add `GpuRuntimeState` owner object to runtime service layer.
6. Introduce shader module cache keyed by compiled program revision.
7. Start scalar kernel lowering for currently supported scalar op subset.
8. Lock policy docs:
   - WebGPU-only runtime
   - `f32`-only numeric model
   - Safari+Chrome support envelope

## 9. Open Technical Decisions

- Final WGSL module partition strategy (single monolith vs per-phase modules).
- Workgroup sizing policy by kernel class (scalar, field, state, draw prep).
- Stroke implementation strategy in v3 sink:
  - analytic in fragment
  - or tessellated stroke geometry
- Whether draw-indirect is universal path or feature-gated with one direct-draw fallback inside WebGPU (still no non-WebGPU renderer fallback).
- Full-arena ping-pong cost model for large patches:
  - always swap full arena
  - or maintain fixed immutable ranges with copy-on-write policy
- Input injection semantics for no-latency external values:
  - host writes active input range in the read arena before dispatch
  - or input pass mirrors values across both arenas each frame
