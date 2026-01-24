---
topic: 05
name: Runtime
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: critical
audited: 2026-01-23T12:00:00Z
item_count: 3
priority_reasoning: Runtime event model uses boolean flags instead of EventPayload[], blocking SampleAndHold. String-based cache keys violate I8. Runtime type dispatch per step adds overhead.
---

# Topic 05: Runtime — Critical Gaps

## Items

### C-8: Event model is boolean flags, not EventPayload[]
**Problem**: Runtime event handling uses simple boolean flags (Uint8Array with 0/1 values). Spec requires `Map<number, EventPayload[]>` for proper event payloads (value, timestamp, source). This blocks SampleAndHold and any event-carrying data.
**Evidence**: src/runtime/RuntimeState.ts:461 — `eventScalars: Uint8Array`
**Obvious fix?**: No — requires designing EventPayload type and integrating with schedule executor.

### C-15: Materializer cache uses string concatenation (violates I8)
**Problem**: Materializer cache key uses `${fieldId}:${instanceId}` string construction — string allocation per cache check in hot path. Violates "no string lookups" invariant I8.
**Evidence**: src/runtime/Materializer.ts:193
**Obvious fix?**: Yes — use numeric composite key (e.g., `fieldId * MAX_INSTANCES + instanceId`) or nested Map<FieldExprId, Map<InstanceId, cached>>.

### C-16: Runtime type dispatch per step (resolveSlotOffset)
**Problem**: ScheduleExecutor does runtime slot metadata lookup per step to determine storage bank (f64 vs objects). Spec says "No runtime type dispatch" — slot selection should be pre-computed at compile time.
**Evidence**: src/runtime/ScheduleExecutor.ts:142
**Obvious fix?**: Partially — pre-compute storage/offset into each step at compile time (each evalSig step carries its storage target directly).
