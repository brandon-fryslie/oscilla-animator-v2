# Runtime & Enforcement - To Review

## Items Needing Clarification/Review

### R1: ValueSlot vs (ValueExprId, lane) Keying
**Question**: Is the current ValueSlot abstraction sufficient, or must we expose explicit (ValueExprId, lane) keying?

**Current State**:
- Runtime uses opaque `ValueSlot` indices
- Slot allocation happens in compiler backend
- Slot metadata maps slot → (storage, offset, stride)
- No explicit ValueExprId → slot mapping visible in runtime

**Files**:
- `src/runtime/ScheduleExecutor.ts:48-65` (getSlotLookupMap)
- `src/compiler/ir/program.ts` (SlotMeta)

**Review Needed**: Does slot abstraction satisfy "keyed by (ValueExprId, lane)" requirement if:
1. Slot allocation is deterministic per ValueExpr?
2. Field lanes occupy contiguous slots (baseSlot + laneIndex)?
3. Compiler maintains ValueExpr → slot mapping?

Or must runtime explicitly track (ValueExprId, lane) → value?

**Recommendation**: Document slot allocation contract. If current approach is correct, update spec to clarify that "keyed by" can be satisfied through indirection layer (slots).

---

### R2: defaultUnitForPayload Usage as Fallback
**Spec Requirement**: No fallback semantics - defaultUnitForPayload never used as silent fallback.

**Current State**:
- `src/core/canonical-types.ts:288-302`: `defaultUnitForPayload()` exists
- Used in `canonicalType()` helper when `unit` parameter is optional
- Grep search shows limited usage (19 files, mostly in inference/construction)

**Question**: Is this a violation? Or is it acceptable for **explicit** ergonomic helpers to use defaults?

**Interpretation A** (strict): ANY use of defaultUnitForPayload is forbidden.
**Interpretation B** (pragmatic): Explicit construction helpers can use defaults; only SILENT fallbacks (adapter insertion, error recovery) are forbidden.

**Review Needed**: Clarify intent of guardrail #6. Current usage appears to be construction-time ergonomics, not runtime fallback.

**Recommendation**: If interpretation B is correct, document that defaultUnitForPayload is ONLY for explicit construction, never for silent adaptation.

---

### R3: Event Storage Already Implements Spec Pattern
**Observation**: Current event storage may already satisfy spec requirements, just not documented.

**Current State**:
- `state.eventScalars: Uint8Array` - per-event-expr fired flag
- `state.events: Map<number, EventPayload[]>` - payload storage
- Cleared at frame start (monotone OR within frame)

**Spec Requirements**:
1. ✅ Storage keyed by ValueExprId (eventScalars index, events Map key)
2. ✅ Cleared each frame
3. ❌ No stamp buffer for tracking write time

**Question**: Is current event model "close enough" or must we add stamps?

**Review Needed**: Determine if stamp buffer is:
- **Required**: Explicit spec mandate, must implement
- **Optional**: Performance/debugging enhancement, can defer
- **Unnecessary**: Current frame-based clearing is sufficient

**Recommendation**: If stamps are optional, move to "nice-to-have" category. If required, prioritize.

---

### R4: Field Kernels Already Type-Agnostic
**Observation**: `FieldKernels.ts` already implements type-driven dispatch correctly.

**Current State**:
```typescript
// FieldKernels.ts:54
export function applyFieldKernel(
  out: ArrayBufferView,
  inputs: ArrayBufferView[],
  fieldOp: string,
  N: number,
  _type: CanonicalType  // ← Type is passed but not currently used
): void
```

**Question**: Is this a gap or already correct?

**Analysis**:
- Function signature accepts CanonicalType
- Currently dispatches on `fieldOp` string (kernel name)
- Type parameter unused (marked with `_type`)

**Review Needed**: Should field kernels dispatch on type payload/extent, or is string-based kernel dispatch acceptable?

**Recommendation**: If kernel name dispatch is spec-compliant, document why. If type-based dispatch is required, update implementation to use `_type` parameter.

---

### R5: Two-Phase Execution Already Prevents Causality Issues
**Observation**: Current two-phase execution model may already satisfy state scoping requirements.

**Current State**:
- Phase 1: Read all values (use previous frame state)
- Phase 2: Write all state (for next frame)
- Documented in `docs/runtime/execution-model.md`

**Spec Requirements**:
- State must be branch-scoped
- State must preserve lane identity

**Question**: Does two-phase execution + flat state storage satisfy requirements if:
1. All branches execute in same phase order?
2. Lane identity is implicit in slot allocation?
3. Hot-swap correctly migrates state?

**Review Needed**: Is explicit branch/lane tracking required, or is current implicit model sufficient?

**Recommendation**: If implicit is sufficient, document guarantees. If explicit is required, plan refactor.
