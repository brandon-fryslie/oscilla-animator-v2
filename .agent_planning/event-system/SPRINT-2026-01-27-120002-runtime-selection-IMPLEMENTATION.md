# Sprint Implementation: runtime-selection
**Date:** 2026-01-27
**Status:** PARTIALLY COMPLETE (Selection/Hover done, Runtime deferred)

## What Was Implemented

### ✅ P1: SelectionChanged Events [COMPLETE]
**Implementation:** `src/stores/SelectionStore.ts`

SelectionStore now emits `SelectionChanged` events when:
- `selectBlock()` - User clicks a block
- `selectEdge()` - User clicks an edge
- `selectPort()` - User clicks a port
- `clearSelection()` - User clicks canvas (deselect)

**Pattern:**
1. Store receives EventHub via `setEventHub(eventHub, patchId, getPatchRevision)`
2. Actions capture previous selection before mutation
3. Actions emit event AFTER mutation completes
4. Event includes both current and previous selection for context

**Example Event:**
```typescript
{
  type: 'SelectionChanged',
  patchId: 'patch-0',
  patchRevision: 42,
  selection: { type: 'block', blockId: 'b1' },
  previousSelection: { type: 'none' }
}
```

### ✅ P3: HoverChanged Events [COMPLETE]
**Implementation:** `src/stores/SelectionStore.ts`

SelectionStore now emits `HoverChanged` events when:
- `hoverBlock()` - Mouse enters/leaves a block
- `hoverPort()` - Mouse enters/leaves a port

**Hover State Priority:**
- Port hover takes precedence over block hover in events
- If both `hoveredPortRef` and `hoveredBlockId` are set, port is reported

**Example Event:**
```typescript
{
  type: 'HoverChanged',
  patchId: 'patch-0',
  patchRevision: 43,
  hovered: {
    type: 'port',
    blockId: 'b1',
    portKey: 'phase',
    isInput: true
  }
}
```

## Files Modified

### Core Implementation
- `src/stores/SelectionStore.ts` - Added event emission to all selection/hover actions
- `src/stores/RootStore.ts` - Updated `setEventHub()` call with new signature

### Tests
- `src/stores/__tests__/SelectionStore.test.ts` - Added 11 new event emission tests
  - 5 tests for `SelectionChanged` events
  - 5 tests for `HoverChanged` events
  - 1 test for behavior without EventHub

## Test Results

**All tests passing:**
- EventHub: 31 tests ✅
- PatchStore: 37 tests ✅
- SelectionStore: 39 tests ✅ (added 11 new)
- Integration: 11 tests ✅
- **Total: 144 tests pass**

## What Was Deferred

### ⏸️ P0: PlaybackStateChanged Events [DEFERRED per user]
- Play/pause/stop state tracking
- Rationale: User requested focus on selection/hover first

### ⏸️ P2: RuntimeError Events [DEFERRED per user]
- Runtime error emission (NaN, Infinity detection)
- Rationale: User requested focus on selection/hover first

## Architectural Pattern Established

The store→EventHub pattern is now consistent across PatchStore and SelectionStore:

1. **Store Construction:**
   - Store receives dependencies in constructor
   - EventHub is NOT passed in constructor (avoids circular deps)

2. **EventHub Wiring (via RootStore):**
   ```typescript
   store.setEventHub(eventHub, patchId, () => patchRevision);
   ```

3. **Event Emission:**
   ```typescript
   if (this.eventHub && this.getPatchRevision) {
     this.eventHub.emit({
       type: 'EventType',
       patchId: this.patchId,
       patchRevision: this.getPatchRevision(),
       // ... event-specific fields
     });
   }
   ```

4. **Disposal:**
   - Stores implement `dispose()` to clean up event subscriptions
   - RootStore calls `dispose()` when needed

## Next Steps

Per user direction, this sprint is complete for selection/hover events. The deferred items (playback, runtime errors) can be addressed later when needed.

If continuing with Sprint 4 (Editor State Coordination), see:
- `SPRINT-2026-01-27-120003-editor-state-*.md`
- `design-docs/_new/01-Event-System.md` (Editor State Coordination section)
