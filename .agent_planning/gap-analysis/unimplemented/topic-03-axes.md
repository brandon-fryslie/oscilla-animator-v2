---
topic: 03
name: Axes
spec_file: design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/axes/
category: unimplemented
audited: 2026-01-29
item_count: 4
priority_reasoning: >
  These features are specified but not yet built. Most are v1+ scope or blocked
  by other work. Zero-cardinality lift ops and var-escape-check are needed soonest.
---

# Topic 03: Axes -- Unimplemented Gaps

## Items

### U-1: Zero-cardinality explicit lift operations not implemented
**Problem**: Spec requires explicit ops to lift compile-time constants into runtime: `broadcastConstToSignal(const)`: zero->one, `broadcastConstToField(const, instance)`: zero->many. No such operations exist in the IR or compiler. Constants are currently handled by `sigConst` / `fieldConst` IR nodes, which create a value with the target cardinality directly rather than starting at zero and lifting.
**Evidence**: `grep -r 'broadcastConstToSignal\|broadcastConstToField' src/` returns zero matches. `src/compiler/ir/types.ts` has `SigExprConst` (cardinality implied by being a SigExpr) and `FieldExprConst` but no explicit zero->one or zero->many lift.
**Obvious fix?**: No -- this is a design question about whether the current approach (Const nodes that directly produce the target cardinality) is equivalent to the spec's two-step approach. If Const nodes always produce zero-cardinality and then are lifted, more IR changes are needed.

### U-2: Axis var escape check not implemented
**Problem**: Spec says `Axis.kind:'var'` must not escape frontend into backend IR. No check exists to verify this. If a type variable leaks through to the runtime, it would cause runtime errors.
**Evidence**: No validation pass checks that all axes are `inst` (not `var`) before backend lowering. `axis-validate.ts` assumes types are instantiated (deriveKind throws on var axes) but is never called.
**Obvious fix?**: Yes -- add a check in axis-validate (or as a separate pass) that iterates all types in the IR after type resolution and asserts every axis is `inst`. This would catch leaks early.

### U-3: Runtime state keying by branch not implemented
**Problem**: Spec Invariant I4 says runtime storage is keyed by branch + instance lane identity. Branch isolation (preview, undo, speculative execution) is not implemented. All runtime state is in a single timeline.
**Evidence**: `grep -r 'branch.*key\|keyed.*branch' src/runtime/` returns zero matches. `RuntimeState.ts` does not partition by branch.
**Obvious fix?**: No -- this is v1+ scope per the spec (`BranchValue` is `{ kind: 'default' }` only in v0). No action needed now, but the architecture should not make branch-keying impossible later.

### U-4: Perspective and Branch v1+ values not implemented
**Problem**: Spec defines future perspective values (world, view, screen) and branch values (main, preview, checkpoint, undo, prediction, speculative, replay). These are explicitly v1+ and only `default` exists in v0.
**Evidence**: `src/core/canonical-types.ts:510-517` correctly defines v0-only types. The spec documents v1+ for completeness.
**Obvious fix?**: N/A -- explicitly deferred to v1+. No action needed.
