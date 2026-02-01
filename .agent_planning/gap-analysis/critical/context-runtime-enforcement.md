# Runtime & Enforcement Context

## Files Analyzed

### Runtime Core
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/ScheduleExecutor.ts` (596 lines)
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/RuntimeState.ts` (710 lines)
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/FieldKernels.ts` (245 lines)
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/RenderAssembler.ts` (1336 lines)

### Enforcement & Validation
- `/Users/bmf/code/oscilla-animator-v2/src/compiler/frontend/axis-validate.ts` (298 lines)
- `/Users/bmf/code/oscilla-animator-v2/src/core/canonical-types.ts` (929 lines)

## Key Findings Summary

### Good: Axis Validation Exists
- Single enforcement gate: `axis-validate.ts`
- Validates signal/field/event invariants
- Checks for var escape (guardrail #4)
- No scattered ad-hoc checks found

### Good: No deriveKind in Production Code
- Grep search shows deriveKind only in:
  - Test enforcement (`no-legacy-types.test.ts`)
  - Comments explaining what NOT to do
  - Old backend code that checks extent directly instead
- Production code dispatches on extent axes, not derived kind

### Gap: Schedule Step Discriminants
- `Step` union uses `evalSig`, `evalEvent` as kind discriminants
- Runtime switches on these, not on type
- Violates "single authority" principle

### Gap: Storage Keying
- Current: `state.values.f64[slot]` (flat)
- Spec: `storage[(ValueExprId, lane)]`
- No branch scoping
- No explicit lane tracking for fields

### Gap: Stamp Buffers
- Events clear at frame start (works)
- No stamp tracking per value/lane
- Can't detect "fresh" vs "stale" discrete values

## Spec Requirements vs Implementation

### Runtime Storage ✅ Partial
- ✅ Uses slot-based storage
- ✅ Contiguous layout for cardinality one (stride slots)
- ✅ Field buffers in objects map
- ❌ Not keyed by (ValueExprId, lane) - uses opaque slots
- ❌ No branch scoping
- ❌ No stamp buffers

### Enforcement Gate ✅ Good
- ✅ Single axis-validation gate (`axis-validate.ts`)
- ✅ No scattered checks
- ✅ No bypass in debug paths
- ✅ Validates var escape
- ✅ Uses isResolvedCanonicalType pattern

### Dispatch ⚠️ Mixed
- ✅ No deriveKind() calls in production
- ✅ Backend checks extent directly
- ❌ Schedule steps still use evalSig/evalField/evalEvent discriminants
- ⚠️ Runtime switches on step.kind, not type

## Related Work

### Completed
- Axis validation gate (SPRINT-20260129-200000-validation-gate)
- No var escape enforcement
- deriveKind deletion

### In Progress
- ValueExpr unification (would help eliminate step kind dispatch)

### Deferred
- Branch-scoped state
- Stamp buffers for discrete values
- Lane-keyed storage
