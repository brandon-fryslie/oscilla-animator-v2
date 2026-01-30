---
topic: 03
name: Axes
spec_file: design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/axes/
category: to-review
audited: 2026-01-29
item_count: 2
priority_reasoning: >
  These items are implemented differently from spec but may be acceptable.
  Need design decision before changing.
---

# Topic 03: Axes -- To-Review Gaps

## Items

### R-1: Binding unification uses equality semantics (matches spec), but no explicit "type error" diagnostic
**Problem**: The spec says when two bindings differ and both are instantiated, it is a "type error (or requires explicit adapter)". The current `unifyAxis()` throws `AxisUnificationError` when inst(X) != inst(Y), which is correct behavior. However, the error does not distinguish between "needs adapter" and "impossible mismatch". This may be fine for v0 (no binding adapters exist), but worth reviewing.
**Evidence**: `src/core/canonical-types.ts:985-1000` -- `unifyAxis` throws generic `AxisUnificationError`. No specific binding adapter logic exists.
**Obvious fix?**: No -- design decision needed on whether binding adapters should be suggested in diagnostics.

### R-2: eventRead output type uses canonicalType(FLOAT) -- spec says canonicalSignal({kind:'float'}, {kind:'scalar'})
**Problem**: Spec says `SigExprEventRead` output type should be `canonicalSignal({ kind: 'float' }, { kind: 'scalar' })` -- float continuous signal. The implementation in `SigExprEventRead` has `type: CanonicalType` as a field, and construction in `IRBuilderImpl` (line 871) passes the type from the caller. Need to verify callers pass the correct type.
**Evidence**: `src/compiler/ir/IRBuilderImpl.ts:871` -- `{ kind: 'eventRead' as const, eventSlot, type }` where type comes from caller. `src/compiler/ir/types.ts:178-183` defines the interface.
**Obvious fix?**: Possibly -- check all callsites to confirm the correct canonical type is passed. If callers sometimes pass non-signal types, that is a bug.
