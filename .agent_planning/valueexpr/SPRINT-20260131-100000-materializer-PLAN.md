# Sprint: materializer - Materializer Migration

Generated: 2026-01-31-100000 (revised per ChatGPT review)
Confidence: HIGH: 0, MEDIUM: 1, LOW: 2
Status: RESEARCH REQUIRED
Source: EVALUATION-20260131-090000.md

## Sprint Goal

Migrate the Materializer (FieldExpr evaluator) to accept ValueExpr (field-extent subset), completing the consumer migration. Split into two phases to manage complexity: 5A (core field ops) and 5B (complex/geometry ops).

## Scope

**Deliverables:**
- Phase 5A: Core field materialization function for basic ValueExpr kinds
- Phase 5B: Complex field ops (placement, zipSig, pathDerivative)
- Shadow materialization mode with deterministic sampling
- Integration with ScheduleExecutor for StepMaterialize steps
- Remove legacy materializer bridge from Sprint 3 reduce (replace with direct ValueExpr call)

---

## Phase 5A: Core Field Materialization

### P0 WI-1: Core ValueExpr Field Materializer Function

**Dependencies**: Sprint 3 (signal-eval) complete, Sprint 2 (lowering pass) complete
**Spec Reference**: Materializer.ts materialize function | **Status Reference**: EVALUATION-20260131-090000.md "Materializer is most complex"

#### Description
Create `materializeValueExpr()` that evaluates the core (low-surface-area) field-extent ValueExpr kinds into Float32Array buffers:

- `const` → fill buffer with constant value (per-lane)
- `intrinsic.property` → produce index/normalizedIndex/randomId buffers
- `kernel.broadcast` → evaluate signal via `evaluateValueExprSignal()`, fill all lanes with result
- `kernel.map` → materialize input, apply fn per-lane
- `kernel.zip` → materialize all inputs, apply fn per-lane
- `state` → read per-lane state values

Cross-evaluator calls:
- `kernel.broadcast.signal`: call `evaluateValueExprSignal()` to get scalar, then fill buffer

Instance identity is derived from `requireManyInstance(expr.type)` — NOT stored on the expression.

#### Acceptance Criteria
- [ ] `materializeValueExpr(veId, valueExprs, instanceId, count, state)` returns Float32Array
- [ ] Handles: const, intrinsic.property, broadcast, map, zip, stateRead
- [ ] Buffer caching by ValueExprId (frame-stamped, same pattern as legacy)
- [ ] Per-lane evaluation for all handled field kernel types
- [ ] Cross-evaluator calls to signal evaluator work correctly
- [ ] Instance identity derived from `requireManyInstance(expr.type)` (not stored on expr)
- [ ] Buffer allocation uses BufferPool for reuse
- [ ] Stride derived from `payloadStride(expr.type.payload)` (not stored redundantly)
- [ ] Unit tests cover all 5A field-extent cases

#### Technical Notes
Key pattern from legacy Materializer:
1. Check cache (keyed by expression ID + instance)
2. Allocate buffer from pool (count * stride)
3. Evaluate per-lane
4. Cache result
5. Return buffer

Intrinsic field production (index, normalizedIndex, randomId) depends on InstanceDecl and domain info, not on FieldExpr types. This code should be reusable directly from the legacy materializer — factor it into a shared module if it isn't already.

---

### P1 WI-2: Field Buffer Cache for ValueExpr

**Dependencies**: WI-1
**Spec Reference**: RuntimeState.ts cache.fieldBuffers | **Status Reference**: EVALUATION-20260131-090000.md "RuntimeState cache"

#### Description
Add a ValueExpr field buffer cache to RuntimeState:

```typescript
valueExprFieldBuffers: (Float32Array | null)[];  // indexed by ValueExprId
valueExprFieldStamps: Int32Array;                 // frame stamps
```

Design to handle:
- Buffer reuse across frames (same expr, same count → reuse buffer)
- Buffer invalidation when count changes (domain resize)
- Buffer pool integration for allocation

#### Acceptance Criteria
- [ ] ValueExpr field buffer cache exists in RuntimeState
- [ ] Buffers are reused across frames when expression and count match
- [ ] Buffer invalidation works when count changes
- [ ] No memory leaks from orphaned buffers
- [ ] Cache is completely independent from legacy field cache

---

## Phase 5B: Complex Field Operations

### P1 WI-3: Placement Intrinsics

**Dependencies**: WI-1 (core materializer must exist)
**Spec Reference**: Legacy FieldExprPlacement | **Status Reference**: EVALUATION-20260131-090000.md "Materializer is most complex"

#### Description
Add `intrinsic.placement` handling to the ValueExpr materializer:
- Produce placement field buffers (uv/rank/seed)
- Uses basisKind from `ValueExprIntrinsic { intrinsicKind: 'placement' }`

#### Acceptance Criteria
- [ ] `intrinsic.placement` correctly produces placement buffers
- [ ] All placement-related test cases pass
- [ ] Results match legacy materializer output

---

### P1 WI-4: ZipSig and PathDerivative

**Dependencies**: WI-1 (core materializer), Sprint 3 (signal eval for zipSig signals)
**Spec Reference**: Legacy FieldExprZipSig, FieldExprPathDerivative

#### Description
Add complex kernel operations to the ValueExpr materializer:

- `kernel.zipSig` → materialize field, evaluate signals via `evaluateValueExprSignal()`, apply fn per-lane
- `kernel.pathDerivative` → materialize input, compute derivative using `op: 'tangent' | 'arcLength'`
- `kernel.reduce` → materialize field, reduce to scalar using `op: 'min' | 'max' | 'sum' | 'avg'`

