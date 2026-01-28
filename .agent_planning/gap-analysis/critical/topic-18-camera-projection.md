---
topic: 18
name: Camera & Projection
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/18-camera-projection.md
category: critical
audited: 2026-01-28T12:25:00Z
item_count: 1
resolved_since_last: [C-1, C-3]
---

# Topic 18: Camera & Projection - CRITICAL Items

## ✅ RESOLVED: C-1 (Depth Sort Direction)
**Fixed in commit f8b0569** - Sort now uses far-to-near (descending depth). See `src/runtime/RenderAssembler.ts:110-113,156-164`.

## ✅ RESOLVED: C-3 (Fast-Path Monotone Check)
**Fixed in commit 988f967** - Added monotone check before sort. See `src/runtime/RenderAssembler.ts:156-172` comment: "Fast-path: check if depth is already monotone decreasing (far-to-near)".

---

## C-2: No Preallocated Permutation Buffer (Per-Frame Allocations)

**Status: DEFERRED** — Tracked as bead oscilla-animator-v2-la0 (P3)

**Spec requirement (Depth Ordering Contract, lines 305-309):**
> Permutation storage:
> - MUST be preallocated (no per-frame allocation)
> - Reuse same Uint32Array buffer across frames
> - Reallocate only when instanceCount increases

**Current implementation:** Still allocates per-frame. Acceptable for current performance requirements but should be optimized for large instance counts.

**Note:** This is a performance optimization, not a correctness issue. Deferred until profiling shows it's a bottleneck.
