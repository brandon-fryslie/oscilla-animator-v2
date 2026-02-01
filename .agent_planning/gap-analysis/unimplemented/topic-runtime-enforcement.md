# Runtime & Enforcement Unimplemented Features

## Unimplemented Spec Features

### U1: Storage Keyed by (ValueExprId, lane)
**Spec Requirement**: Storage keyed by (ValueExprId, lane) - not separate signal/field/event stores.

**Current State**: Storage uses opaque ValueSlot indices. No explicit (ValueExprId, lane) keying visible in runtime.

**File**: `src/runtime/RuntimeState.ts:489,538-540`

**What Needs to Change**:
1. Document slot allocation strategy: how ValueSlot maps to (ValueExprId, lane)
2. Or restructure to explicit (ValueExprId, lane) → value mapping
3. Ensure field lanes are addressable independently

**Impact**: Medium - Current slot-based approach works but lacks explicit guarantees about lane identity preservation.

---

### U2: Branch-Scoped State Storage
**Spec Requirement**: State storage must be branch-scoped (keyed by branch identity).

**Current State**: `state.state: Float64Array` - flat array, no branch axis.

**File**: `src/runtime/RuntimeState.ts:498`

**What Needs to Change**:
1. Change state storage to: `Map<BranchId, Float64Array>`
2. Update stateWrite steps to include branch identity
3. State reads must resolve current branch from type
4. Hot-swap migration must preserve per-branch state

**Impact**: High - Required for parallel timeline support (branch axis semantics).

---

### U3: Stamp Buffers for Discrete Temporality
**Spec Requirement**: For discrete temporality: stamp buffer: valueStamp[ValueExprId, lane] = lastTickOrFrameWritten.

**Current State**: No stamp tracking. Events clear at frame start uniformly.

**File**: `src/runtime/RuntimeState.ts:551,555-577`

**What Needs to Change**:
1. Add: `eventStamps: Map<ValueExprId, Uint32Array>` (per-lane stamps)
2. Update event write to record frameId stamp
3. Event consumers check stamp to detect fresh vs stale
4. Clear only applies to stamp, not value (for debugging)

**Impact**: Medium - Enables richer event semantics (detect missed events, debug stale reads).

---

### U4: Unified Schedule Step Dispatch Based on CanonicalType
**Spec Requirement**: Steps should NOT have hard-coded evalSig/evalField/evalEvent discriminants. Should be unified or derived from type.

**Current State**: Schedule uses `evalSig`, `evalEvent` as step.kind discriminants.

**File**: `src/compiler/ir/types.ts:Step` union, `src/runtime/ScheduleExecutor.ts:213-256`

**What Needs to Change**:
1. Replace `evalSig`/`evalEvent` with single `eval` step kind
2. Add `type: CanonicalType` field to eval step
3. Runtime dispatches based on `requireInst(type.extent.temporality)` and `requireInst(type.extent.cardinality)`
4. Use payloadStride(type.payload) for layout decisions

**Impact**: High - Removes parallel type system, enforces single authority principle.

---

### U5: Lane-Scoped Field State Tracking
**Spec Requirement**: State storage must respect lane identity for fields.

**Current State**: Field state write uses base slot + offset. No explicit lane→slot mapping tracked.

**File**: `src/runtime/ScheduleExecutor.ts:534-564`

**What Needs to Change**:
1. Document/enforce slot layout: `stateSlot + (instanceIndex * stride)`
2. Or add explicit metadata: `Map<ValueExprId, { baseSlot, stride, instanceId }>`
3. Hot-swap migration must remap lanes when instance count changes

**Impact**: Medium - Current implementation likely works for stable instance counts but fragile during hot-swap.
