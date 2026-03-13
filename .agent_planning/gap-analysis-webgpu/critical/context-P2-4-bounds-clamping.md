# Context: P2-4 - Dynamic Buffer Read Bounds Clamping

## Target State
Spec requires that EVERY dynamic buffer read path injects:
1. `arrayLength(buffer)` to get buffer length
2. `maxIndex = length - 1`
3. `safeIndex = min(rawIndex, maxIndex)`
4. Final read using `safeIndex`

This provides deterministic bounds behavior across all GPU drivers.

## Current State
### Simulation compute path (ScheduleNagaLowering)
- Lane expressions are clamped via `emitLaneExprForLaneCount()` at `ScheduleNagaLowering.ts:544-568` which emits `min(laneExpr, laneMaxExpr)` where `laneMaxExpr = laneCount - 1`
- But this clamps the LANE value, not the final buffer INDEX. The final index is computed as `offset + lane * laneStride + component * componentStride`. If any of offset/stride/componentStride are wrong, the index could exceed buffer length even with a clamped lane.
- `buffer_load` expressions in the ScheduleNagaLowering IR are emitted without `arrayLength` checks. The Rust shim translates them to direct `arena_in[expr]` indexing.

### NagaBuilder path
- `NagaBuilder.bufferRead()` at `NagaBuilder.ts:362-383` does not inject array length checks.
- `NagaBuilder.arrayLength()` exists at line 352-360 as a standalone API but is never called by `bufferRead()`.

### Fluid compute path
- `fluid-gpu-bundle.ts:433-437` and `478-484` include `arrayLength` bounds checks in `read_scalar_param` and `read_state_in` helpers: `if (idx >= arrayLength(&arena_in)) { return fallback; }`.
- This is the CORRECT pattern matching the spec.

## Files Involved
- `src/compiler/ir/naga-emitter/ScheduleNagaLowering.ts` — main simulation lowering
- `src/compiler/ir/naga-emitter/NagaBuilder.ts` — constrained builder API
- `src/compiler/wasm/rust/oscilla-naga-shim/src/lib.rs` — WGSL emission
- `src/services/fluid-gpu-bundle.ts` — fluid passes (correct reference)

## Suggested Approach
1. In the Rust shim's `BufferLoad` emission at `lib.rs:428-431`, inject `min(index_expr, arrayLength(&buffer) - 1u)` wrapping.
2. Alternatively, in `ScheduleNagaLowering.ts`, wrap every `buffer_load` emission with `min(computedIndex, arrayLength - 1)` expressions.
3. The fluid bundle's `read_scalar_param` pattern is the reference implementation.

## Risks
- Performance: adding `arrayLength` + `min` per access adds ~2-4 ALU instructions per load. For typical shader sizes (100-500 loads), this is negligible.
- Some drivers already clamp OOB reads to zero. Adding explicit clamping makes behavior deterministic across all drivers.
- Without clamping, a compiler bug in offset/stride calculation could cause a GPU crash on some drivers.
