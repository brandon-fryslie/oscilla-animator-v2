# Definition of Done: slotmeta-stride

Generated: 2026-01-25T22:10:00
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-2026-01-25-221000-slotmeta-stride-PLAN.md

## Acceptance Criteria

### Fix SlotMeta Offset Calculation (P0)

- [ ] `compile.ts` line 444 changed from `storageOffsets[storage]++` to increment by stride
- [ ] Slot 0 (time.palette) has storage='f64', offset=0, stride=4 in compiled slotMeta
- [ ] Subsequent slots have offset values that do not overlap (e.g., slot 1 has offset >= 4)
- [ ] `npm run typecheck` passes with no errors
- [ ] `npm run test` passes (existing tests)
- [ ] Browser console shows 0 errors on page load at http://localhost:5174
- [ ] Application renders animation correctly (visual verification in browser)

### Add Regression Test (P1)

- [ ] Test file created at `src/compiler/__tests__/slotmeta-stride.test.ts`
- [ ] Test compiles a patch containing a color payload (stride=4)
- [ ] Test asserts slotMeta entries have correct stride values
- [ ] Test asserts slotMeta offsets are non-overlapping (each slot's offset >= previous slot's offset + previous stride)
- [ ] Test passes with the fix in place
- [ ] Test would fail if the fix is reverted

## Exit Criteria

- [ ] Zero console errors when loading the application
- [ ] All existing tests pass
- [ ] New regression test passes
