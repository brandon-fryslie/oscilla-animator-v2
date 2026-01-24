---
topic: 05
name: Runtime
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: critical
audited: 2026-01-24T19:00:00Z
item_count: 1
priority_reasoning: Runtime event model uses boolean flags instead of EventPayload[], blocking SampleAndHold. C-15 and C-16 resolved in prior sprints.
---

# Topic 05: Runtime — Critical Gaps

## Remaining Items

### C-8: Event model is boolean flags, not EventPayload[]
**Status**: BLOCKED (needs event design)
**Problem**: Runtime event handling uses simple boolean flags (Uint8Array with 0/1 values). Spec requires `Map<number, EventPayload[]>` for proper event payloads (value, timestamp, source). This blocks SampleAndHold and any event-carrying data.
**Evidence**: src/runtime/RuntimeState.ts:461 — `eventScalars: Uint8Array`
**Obvious fix?**: No — requires designing EventPayload type and integrating with schedule executor.
**Blocked by**: Event model architectural design (no spec for EventPayload yet)

## Resolved Items

### C-15: Materializer cache uses string concatenation (violates I8) ✅
**Status**: DONE
**Resolution**: Nested Map<FieldExprId, Map<InstanceId, buffer>> implemented. No string allocation in hot path.

### C-16: Runtime type dispatch per step (resolveSlotOffset) ✅
**Status**: DONE (commit 129ea87)
**Resolution**: Pre-computed slot lookup O(1) — slot selection determined at compile time.
