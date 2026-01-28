# Sprint: core-types-history - Foundation Types & HistoryService

Generated: 2026-01-22
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Establish the type foundation and temporal history infrastructure for the debug visualization system.

## Scope

**Deliverables:**
1. Core types module (`src/ui/debug-viz/types.ts`)
2. HistoryService (`src/ui/debug-viz/HistoryService.ts`)
3. DebugService push integration (onSlotWrite hook + onMappingChanged event)
4. Comprehensive tests for HistoryService ring buffer semantics

## Work Items

### P0: Core Types Module

**File:** `src/ui/debug-viz/types.ts`

**Acceptance Criteria:**
- [ ] `DebugTargetKey` discriminated union (edge | port) with doc comment noting portName is stable PortBindingIR.portName
- [ ] `HistoryView` interface with buffer, writeIndex (monotonic unbounded), capacity=128, stride (Stride type), filled
- [ ] `Stride` type alias: `0 | 1 | 2 | 3 | 4`
- [ ] `SampleEncoding` interface with payload, stride, components, sampleable
- [ ] `getSampleEncoding(payload: PayloadType): SampleEncoding` — exhaustive switch with `never` default, covers all PayloadType members
- [ ] `AggregateStats` interface with count, stride, min/max/mean as Float32Array (length 4, first stride valid)
- [ ] `RendererSample` discriminated union: scalar (components Float32Array + stride + type) | aggregate (stats + type)
- [ ] `serializeKey(key: DebugTargetKey): string` — canonical bijective serialization ("e:" + edgeId, "p:" + blockId + "\0" + portName)
- [ ] Unit tests verify getSampleEncoding is exhaustive and returns correct stride for each payload

**Technical Notes:**
- vec2/vec3 may not be in current PayloadType union — check and handle with the payloads that exist
- Stride must be compile-time enforced (literal union, not number)
- AggregateStats Float32Arrays are length 4 regardless of stride (only first `stride` components meaningful)

### P1: HistoryService

**File:** `src/ui/debug-viz/HistoryService.ts`

**Acceptance Criteria:**
- [ ] `track(key)`: Resolves metadata via DebugService, guards (cardinality=one, temporality=continuous, sampleable=true, stride=1), allocates Float32Array(128), builds reverse map
- [ ] `track(key)`: Rejects field-cardinality keys (no throw, just returns)
- [ ] `track(key)`: Enforces MAX_TRACKED_KEYS=32, evicts oldest from hoverProbes (never pinned)
- [ ] `untrack(key)`: Removes entry from trackedKeys and slotToEntryIds reverse map
- [ ] `isTracked(key)`: Returns boolean
- [ ] `getHistory(key)`: Returns TrackedEntry directly (object-stable, no allocation). Returns undefined if not tracked.
- [ ] `onSlotWrite(slotId, value)`: Pushes value into all entries on that slot. Uses safe JS modulo: `((writeIndex % capacity) + capacity) % capacity`. Increments writeIndex. Updates filled.
- [ ] `onMappingChanged()`: Re-resolves each tracked key. Updates reverse map if slot changed. Discards+reallocates buffer if stride changed. Sets slotId=null if key no longer resolves.
- [ ] `clear()`: Drops all entries and reverse maps.
- [ ] TrackedEntry implements HistoryView directly (same object reference)
- [ ] Reverse map: `Map<ValueSlot, Set<string>>` (set-based, not array)
- [ ] Key serialization uses canonical `serializeKey()` from types.ts
- [ ] No onFieldWrite method (signal-only in v1)
- [ ] Tests: ring buffer wrap-around correctness
- [ ] Tests: writeIndex monotonic unbounded behavior
- [ ] Tests: stride mismatch on rebind → discard and reallocate
- [ ] Tests: MAX_TRACKED_KEYS eviction (hoverProbes evicted, pinned preserved)
- [ ] Tests: onMappingChanged with slot change, stride change, key disappearance

**Technical Notes:**
- TrackedEntry stores: key, slotId (null if paused), stride (always 1 in v1), buffer, writeIndex, filled, capacity
- hoverProbes vs pinnedProbes: maintain insertion-ordered Set<string> for each
- `track()` adds to hoverProbes by default; pinning is a future API
- writeIndex is a JS number (safe integer range is ~9 quadrillion, no risk of overflow in practice)

### P2: DebugService Push Integration

**File:** Modify `src/services/DebugService.ts`

**Acceptance Criteria:**
- [ ] `updateSlotValue()` calls `historyService.onSlotWrite(slotId, value)` after storing value
- [ ] New `onMappingChanged()` event: called at end of `setEdgeToSlotMap()` and `setPortToSlotMap()`
- [ ] HistoryService subscribes to onMappingChanged (either direct call or simple callback registration)
- [ ] `clear()` calls `historyService.clear()`
- [ ] No field buffer copy removal in this sprint (separate concern, noted as tech debt)
- [ ] Integration test: updateSlotValue → historyService receives value → getHistory returns correct ring
- [ ] Integration test: setEdgeToSlotMap triggers onMappingChanged → HistoryService rebinds

**Technical Notes:**
- Keep integration simple: DebugService holds a reference to historyService (injected or imported singleton)
- onMappingChanged is synchronous (no async, no event bus — direct call)
- HistoryService needs access to DebugService metadata for resolution in track() — avoid circular deps by passing a resolver function

## Dependencies

- PayloadType union from `src/core/canonical-types.ts`
- CanonicalType and resolveExtent from canonical types
- DebugService existing API (getEdgeMetadata, EdgeMetadata with cardinality)

## Risks

| Risk | Mitigation |
|------|-----------|
| Circular dependency DebugService ↔ HistoryService | HistoryService takes a resolver function, not DebugService reference |
| PayloadType union may not include all planned payloads | getSampleEncoding covers what exists; exhaustive default catches additions |
| writeIndex overflow | JS safe integer range is 2^53; at 60fps = ~4.7 million years |
