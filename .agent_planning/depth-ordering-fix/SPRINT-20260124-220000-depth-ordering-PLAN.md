# Sprint: depth-ordering — Fix Depth Sort Direction, Allocation, and Fast-Path

Generated: 2026-01-24T22:00:00Z
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Fix all three critical depth-ordering issues (C-24/C-25/C-26) in `depthSortAndCompact()` so that instances render with correct painter's algorithm ordering, without per-frame allocations, and with a fast-path skip for already-ordered depth arrays.

## Scope

**Deliverables:**
1. Correct sort direction (far-to-near, `db - da`)
2. Preallocated permutation and compaction buffers
3. Fast-path monotone check before sort

## Work Items

### P0: Fix sort direction (C-24) [HIGH]

**What:** Change `depthSortAndCompact` sort comparator from `da - db` to `db - da`.

**Acceptance Criteria:**
- [ ] Sort comparator uses `db - da` (descending depth = far first)
- [ ] Tie-break remains `a - b` (stable by lane index, ascending)
- [ ] All Level 7 tests updated to expect far-to-near ordering
- [ ] Tests verify: given depths [0.1, 0.3, 0.5, 0.9], output order is [0.9, 0.5, 0.3, 0.1]
- [ ] Integration tests verify: group at higher z (farther) drawn first, lower z (nearer) drawn last

**Technical Notes:**
- The JSDoc comment on `depthSortAndCompact` says "front-to-back" — update to "far-to-near (painter's algorithm)"
- The Level 7 DoD file says "front-to-back, stable" — this is the spec contradiction that created the bug. The canonical spec (Topic 18, lines 260-262) says "far-to-near." The DoD file is wrong; it should say "far-to-near, stable."
- Integration test assertions like `toBeGreaterThanOrEqual(result.depth[i-1])` must flip to `toBeLessThanOrEqual` for descending order

---

### P1: Preallocate permutation and compaction buffers (C-25) [HIGH]

**What:** Replace per-frame allocations with a reusable buffer cache that grows only when instance count increases.

**Acceptance Criteria:**
- [ ] No `new Float32Array(...)` or `new number[]` inside `depthSortAndCompact` per-frame
- [ ] Permutation buffer is `Uint32Array`, reused across calls, grows only when count increases
- [ ] Compaction output buffers are preallocated and reused
- [ ] A new test verifies: calling `depthSortAndCompact` twice with same count does not allocate (can verify via buffer identity or a counter)
- [ ] Buffer growth is monotone (never shrinks) to avoid thrashing

**Technical Notes:**
- Strategy: Module-level `DepthSortBuffers` object with `indices: Uint32Array`, `screenPos: Float32Array`, `radius: Float32Array`, `depth: Float32Array`, `color: Float32Array`. Grow on demand.
- Alternative: Accept a buffer pool parameter. But the gap analysis spec says "preallocated (no per-frame allocation)" which suggests module-scoped persistent buffers.
- The `projectInstances` function also allocates per-frame (`new Float32Array(count * 2)` etc.) — this is a separate concern from the sort buffers. The spec specifically calls out permutation storage. For this sprint, focus on `depthSortAndCompact` buffers only.
- Return value must use the preallocated buffers. Callers must not hold references across frames (they're overwritten next frame). Current callers (`assemblePerInstanceShapes`, `assembleDrawPathInstancesOp`) immediately consume the result to build DrawOps, so this is safe.

---

### P2: Add fast-path monotone check (C-26) [HIGH]

**What:** Before sorting, check if depth array is already monotone decreasing (far-to-near). If so, skip sort and only compact visible instances.

**Acceptance Criteria:**
- [ ] Linear scan checks `depth[i] > depth[i-1]` for visible pairs; if none found, skip sort
- [ ] When skipped: output is compacted (invisible removed) but not reordered
- [ ] Test: all-same-depth array triggers fast path (no sort)
- [ ] Test: already-ordered descending array triggers fast path
- [ ] Test: unordered array still sorts correctly
- [ ] Performance: flat layout (all z=0) must not sort

**Technical Notes:**
- Spec pseudocode (lines 279-285): check `depth[i] > depth[i-1]` among visible pairs. If no violation found, `alreadyOrdered = true`, skip sort.
- The check must only compare adjacent *visible* instances (invisible ones don't participate in ordering).
- After C-24, "ordered" means monotone *decreasing* (far-to-near). So the check is: for visible pairs, if `depth[i] > depth[i-1]`, not already ordered.

## Dependencies

- None. All work is internal to `depthSortAndCompact()` and its tests.

## Risks

- **Test update scope:** Level 7 tests assert wrong direction. All assertions about sort order must flip. This is mechanical but must be thorough.
- **Downstream visual change:** Fixing the sort will change visual output for any scene with z-variation. This is the correct behavior (painter's algorithm) but will look different from before.
- **Buffer reuse semantics:** Callers must not hold result references across frames. Current code is safe (immediately builds DrawOps) but document this contract.
