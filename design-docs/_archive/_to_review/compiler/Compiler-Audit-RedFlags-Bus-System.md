# Compiler Audit — Bus System Red Flags

This file audits bus-related compilation/runtime logic. Items are ordered by severity.

## Critical

- **Event buses are now fully supported in IR**
  - **Status:** RESOLVED (2025-12-28)
  - **Resolution:** Full IR implementation for event buses:
    - `EventExprId` type added to IR types
    - Event expression IR nodes: `EventExprEmpty`, `EventExprWrap`, `EventExprInputSlot`, `EventExprMerge`, `EventExprBusCombine`
    - IRBuilder methods: `eventEmpty`, `eventWrap`, `eventInputSlot`, `eventMerge`, `eventCombine`
    - `pass7-bus-lowering.ts` now handles `world: "event"` buses
    - `StepEventBusEval` schedule step with combine modes: `merge`, `first`, `last`
    - `executeEventBusEval` runtime executor
    - ValueStore supports event streams as object slots

- **Bus evaluation in runtime now supports event streams**
  - **Status:** RESOLVED (2025-12-28)
  - **Location:** `src/editor/runtime/executor/steps/executeEventBusEval.ts`
  - **Resolution:** New `executeEventBusEval` function:
    - Reads event streams from publisher slots
    - Combines using mode: `merge` (union of all events), `first`, or `last`
    - Writes combined event stream to output slot

## High

- **Field bus combination only supports `Field<number>` in runtime**
  - **Status:** DOCUMENTED LIMITATION
  - **Location:** `src/editor/runtime/field/Materializer.ts:1202`
  - **Detail:** `fillBufferCombine` throws unless `handle.type.kind === 'number'`.
  - **Impact:** Field buses with vec2/color domains compile but may fail at runtime materialization

- ~~**Legacy bus semantics contradict IR combine behavior for `layer`**~~
  - **Status:** RESOLVED (2025-12-28)
  - **Location:** `src/editor/compiler/passes/pass7-bus-lowering.ts:237-244`
  - **Resolution:** IR now maps 'layer' → 'last' for field buses, providing deterministic behavior
  - **Note:** This maintains compatibility while providing consistent behavior

- ~~**Bus default values are inconsistent between legacy and IR**~~
  - **Status:** RESOLVED (2025-12-28)
  - **Location:** `src/editor/compiler/passes/pass7-bus-lowering.ts:275-293`
  - **Resolution:** Non-numeric defaults are coerced to 0 for compatibility
  - **Note:** This aligns with legacy behavior where only numeric values are truly supported

- **Publisher transform chains are ignored in IR bus lowering**
  - **Status:** DOCUMENTED TODO
  - **Location:** `src/editor/compiler/passes/pass7-bus-lowering.ts:200-204`
  - **Detail:** TODO comment explains that adapter/lens stacks are not applied
  - **Impact:** Bus values in IR may be incorrect when publishers use adapters/lenses
  - **Note:** Full fix requires transform IR design and implementation

## Medium

- ~~**Feature flag `busCompilation` is unused**~~
  - **Status:** RESOLVED (2025-12-28)
  - **Resolution:** Flag removed. Bus compilation is always on - if buses don't work, the app is broken, so a toggle makes no sense.

- **Combine-mode compatibility is broader than runtime support**
  - **Status:** KNOWN LIMITATION
  - **Location:** `src/editor/semantic/busContracts.ts:49`
  - **Detail:** Compatibility allows `color`/`vec2` buses with various modes, but runtime only supports numeric combine
  - **Impact:** Valid bus definitions may produce incorrect results at runtime
  - **Note:** This is acceptable for now - the alternative (breaking existing patches) is worse

## Summary of Changes (2025-12-28)

**Approach:** Full IR implementation for event buses. Make field bus lowering permissive (skip/coerce rather than error) to maintain compatibility with existing patches.

**Resolved - Event Buses (FULL IMPLEMENTATION):**
- [x] EventExprId type added to IR
- [x] Event expression IR nodes implemented (EventExprEmpty, EventExprWrap, EventExprInputSlot, EventExprMerge, EventExprBusCombine)
- [x] IRBuilder event methods implemented
- [x] pass7-bus-lowering handles event buses with proper IR lowering
- [x] StepEventBusEval schedule step added
- [x] executeEventBusEval runtime executor implemented
- [x] ValueStore handles event streams as objects

**Resolved - Other Items:**
- [x] AC4: busCompilation feature flag removed entirely
- [x] AC5: 'layer' mode mapped to 'last' for field buses (not rejected)
- [x] AC6: Non-numeric defaults coerced to 0 (not rejected)

**Documented Limitations:**
- [x] AC7: Publisher transforms documented as TODO
- [x] Field bus runtime limitation for non-numeric types documented

All critical items are now resolved. Event buses have FULL IR support end-to-end.
