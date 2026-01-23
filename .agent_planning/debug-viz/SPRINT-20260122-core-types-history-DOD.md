# Definition of Done: core-types-history

## Acceptance Tests

### Core Types
- [ ] `getSampleEncoding` is exhaustive (adding a PayloadType without an entry fails compilation)
- [ ] `Stride` type prevents assignment of arbitrary numbers
- [ ] `serializeKey` produces unique strings for all valid DebugTargetKey combinations
- [ ] `AggregateStats.min/max/mean` are Float32Array length 4

### HistoryService
- [ ] Ring buffer wraps correctly at capacity boundary (write 200 values, read back last 128 in order)
- [ ] `getHistory()` returns same object reference across calls (no allocation)
- [ ] `track()` rejects cardinality !== 'one' silently
- [ ] `track()` rejects stride !== 1 silently
- [ ] `track()` evicts oldest hover probe when at MAX_TRACKED_KEYS=32
- [ ] `onSlotWrite()` pushes to all entries on that slot (multiple keys on same slot)
- [ ] `onMappingChanged()` rebinds entries to new slots
- [ ] `onMappingChanged()` discards buffer when stride changes
- [ ] `onMappingChanged()` pauses entries (slotId=null) when key no longer resolves
- [ ] `untrack()` removes entry from both maps
- [ ] `clear()` empties all state
- [ ] Consumer index formula produces correct sample order (newest first)

### DebugService Integration
- [ ] `updateSlotValue()` triggers HistoryService push
- [ ] `setEdgeToSlotMap()` triggers `onMappingChanged()`
- [ ] `clear()` clears HistoryService
- [ ] No circular dependency between DebugService and HistoryService

## Verification Commands

```bash
npx tsc --noEmit                    # Type check passes
npx vitest run src/ui/debug-viz/    # All new tests pass
npx vitest run src/services/DebugService.test.ts  # Existing tests still pass
```
