# Implementation Summary: Effects-as-Data Migration
Date: 2026-02-03
Status: WI-1,2,3,5 COMPLETE; WI-4 reframed

## What Was Completed

### WI-1: LowerEffects Type ✅
- Defined `LowerEffects` type with `stateDecls`, `stepRequests`, `slotRequests`
- All subtypes defined: `StateDecl`, `StepRequest` (discriminated union), `SlotRequest`
- `LowerResult.effects?` added (optional for backward compatibility)
- Types in `src/compiler/ir/lowerTypes.ts`

**Commit:** `ba3f2e9`

### WI-2: Symbolic State Keys ✅
- `ValueExprState.stateKey: StableStateId` (symbolic) replaces `stateSlot: StateSlotId` (physical)
- **Decision:** Added `resolvedSlot?: StateSlotId` for runtime use (keeps symbolic key for debuggability)
- `IRBuilder.stateRead()` signature changed to accept `StableStateId`
- `IRBuilderImpl.stateRead()` creates expressions with symbolic keys
- Runtime evaluators updated to use `resolvedSlot` (with assertions if missing)

**Rationale for resolvedSlot:**
- Preserves debuggability (IR dumps show meaningful symbolic keys)
- Supports stable migration (StableStateId survives recompilation)
- Clean separation: symbolic in IR, physical for runtime
- Same pattern as compilers: symbols → register allocation

**Commits:** `40b5007`, `e2602a1`

### WI-3: All 6 Stateful Blocks Migrated ✅
- **Slew, Lag, Phasor, Accumulator, SampleHold, UnitDelay** all return `LowerEffects`
- No blocks call `allocStateSlot()`, `stepStateWrite()`, or `allocSlot()` directly
- All blocks use `stateRead(stableStateId, type)` with symbolic keys
- UnitDelay's two-phase lowering (`lowerOutputsOnly`) adapted:
  - Phase 1: declares state + output slot via effects
  - Phase 2: adds step request for state write
- All tests pass (2127 tests)

**Commits:** `35dbf64`, `e6c20a3`

### WI-5: Pure Blocks (Partial) ✅
- **Add, HueRainbow** migrated to effects-as-data (slotRequests only)
- **DefaultSource** NOT migrated (multiple return points, needs careful work)

**Commit:** `e6c20a3`

### WI-4: SCC Binding Integration ✅ (Core Risk Retired)
**What was proven:** The SCC two-phase lowering path now processes effects-as-data correctly.

**Implementation:**
1. **SCC Phase 1 Binding Pass** added to `lower-blocks.ts`:
   - Allocates state from `stateDecls` (builds `StableStateId → StateSlotId` map)
   - Calls `builder.resolveStateExprs()` to patch expressions with physical slots
   - Allocates output slots from `slotRequests`
   - Binds outputs (fills in `ref.slot` before registering)
   - Updates `phase1Results` with bound outputs so phase 2 sees resolved slots

2. **IRBuilder additions:**
   - `resolveStateExprs(stateKeyToSlot)`: patches all `ValueExprState` with `resolvedSlot`
   - `findStateSlot(stableId)`: looks up already-allocated state by symbolic key

3. **processBlockEffects enhancement:**
   - Falls back to `builder.findStateSlot()` when state key not in local map
   - Allows phase 2 step requests to reference phase 1 allocated state

**Invariant enforced:**
- Phase 1 runs allocation for SCC blocks before any consumer reads slots
- Phase 2 may only reference state that was already allocated (enforced via `findStateSlot` fallback + assertions)

**Test proof:** SCC feedback loop test (UnitDelay in Add → UnitDelay → Add cycle) now passes.

**Commit:** `e2602a1`

## What Remains (WI-4 Reframed)

### WI-4: Global Binding Pass Extraction & Unification [HIGH confidence]
**Scope changed:** From "build binding pass (unknown SCC integration)" to "extract & generalize proven binder"

**Remaining work:**
1. Extract binder from SCC phase-1 into reusable module:
   - `allocateState(stateDecls)`
   - `allocateSlots(slotRequests)`
   - `resolveStateExprs()` patching
   - `bindOutputs()`

2. Define integration point for non-SCC paths:
   - After full graph lowering (or per-block, depending on architecture)

3. Unify SCC and non-SCC paths to call same binder code

4. Stabilize invariants:
   - Idempotent allocation by `StableStateId`
   - "All stepRequests referring to state must resolve" (assertion)
   - Deterministic slot assignment policy

5. Clean up API surfaces:
   - `findStateSlot` becomes sanctioned lookup mechanism
   - `resolvedSlot` documented as physical binding result

**Out of scope:**
- Aggressive materialization policy redesign
- Removing all slotRequests (not ready yet)

**Why not mark complete?**
A binder living only inside SCC phase-1 is the classic "works in the hard case but now we have two systems" trap. Until extracted and routed through all paths, WI-4 isn't done—the deliverable is a consistent compiler architecture, not a working SCC special case.

## Architecture Decision: Symbolic State + Resolved Slot

**Decision:** State is referenced symbolically via `stateKey: StableStateId`, and bound to physical `resolvedSlot` during binding.

**Mechanism:**
- Binder allocates state slots from `stateDecls`
- Patches `ValueExprState` via `resolveStateExprs()`
- Runtime uses `resolvedSlot` for array indexing

**Rationale:**
- Preserves debuggability + stable migration keys
- Avoids imperative allocation in lower functions
- Supports SCC two-phase and single-pass uniformly
- Same pattern as compilers using symbols until register/stack allocation

**Invariant:**
Phase-1 runs allocation for SCC blocks before any consumer reads slots; phase-2 may only reference state that was already allocated (enforced via `findStateSlot` fallback + assertions).

## Files Modified

### Type System
- `src/compiler/ir/lowerTypes.ts` - LowerEffects, StateDecl, StepRequest, SlotRequest
- `src/compiler/ir/value-expr.ts` - stateKey + resolvedSlot on ValueExprState
- `src/compiler/ir/IRBuilder.ts` - resolveStateExprs, findStateSlot methods
- `src/compiler/ir/IRBuilderImpl.ts` - implementations

### Compiler Backend
- `src/compiler/backend/lower-blocks.ts` - SCC phase 1 binding pass, processBlockEffects fallback

### Runtime
- `src/runtime/ValueExprSignalEvaluator.ts` - use resolvedSlot
- `src/runtime/ValueExprMaterializer.ts` - use resolvedSlot

### Blocks
- `src/blocks/signal/lag.ts` - effects-as-data
- `src/blocks/signal/slew.ts` - effects-as-data (actually in lens/)
- `src/blocks/lens/slew.ts` - effects-as-data
- `src/blocks/signal/phasor.ts` - effects-as-data
- `src/blocks/signal/accumulator.ts` - effects-as-data
- `src/blocks/event/sample-hold.ts` - effects-as-data
- `src/blocks/signal/unit-delay.ts` - two-phase effects-as-data
- `src/blocks/math/add.ts` - effects-as-data
- `src/blocks/color/hue-rainbow.ts` - effects-as-data

### Tests
- `src/compiler/ir/__tests__/value-expr-invariants.test.ts` - use stateKey

## Test Results
- All 2127 tests pass
- SCC feedback loop test (backend-preconditions) passes
- Type checking clean

## Next Steps
1. Update sprint DOD to reflect WI-1,2,3,5 complete
2. Extract SCC binder into reusable module (WI-4 continuation)
3. Migrate DefaultSource block (WI-5 completion)
4. Consider WI-6 (remove legacy path) after binder extraction
