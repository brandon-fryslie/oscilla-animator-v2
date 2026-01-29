# Sprint: immediate-leak-fix - Fix Subarray Retention Memory Leak

**Generated:** 2026-01-25
**Confidence:** HIGH: 3, MEDIUM: 0, LOW: 0
**Status:** READY FOR IMPLEMENTATION

## Sprint Goal

Fix the immediate memory leak caused by depthSortAndCompact returning views into pooled buffers that are then stored in DrawOp instances.

## Scope

**Deliverables:**
- P0: Fix single-group path to copy compacted data (HIGH)
- P1: Add defensive copy in depthSortAndCompact itself (HIGH)
- P2: Verify fix with memory profile (HIGH)

## Work Items

### P0: Fix Single-Group Path in assembleDrawPathInstancesOp

**Acceptance Criteria:**
- [ ] The single-group code path (lines 1196-1206) copies compacted buffers before storing in DrawOp
- [ ] Pattern matches the multi-group path (lines 830-838)
- [ ] No subarray views escape into frame.ops

**Technical Notes:**
- Location: `src/runtime/RenderAssembler.ts:1196-1206`
- The multi-group path already does the right thing at lines 830-838
- Simply replicate that copy pattern for the single-group path

**Implementation:**
```typescript
// BEFORE (LEAK)
const compacted = depthSortAndCompact(projection, count, colorBuffer, rotation, scale2);
const instanceTransforms = buildInstanceTransforms(
  compacted.count,
  compacted.screenPosition,  // VIEW - will be corrupted next frame!
  ...
);

// AFTER (SAFE)
const compacted = depthSortAndCompact(projection, count, colorBuffer, rotation, scale2);
const instanceTransforms = buildInstanceTransforms(
  compacted.count,
  new Float32Array(compacted.screenPosition),  // COPY - safe
  new Float32Array(compacted.screenRadius),
  compacted.rotation ? new Float32Array(compacted.rotation) : undefined,
  compacted.scale2 ? new Float32Array(compacted.scale2) : undefined,
  new Float32Array(compacted.depth)
);
const copiedColor = new Uint8ClampedArray(compacted.color);
```

### P1: Add Defensive Comment/Contract to depthSortAndCompact

**Acceptance Criteria:**
- [ ] JSDoc clearly states return values are views valid only until next call
- [ ] Consider adding debug-mode assertion that tracks if views were copied

**Technical Notes:**
- The comment at lines 259-264 already warns about this, but it's easily missed
- Strengthen the contract documentation
- Consider runtime tracking in debug mode (Sprint 3)

### P2: Verify Fix with Memory Profile

**Acceptance Criteria:**
- [ ] Run dev server with Chrome DevTools memory profiling
- [ ] Confirm heap growth is bounded over 1000+ frames
- [ ] No retained Float32Array views in heap snapshots

**Technical Notes:**
- Use Chrome DevTools → Memory → Heap Snapshot
- Look for Float32Array objects with unexpected retention
- Run animation for 60+ seconds and compare heap before/after

## Dependencies

None - this is the immediate fix sprint.

## Risks

- **Risk:** Copy introduces performance regression
  - **Mitigation:** Profile before/after; the copy is small (visible elements only)
  - **Fallback:** Pool the output buffers too if copy is slow

## Files to Modify

1. `src/runtime/RenderAssembler.ts` - lines ~1196-1210
