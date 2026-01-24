# Definition of Done: Depth Ordering Fix

Generated: 2026-01-24T22:00:00Z

## Verification Criteria

### C-24: Sort Direction
1. `depthSortAndCompact` comparator is `db - da` (descending depth)
2. Given depths [0.5, 0.1, 0.9, 0.3], output order is [0.9, 0.5, 0.3, 0.1] (far first)
3. Tie-break is `a - b` (stable, lower lane index first for equal depths)
4. Level 7 tests all pass with far-to-near assertions
5. JSDoc on `depthSortAndCompact` says "far-to-near (painter's algorithm)"

### C-25: Preallocated Buffers
1. No `new Float32Array` or `new number[]` or `[]` inside `depthSortAndCompact` per-call
2. Module-level buffer cache grows only when instance count increases
3. Consecutive calls with same count reuse same buffers (no allocation)
4. Buffer type is `Uint32Array` for permutation indices (spec requirement)
5. Test proves buffer reuse (same reference or allocation counter)

### C-26: Fast-Path Monotone Check
1. Linear scan before sort checks if depth is already monotone decreasing among visible instances
2. If ordered: skip sort, only compact visible instances
3. Test: uniform depth (all z=0) → sort skipped
4. Test: already-descending depth → sort skipped
5. Test: out-of-order depth → sort runs, correct output

### Cross-Cutting
1. `npm run typecheck` passes
2. `npm run test` passes (all tests, not just Level 7)
3. Level 7 DoD file updated: "front-to-back" → "far-to-near (painter's algorithm)"
4. No new files created except tests (if needed beyond existing Level 7 test file)
5. The gap analysis SUMMARY can mark C-24, C-25, C-26 as DONE

## What "Done" Means Visually

After this fix, a scene with overlapping instances at different z values will render correctly:
- Far objects are drawn first (background)
- Near objects are drawn last (foreground, overpainting far objects)
- This is the standard painter's algorithm required by the spec