After WI-4 lands, the reduce bridge in Sprint 3's signal evaluator (which calls the legacy materializer via `valueToField`) can be replaced with a direct call to `materializeValueExpr()`.

#### Acceptance Criteria
- [ ] `kernel.zipSig` correctly materializes with signal inputs
- [ ] `kernel.pathDerivative` correctly applies tangent/arcLength operations
- [ ] `kernel.reduce` correctly reduces field buffers to scalar values
- [ ] Sprint 3 reduce bridge replaced with direct ValueExpr materializer call
- [ ] `valueToField` reverse mapping no longer needed (can be removed)
- [ ] All related test cases pass

---

### P2 WI-5: Shadow Materialization Mode

**Dependencies**: WI-1, WI-2, WI-3, WI-4
**Spec Reference**: N/A (migration infrastructure)

#### Description
Shadow mode for materialization: for each StepMaterialize, run both legacy and ValueExpr materialization, compare buffers.

**Deterministic sampling policy** (do NOT compare every buffer every frame — too slow):
- Compare first frame + every Nth frame (e.g., N=10)
- Compare only the first K materializations per frame (e.g., K=5)
- Always compare all materializations when a debug flag is enabled
- Log mismatches with field ID, lane index, component, legacy value, ValueExpr value

Buffer comparison: for each lane, `Math.abs(legacy[i] - valueExpr[i]) < EPSILON` for all components.

#### Acceptance Criteria
- [ ] Shadow mode runs both materializers with deterministic sampling
- [ ] Element-wise float comparison with epsilon tolerance
- [ ] Sampling policy is configurable (frame interval, materializations per frame)
- [ ] Mismatches logged with field ID, lane index, component, legacy value, ValueExpr value
- [ ] End-to-end test: compile real patch, run shadow materialization, zero mismatches
- [ ] No meaningful performance regression when shadow mode is disabled
- [ ] Shadow mode overhead is bounded by sampling policy (not O(all fields × all frames))

#### Technical Notes
Buffer comparison is more expensive than scalar comparison (N × stride elements per buffer vs 1 number). The sampling policy ensures shadow mode is usable during development without making the animation loop unusable.

Use separate buffer pools for shadow mode to prevent corruption between legacy and ValueExpr materializers writing to overlapping pool regions.

---

### P2 WI-6: Materializer Cutover

**Dependencies**: WI-5 validated with zero mismatches
**Spec Reference**: N/A (migration milestone)

#### Description
After shadow mode validates equivalence:
- `StepMaterialize` uses `materializeValueExpr` instead of legacy `materialize`
- Legacy field buffer cache is no longer written
- Legacy fieldExprs table is no longer consulted by ScheduleExecutor

This completes the consumer migration. All three evaluators now use ValueExpr.

#### Acceptance Criteria
- [ ] ScheduleExecutor routes all materialize steps through ValueExpr
- [ ] All 2004+ tests pass
- [ ] No rendering differences
- [ ] Performance benchmark shows no significant regression (< 5%)
- [ ] Legacy `program.fieldExprs` is no longer read by ScheduleExecutor in normal mode

## Dependencies
- Sprint 1 (type-fixes) must be complete
- Sprint 2 (lowering pass) must be complete
- Sprint 3 (signal-eval) must be complete (for broadcast/zipSig cross-calls)
- Sprint 4 (event-eval) is NOT a dependency (materializer does not evaluate events)
- Phase 5B depends on Phase 5A

## Unknowns to Resolve
1. **Buffer pool sharing**: Should the ValueExpr materializer use the same BufferPool as the legacy materializer, or a separate one? Sharing saves memory; separate avoids interference during shadow mode. Research: check if BufferPool supports concurrent allocation patterns.
2. **Instance identity resolution**: Legacy materializer receives instanceId as a parameter (from StepMaterialize). ValueExpr materializer should also receive it as a parameter (NOT derive from type — the step carries the instance context). Research: confirm StepMaterialize always provides instanceId.
3. **Intrinsic field production reuse**: The legacy materializer has significant code for producing intrinsic fields. This code depends on InstanceDecl and domain info, not on FieldExpr types. Can it be factored into a shared module? Research: check if the intrinsic production code is expression-type-agnostic.

## Exit Criteria (to raise confidence)
- [ ] Buffer pool sharing strategy decided
- [ ] Instance identity resolution approach confirmed
- [ ] Intrinsic field production reuse path identified
- [ ] Sprint 3 and Sprint 4 shadow modes validated across all test patches

## Risks
- **Performance regression**: Materializer is in the hot loop. Per-lane evaluation with ValueExpr dispatch adds overhead. Mitigation: profile before and after; optimize dispatch path.
- **Buffer corruption**: Two materializers writing to overlapping buffer pool regions during shadow mode. Mitigation: use separate buffer pools for shadow mode.
- **Intrinsic code duplication**: If intrinsic production can't be reused, we'd need to duplicate significant code. Mitigation: factor intrinsic production into a shared module first.
- **Complexity**: This is the largest single consumer migration. Plan for multiple sessions. Mitigation: split into 5A/5B phases; 5A is independently shippable.

## Cross-Sprint Enforcement
- After Sprint 2: no new runtime code may switch on `SigExpr.kind` / `FieldExpr.kind` / `EventExpr.kind` outside the legacy evaluators (grep test).
- After Sprint 3 cutover: ScheduleExecutor routes signal steps through ValueExpr-only in CI.
- After Sprint 4 cutover: same for event steps.
- After this sprint's cutover (WI-6): legacy expr tables no longer consulted by ScheduleExecutor in normal mode. Migration complete.
