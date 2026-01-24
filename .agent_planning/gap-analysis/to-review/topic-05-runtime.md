---
topic: 05
name: Runtime
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: to-review
audited: 2026-01-23T12:00:00Z
item_count: 2
---

# Topic 05: Runtime — Items for Review

## Items

### R-6: Float64Array vs Float32Array for scalar storage
**Spec says**: RuntimeState uses `Float32Array` for scalars and fields
**Code does**: Uses Float64Array for scalars (higher precision, no truncation bugs)
**Why it might be better**: Avoids floating-point precision issues during computation. Only converts to Float32 at render boundary.
**Question for user**: Should runtime use Float32 (spec-compliant, smaller memory) or Float64 (current, higher precision)?

### R-7: Stamp-based cache invalidation vs CacheKey model
**Spec says**: Explicit CacheKey model (I14) for cache invalidation
**Code does**: Stamp-based cache (compile stamp, runtime stamp) — simpler but may over-invalidate
**Why it might be better**: Stamp-based is simpler, correct (never serves stale), just potentially wasteful. CacheKey adds complexity for marginal benefit.
**Question for user**: Is stamp-based caching sufficient, or should we implement the full CacheKey model?
