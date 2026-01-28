---
topic: 05
name: Runtime
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: critical
audited: 2026-01-24T21:35:00Z
item_count: 0
priority_reasoning: All runtime critical items resolved. C-8 EventPayload complete, C-15 cache keys complete, C-16 slot lookup complete.
---

# Topic 05: Runtime — Critical Gaps

## Remaining Items

(None — all resolved)

## Resolved Items

### C-8: Event model is boolean flags, not EventPayload[] ✅
**Status**: DONE (commits 1e75e00, 46f26b9)
**Resolution**: Added spec-compliant `EventPayload { key: string, value: number }` type and `events: Map<number, EventPayload[]>` to ProgramState/RuntimeState. Dual-path approach: boolean flags kept for fast path, Map added for data-carrying events. Events clear each frame (spec §6.1). 7 new tests. U-6 (SampleAndHold) now unblocked.

## Resolved Items

### C-15: Materializer cache uses string concatenation (violates I8) ✅
**Status**: DONE
**Resolution**: Nested Map<FieldExprId, Map<InstanceId, buffer>> implemented. No string allocation in hot path.

### C-16: Runtime type dispatch per step (resolveSlotOffset) ✅
**Status**: DONE (commit 129ea87)
**Resolution**: Pre-computed slot lookup O(1) — slot selection determined at compile time.
