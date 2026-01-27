# Sprint: snapshot-consolidation - Consolidate Buffer Snapshot Capture Logic

**Generated:** 2026-01-27
**Confidence:** HIGH: 4, MEDIUM: 1, LOW: 0
**Status:** PARTIALLY READY

## Sprint Goal

Consolidate the buffer snapshot capture logic in ContinuityApply.ts into a single capture point, eliminate dead code (unused oldGaugeSnapshot), and replace ternary fallback chains with clear conditional logic.

## Scope

**Deliverables:**
- P0: Remove unused oldGaugeSnapshot capture and variable
- P1: Create CaptureContext helper that captures state before getOrCreateTargetState()
- P2: Refactor applyContinuity() to use CaptureContext
- P3: Simplify ternary fallback chains with explicit conditionals
- P4: Verify all existing tests pass

## Work Items

### P0: Remove unused oldGaugeSnapshot [HIGH]

**Description:**
The variable `oldGaugeSnapshot` is captured at line 317 but never used. The gauge buffer is recomputed from base values via `initializeGaugeOnDomainChange()`, not preserved from old state.

**Acceptance Criteria:**
- [ ] `oldGaugeSnapshot` variable declaration removed
- [ ] Snapshot capture at line 317 removed
- [ ] All tests pass (no behavioral change)
- [ ] No other references to oldGaugeSnapshot in codebase

**Technical Notes:**
- Verify with grep that oldGaugeSnapshot is truly unused
- The comment at line 356 mentions it but doesn't use it - update comment
- This is pure dead code removal, no logic change

---

### P1: Create CaptureContext type and capturePreAllocationState() [HIGH]

**Description:**
Create a helper that captures all potentially needed state BEFORE `getOrCreateTargetState()` is called. This enforces the "capture before allocation" invariant in one place.

**Acceptance Criteria:**
- [ ] `CaptureContext` interface defined with: `oldSlewSnapshot`, `hadPreviousState`, `sizeChanged`
- [ ] `capturePreAllocationState()` function implemented
- [ ] Function returns null-safe snapshot (handles missing existingTargetState)
- [ ] Unit test for capturePreAllocationState() added

**Technical Notes:**
```typescript
interface CaptureContext {
  oldSlewSnapshot: Float32Array | null;
  hadPreviousState: boolean;
  sizeChanged: boolean;
}

function capturePreAllocationState(
  continuity: ContinuityState,
  targetId: StableTargetId,
  newBufferLength: number
): CaptureContext
```

---

### P2: Refactor applyContinuity() to use CaptureContext [HIGH]

**Description:**
Replace the inline snapshot capture logic (lines 312-318) with a call to `capturePreAllocationState()`. Remove the local variables and use the context object throughout.

**Acceptance Criteria:**
- [ ] Inline snapshot capture replaced with capturePreAllocationState() call
- [ ] Local `oldSlewSnapshot` variable replaced with `ctx.oldSlewSnapshot`
- [ ] Local `hadPreviousState` variable replaced with `ctx.hadPreviousState`
- [ ] All tests pass (exact same behavior)

**Technical Notes:**
- The CaptureContext call must happen BEFORE `getOrCreateTargetState()`
- The returned context is used throughout the rest of the function

---

### P3: Simplify ternary fallback chains [HIGH]

**Description:**
Replace the nested ternary fallback chains (lines 345-366) with explicit if/else statements. The logic is correct but hard to read.

**Acceptance Criteria:**
- [ ] Ternary at lines 345-349 replaced with if/else
- [ ] Ternary at lines 357-360 replaced with if/else
- [ ] Ternary at lines 362-366 replaced with if/else
- [ ] All tests pass (exact same behavior)
- [ ] Comments updated to explain the logic

**Technical Notes:**
Current ternary:
```typescript
oldEffectiveSnapshot = oldSlewSnapshot ?? (
  existingTargetState!.slewBuffer.length > 0
    ? new Float32Array(existingTargetState!.slewBuffer)
    : null
);
```

Becomes:
```typescript
let oldEffectiveSnapshot: Float32Array | null = null;
if (ctx.sizeChanged) {
  // Size changed - use pre-captured snapshot (buffers were reallocated)
  oldEffectiveSnapshot = ctx.oldSlewSnapshot;
} else if (ctx.hadPreviousState) {
  // Size unchanged - safe to copy from current state (no reallocation happened)
  oldEffectiveSnapshot = new Float32Array(targetState.slewBuffer);
}
```

---

### P4: Performance measurement [MEDIUM]

**Description:**
Measure whether capturing snapshots on every domain change (even when not strictly needed) has measurable performance impact. The current code only captures when `existingTargetState.count !== bufferLength`.

**Acceptance Criteria:**
- [ ] Run benchmark with current code (baseline)
- [ ] Run benchmark with new CaptureContext approach
- [ ] Document findings (expected: negligible difference)
- [ ] If significant impact, add conditional capture back to CaptureContext

**Technical Notes:**
- Use existing bench infrastructure (`npm run bench`)
- Focus on domain change scenarios with varying element counts
- Snapshot cost is O(n) where n = buffer length
- For typical use (< 1000 elements), cost is ~4KB copy per snapshot

#### Unknowns to Resolve
- What is the typical buffer size in production use?
- Is GC pressure from Float32Array allocation measurable?

#### Exit Criteria
- Benchmark results documented
- If performance regression > 5%, optimize or document tradeoff

## Dependencies

None. This is a self-contained refactor.

## Risks

1. **Regression in continuity behavior** (MEDIUM)
   - Mitigation: Comprehensive test suite exists, must pass 100%
   - Tests: `project-policy-domain-change.test.ts` covers boundary cases

2. **Subtle timing bugs** (HIGH)
   - Mitigation: CaptureContext enforces capture before allocation
   - The helper function signature makes the ordering explicit

3. **Performance regression** (LOW)
   - Mitigation: P4 benchmarking will quantify impact
   - Fallback: Conditional capture in CaptureContext if needed
