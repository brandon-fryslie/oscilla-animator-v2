# P2-4: Scoped Naga IR Control Flow and Memory Model - CRITICAL Items

## Item 1: ScopeEnvironment is Dead Code
**Spec says**: "ScopeEnvironment enforces block-local ID ownership: entering a block pushes a child scope, exiting a block pops that scope, lookups traverse parent scope chain only. Result: IDs produced in a child block are inaccessible after block exit, preventing scope leaks by construction."
**Implementation**: `ScopeEnvironment` exists at `src/compiler/ir/naga-emitter/ScopeEnvironment.ts:3-22` but is NEVER imported by any module in the codebase. Zero consumers.
  - `NagaBuilder.ts` does NOT use `ScopeEnvironment` — it has its own `activeBlock` stack via `buildBlock()` at line 133-146.
  - `ScheduleNagaLowering.ts` does NOT use `ScopeEnvironment` — it has its own `activeBlock` stack via `LoweringCtx.withBlock()` at line 257-267.
**Gap**: [LAW:one-source-of-truth] violation. The spec-mandated scoping mechanism is dead code. The actual implementations use ad-hoc block stacking without lexical scope enforcement. Neither `NagaBuilder.buildBlock()` nor `LoweringCtx.withBlock()` prevent IDs from leaking across scope boundaries — they only manage statement list nesting.
**Classification**: CRITICAL — the spec's scope isolation guarantee ("IDs produced in a child block are inaccessible after block exit") is NOT mechanically enforced. It relies on correct usage of expression handles, not on a scope system that prevents access.

## Item 2: Mandatory Bounds Clamping for Dynamic Reads Not Consistently Present
**Spec says**: "For every bufferReadDynamic lowering path, the compiler injects: arrayLength(buffer), maxIndex = length - 1, safeIndex = min(rawIndex, maxIndex), final read using safeIndex."
**Implementation**:
  - `NagaBuilder.bufferRead()` at `NagaBuilder.ts:362-383` does NOT inject bounds clamping. It directly emits `Access { base, index }` + `Load { pointer }` with no array length check.
  - `ScheduleNagaLowering.ts` emits `buffer_load` expressions at various places (lines ~680-688) as `{ kind: 'buffer_load', buffer: '...', index: <expr> }` without bounds checks. The Rust shim simply emits `arena_in[index_expr]` at `lib.rs:428-431`.
  - Lane bounds clamping IS present via `emitLaneExprForLaneCount()` at `ScheduleNagaLowering.ts:544-568` and `resolveLaneExprForPlan()` at line 570-580, but this clamps the LANE expression (which threads through index computation), not the final buffer index.
  - The fluid GPU bundles at `fluid-gpu-bundle.ts:433-437` DO include `arrayLength` bounds checks in the WGSL helper functions.
**Gap**: The spec requires explicit `arrayLength` + `min(rawIndex, maxIndex)` clamping at the buffer access level. The simulation compute path relies on lane clamping upstream but does not add per-access array bounds checks. The Naga WGSL validator and WebGPU runtime will catch out-of-bounds at the GPU level, but the spec requires compiler-side injection for deterministic behavior across drivers.
**Classification**: CRITICAL — potential out-of-bounds GPU access if lane clamping is insufficient for a given buffer layout. The safety net is WebGPU's own bounds checking (which clamps to zero), but behavior is driver-dependent.
