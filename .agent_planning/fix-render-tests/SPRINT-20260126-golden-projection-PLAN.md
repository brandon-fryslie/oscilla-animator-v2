# Sprint: golden-projection - Fix Golden Projection Tests
Generated: 2026-01-26
Confidence: MEDIUM: 3, HIGH: 0, LOW: 0
Status: RESEARCH REQUIRED

## Sprint Goal
Fix level10-golden-tests.test.ts to correctly test projection behavior.

## Scope
**Deliverables:**
- Investigate Camera block usage in golden tests
- Fix size assertion (number vs Float32Array)
- Fix position stride in comparisons
- Verify all 3 failing tests pass

## Work Items

### P0: Investigate Camera block behavior
**Confidence: MEDIUM**

**Acceptance Criteria:**
- [ ] Understand when `op.instances.size` is `number` vs `Float32Array`
- [ ] Understand when position buffer is stride-2 vs stride-3
- [ ] Verify if Camera block is required for projection tests

**Unknowns to Resolve:**
- Does the golden patch include a Camera block?
- What triggers per-instance size (Float32Array) vs uniform size (number)?
- Is the orthoPositions comparison using correct stride?

**Exit Criteria:**
- Clear understanding of projection output format
- Documented correct test expectations

### P1: Fix Test 1.1 (ortho identity)
**Confidence: MEDIUM**

**Acceptance Criteria:**
- [ ] Test correctly verifies ortho projection
- [ ] Size assertion matches actual output format
- [ ] Test passes

**Technical Notes:**
- Current failure: `expected 1.497... to be 1`
- Test assumes `(op.instances.size as Float32Array)[i]` is valid
- If size is a uniform number, this access pattern is wrong

### P2: Fix Test 1.2 (perspective toggle)
**Confidence: MEDIUM**

**Acceptance Criteria:**
- [ ] Test correctly compares ortho vs perspective positions
- [ ] Position comparison uses correct stride
- [ ] Test passes

**Technical Notes:**
- Current failure: `expected false to be true`
- Test compares `orthoPositions[i * 2]` with new positions
- If orthoPositions was stored with stride-3, index is wrong

### P3: Fix Test 1.3 (ortho restored)
**Confidence: MEDIUM**

**Acceptance Criteria:**
- [ ] Test correctly verifies ortho identity after perspective toggle
- [ ] Same fix as Test 1.1
- [ ] Test passes

## Dependencies
- Requires understanding of Camera block and projection system

## Risks
- May require adding Camera block to golden patch
- May require significant test restructuring
