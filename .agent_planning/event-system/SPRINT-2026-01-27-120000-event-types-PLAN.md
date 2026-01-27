# Sprint: event-types - Add Spec-Compliant Event Types
Generated: 2026-01-27T12:00:00Z
Confidence: HIGH: 4, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal
Extend the existing EventHub with all event types defined in the spec, add the `once()` method, and create type-safe event maps.

## Scope
**Deliverables:**
- Add all 17 event types to `EditorEvent` union
- Add `once()` method to EventHub
- Create `EventMap` type for callback-style API
- Update existing tests for new events

## Work Items

### P0: Add new event types to EditorEvent union [HIGH]
**Acceptance Criteria:**
- [ ] All 17 event types from spec are defined in `src/events/types.ts`
- [ ] Each event type follows the spec interface exactly
- [ ] Discriminated union works with all new types
- [ ] TypeScript narrows correctly for all event types

**Technical Notes:**
- Group events by category (Patch, Compilation, Runtime, Selection, UI, EditorState)
- Use `readonly` for all event properties
- Event payload types match spec exactly

### P1: Add Patch events [HIGH]
**Acceptance Criteria:**
- [ ] `BlockChangedEvent` with blockId
- [ ] `BlockAddedEvent` with blockId
- [ ] `BlockRemovedEvent` with blockId
- [ ] `EdgeAddedEvent` with edgeId
- [ ] `EdgeRemovedEvent` with edgeId
- [ ] `PatchResetEvent` (no payload)

**Technical Notes:**
- These supplement the existing `GraphCommittedEvent`, not replace it
- Spec says emit fine-grained events AND GraphCommitted

### P2: Add Runtime events [HIGH]
**Acceptance Criteria:**
- [ ] `PlaybackStateChangedEvent` with state enum ('playing' | 'paused' | 'stopped')
- [ ] `RuntimeErrorEvent` with error details (NaN, Inf, etc.)

**Technical Notes:**
- **NO per-frame events** - explicitly excluded (too high frequency)
- RuntimeError distinct from compile errors

### P3: Add Selection and UI events [HIGH]
**Acceptance Criteria:**
- [ ] `SelectionChangedEvent` with Selection type
- [ ] `HoverChangedEvent` with HoverTarget | null
- [ ] `PanelLayoutChangedEvent` with layout
- [ ] `ViewportChangedEvent` with viewport
- [ ] `EditorStateChangedEvent` with action/editor/validity

**Technical Notes:**
- Selection type should match existing SelectionStore.selection
- HoverTarget needs definition
- EditorStateChanged is complex - see spec addendum

### P4: Add once() method to EventHub [HIGH]
**Acceptance Criteria:**
- [ ] `once()` method registers listener that auto-unsubscribes after first call
- [ ] Type-safe like `on()`
- [ ] Returns unsubscribe function (for manual early cleanup)
- [ ] Tests cover once behavior

**Technical Notes:**
- Wrap handler in auto-unsubscribe wrapper
- Must handle case where user unsubscribes before event fires

## Dependencies
- None - this is foundational

## Risks
- Type complexity with 17+ event types (mitigate: organize by category)
- Breaking existing code (mitigate: additive changes only)
