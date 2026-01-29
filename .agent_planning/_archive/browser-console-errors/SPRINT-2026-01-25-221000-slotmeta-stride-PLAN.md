# Sprint: slotmeta-stride - Fix SlotMeta Offset Calculation

Generated: 2026-01-25T22:10:00
Confidence: HIGH: 1, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-2026-01-25-220930.md

## Sprint Goal

Fix the slotMeta offset calculation bug that causes stride assertion failures on every animation frame, eliminating all 547+ console errors.

## Scope

**Deliverables:**
- Fix offset calculation to account for stride
- Add regression test for multi-component slot allocation
- Verify zero console errors on page load

## Work Items

### P0 (Critical): Fix SlotMeta Offset Calculation

**Dependencies**: None
**Spec Reference**: Compiler IR contract (slots with stride>1 must reserve contiguous offsets)
**Status Reference**: EVALUATION-2026-01-25-220930.md - Root Cause Analysis section

#### Description

The `convertLinkedIRToProgram()` function in `compile.ts` increments the storage offset by 1 for every slot, regardless of the slot's stride. This causes multi-component slots (vec2, vec3, color) to have overlapping offsets with subsequent slots.

The fix is to increment the offset counter by the slot's stride instead of always by 1.

#### Acceptance Criteria

- [ ] Offset counter increments by stride value (1, 2, 3, or 4) instead of always 1
- [ ] Slot 0 (time.palette, color, stride=4) gets offset 0
- [ ] Next slot after a stride=4 slot gets offset 4, not offset 1
- [ ] No console errors related to assertF64Stride on page load
- [ ] Application renders correctly (visual verification)

#### Technical Notes

**Current code** (line 444 in compile.ts):
```typescript
const offset = storageOffsets[storage]++;
```

**Fixed code**:
```typescript
const offset = storageOffsets[storage];
storageOffsets[storage] += stride;
```

This single-line change ensures each slot reserves the correct number of contiguous positions in the f64 buffer.

### P1 (High): Add Regression Test

**Dependencies**: P0 fix must be in place
**Spec Reference**: Testing contract - compiler tests should verify slotMeta correctness
**Status Reference**: EVALUATION-2026-01-25-220930.md - Quantitative Metrics

#### Description

Add a compiler test that verifies slotMeta offset calculation is correct for multi-component payloads (color with stride=4, vec3 with stride=3, vec2 with stride=2).

#### Acceptance Criteria

- [ ] Test compiles a patch with color slot (stride=4)
- [ ] Test verifies slot 0 has offset=0, stride=4
- [ ] Test verifies subsequent slots have offset >= 4
- [ ] Test fails if offset calculation regresses to increment-by-1

#### Technical Notes

The test should use a minimal patch that includes time.palette usage (or a color constant block) and verify the resulting slotMeta entries have non-overlapping offsets.

## Dependencies

No external dependencies. P1 depends on P0.

## Risks

- **Low Risk**: The fix is a single line change with clear semantics
- **Mitigation**: Run existing compiler tests before and after to ensure no regressions
