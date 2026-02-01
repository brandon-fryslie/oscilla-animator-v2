# Runtime & Enforcement Critical Gaps

## Critical Issues

### C1: Schedule Steps Use Hard-Coded evalSig/evalField/evalEvent Discriminants
**Spec Requirement**: Steps should NOT have hard-coded evalSig/evalField/evalEvent discriminants. Should be unified or derived from type.

**Current State**:
- `src/compiler/ir/types.ts`: Step union has `evalSig`, `evalField` (implied), `evalEvent` as separate discriminants
- `src/runtime/ScheduleExecutor.ts:214-256`: Switch statement on `step.kind` with cases for `evalSig`, `evalEvent`
- `src/compiler/backend/schedule-program.ts`: Generates these hard-coded step kinds

**Classification Rationale**: This violates **Guardrail #2 "Derived Kind Must Be Total and Deterministic"**. The schedule should dispatch based on CanonicalType (via extent axes), not on separate evalSig/evalField/evalEvent discriminants. This creates parallel type systems and will lead to drift.

**Impact**: High - Creates a parallel classification system that bypasses the canonical type system.

---

### C2: No Branch-Scoped State Storage
**Spec Requirement**: State storage must be branch-scoped (keyed by branch identity).

**Current State**:
- `src/runtime/RuntimeState.ts:498`: `state: Float64Array` - flat array, no branch scoping
- `src/runtime/ScheduleExecutor.ts:532`: `state.state[step.stateSlot as number] = value` - direct array access, no branch key
- `src/runtime/ScheduleExecutor.ts:562`: `state.state[baseSlot + i] = src[i]` - same pattern for field state

**Classification Rationale**: Violates **Guardrail #6 "Only Explicit Ops Change Axes"** and the spec requirement that state must respect branch identity. Without branch scoping, parallel timelines (branch axis) cannot maintain separate state.

**Impact**: High - Blocks implementation of per-branch state, which is required for advanced features like parallel animations.

---

### C3: No Lane Identity in State Storage for Fields
**Spec Requirement**: State storage must respect lane identity for fields.

**Current State**:
- `src/runtime/RuntimeState.ts:498`: `state: Float64Array` - flat array
- Field state write uses base slot + offset but no instance/lane metadata tracked
- No mapping from (ValueExprId, lane) → state slot

**Classification Rationale**: Violates the spec requirement "For cardinality many(instance): stride * instanceCount contiguous slots" with lane tracking. Current implementation assumes contiguous layout but doesn't enforce or document the lane mapping.

**Impact**: Medium-High - Field state may not correctly preserve per-instance state when instance count changes (hot-swap scenario).

---

### C4: No Stamp Buffer for Discrete Temporality
**Spec Requirement**: For discrete temporality: stamp buffer: valueStamp[ValueExprId, lane] = lastTickOrFrameWritten.

**Current State**:
- `src/runtime/RuntimeState.ts:551-577`: Event storage exists (`eventScalars`, `eventPrevPredicate`, `events`)
- No stamp buffer for tracking when events were last written
- Event clearing happens uniformly at frame start, not based on stamps

**Classification Rationale**: Missing implementation of spec-required stamp tracking for discrete values. This is needed to implement proper event semantics where consumers can detect "fresh" vs "stale" events.

**Impact**: Medium - Current event clearing at frame start works for simple cases but doesn't support the stamp-based semantics required by spec.
