# Runtime & Enforcement To Review - Context

## Current Implementation Strengths

### Enforcement Gate ✅
- **Single validation point**: `axis-validate.ts`
- **No bypass paths**: All types must pass validation before backend
- **Var escape check**: `validateNoVarAxes()` prevents vars in backend
- **Exhaustive checking**: Uses requireInst() pattern everywhere

Evidence:
```typescript
// axis-validate.ts:105
export function validateType(t: CanonicalType): void {
  const card = requireInst(t.extent.cardinality, 'cardinality');
  const tempo = requireInst(t.extent.temporality, 'temporality');
  // Dispatch directly on axes, no deriveKind
}
```

### Type-Driven Dispatch ✅ (Mostly)
- Backend uses extent checks: `requireInst(type.extent.cardinality)`
- No deriveKind() calls in production code
- payloadStride() is single authority for stride

Evidence:
```bash
# Grep for deriveKind in src/
# Only hits:
# - Test enforcement
# - Comments saying "don't do this"
# - Backend using extent checks INSTEAD
```

### Storage Layout ⚠️ (Implicit but Functional)
- Contiguous slots for signals (stride)
- Object map for fields (buffers)
- Slot metadata for dispatch

Evidence:
```typescript
// ScheduleExecutor.ts:48-65
function getSlotLookupMap(program: CompiledProgramIR): Map<ValueSlot, SlotLookup> {
  const map = new Map<ValueSlot, SlotLookup>();
  for (const meta of program.slotMeta) {
    map.set(meta.slot, {
      storage: meta.storage,
      offset: meta.offset,
      stride: meta.stride,
    });
  }
  return map;
}
```

## Questions Requiring Resolution

### Q1: Slot Abstraction Sufficiency
**The Question**: Does opaque ValueSlot satisfy "keyed by (ValueExprId, lane)"?

**Arguments For** (Yes, it's sufficient):
- Slot allocation is deterministic per compilation
- Slot metadata provides all needed info (storage, offset, stride)
- Field lanes are addressable via slot + offset
- Runtime doesn't need to know ValueExprIds for execution

**Arguments Against** (No, need explicit keying):
- Spec explicitly says "(ValueExprId, lane)" not "(slot)"
- Debugging requires ValueExprId visibility
- Hot-swap state migration needs ValueExprId mapping
- Cross-frame caching uses ValueExprId, not slot

**Current Reality**:
```typescript
// Runtime uses slots
state.values.f64[slot]

// Cache uses ValueExprIds
state.cache.values[valueExprId]
state.cache.stamps[valueExprId]
```

**Resolution Path**: Need to determine if:
1. Spec requires RUNTIME to use ValueExprId keys (major refactor)
2. Slot abstraction is acceptable if compiler maintains mapping (documentation fix)

---

### Q2: defaultUnitForPayload Intent
**The Question**: Is ANY use of defaultUnitForPayload forbidden, or only silent fallbacks?

**Current Usage Pattern**:
```typescript
// canonical-types.ts:703-719
export function canonicalType(
  payload: PayloadType,
  unit?: UnitType,  // Optional parameter
  extentOverrides?: Partial<Extent>
): CanonicalType {
  return {
    payload,
    unit: unit ?? defaultUnitForPayload(payload),  // ← Explicit default
    extent: { /* ... */ },
  };
}
```

**This is**:
- ✅ Explicit (caller chose to omit unit)
- ✅ Construction-time (not runtime adaptation)
- ✅ Documented (function signature shows optional)

**Contrast with FORBIDDEN pattern**:
```typescript
// Bad: Silent fallback during type mismatch
function adapt(sourceType, targetType) {
  if (!unitsEqual(sourceType.unit, targetType.unit)) {
    // Silently use default instead of failing
    return { ...sourceType, unit: defaultUnitForPayload(sourceType.payload) };
  }
}
```

**Resolution Path**: Clarify guardrail #6 to distinguish:
- **Forbidden**: Silent fallback during error recovery
- **Allowed**: Explicit construction ergonomics

---

### Q3: Event Stamps - Required or Optional?
**The Question**: Must we implement valueStamp tracking, or is frame-based clearing sufficient?

**Current Event Model**:
- Events fire for one frame
- Cleared at start of next frame
- Consumers process all events in current frame

**This satisfies**:
- ✅ Monotone OR semantics (can't un-fire)
- ✅ One-frame lifetime
- ✅ Frame-level consistency

**Missing**:
- ❌ Can't detect "which frame was this written?"
- ❌ Can't debug stale event reads
- ❌ Can't implement event history/replay

**Use Cases for Stamps**:
1. Debugging: See when event last fired
2. Multi-consumer: Different consumers track different stamps
3. Event history: Replay past N frames of events

**Resolution Path**: Determine if:
1. Stamps are **required** by spec (must implement)
2. Stamps are **nice-to-have** (can defer)
3. Stamps are **unnecessary** (current model is correct)

---

### Q4: Explicit vs Implicit State Scoping
**The Question**: Must state storage explicitly track branch/lane metadata?

**Current Model** (Implicit):
- Flat state arrays
- Slot allocation encodes branch/lane implicitly
- Works if allocation is deterministic

**Alternative Model** (Explicit):
```typescript
interface StateStorage {
  // Explicit branch scoping
  branches: Map<BranchId, {
    // Explicit lane scoping
    values: Map<ValueExprId, Map<LaneId, number>>;
  }>;
}
```

**Trade-offs**:
| Aspect | Implicit (Current) | Explicit (Alternative) |
|--------|-------------------|----------------------|
| Performance | ✅ Fast (array access) | ⚠️ Slower (Map lookups) |
| Clarity | ❌ Opaque | ✅ Self-documenting |
| Hot-swap | ⚠️ Fragile | ✅ Robust |
| Memory | ✅ Compact | ❌ Overhead |

**Resolution Path**: Determine if spec REQUIRES explicit tracking or if implicit is acceptable with:
1. Documented slot allocation contract
2. Validated state migration tests
3. Clear hot-swap guarantees

---

### Q5: Step Kind Unification Timeline
**The Question**: When should we unify evalSig/evalEvent into type-driven dispatch?

**Current State**:
- Schedule has separate step kinds
- Runtime switches on kind
- Works, but bypasses type system

**Dependencies**:
- ValueExpr unification (in progress)
- Type in every step (may require IR changes)

**Options**:
1. **Now**: Refactor schedule to type-driven dispatch
2. **After ValueExpr**: Wait for unification to simplify
3. **Never**: Keep step kinds, document as acceptable

**Impact**:
- Type-driven dispatch enforces single authority
- Step kinds are more familiar to maintainers
- Migration cost is significant

**Resolution Path**: Prioritize based on:
1. Severity of "parallel type system" risk
2. Effort required for migration
3. Other work dependencies
