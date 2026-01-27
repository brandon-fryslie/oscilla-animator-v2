# Sprint: runtime-selection - Wire Runtime and Selection Events
Generated: 2026-01-27T12:00:02Z
Confidence: HIGH: 2, MEDIUM: 2, LOW: 0
Status: PARTIALLY READY

## Sprint Goal
Wire RuntimeService to emit playback and runtime error events. Wire SelectionStore to emit selection and hover events.

**NOTE: Per-frame events (frameStarted, frameCompleted) are explicitly EXCLUDED - too high frequency, not useful.**

## Scope
**Deliverables:**
- Playback state events
- Runtime error events
- Selection and hover events
- At least one existing use case migrated per event type

## Work Items

### P0: Emit playbackStateChanged events [HIGH]
**Acceptance Criteria:**
- [ ] Play button → `PlaybackStateChanged` with state='playing'
- [ ] Pause button → `PlaybackStateChanged` with state='paused'
- [ ] Stop button → `PlaybackStateChanged` with state='stopped'
- [ ] State transitions are correctly tracked
- [ ] **Migrate one use case:** UI transport controls subscribe to this event

**Technical Notes:**
- Find where playback state is managed (likely AnimationLoop or RuntimeStore)
- Emit on state transitions only, not continuously

### P1: Emit selectionChanged events [HIGH]
**Acceptance Criteria:**
- [ ] Click block → `SelectionChanged` with new selection
- [ ] Click edge → `SelectionChanged` with new selection
- [ ] Click canvas (deselect) → `SelectionChanged` with empty selection
- [ ] Multi-select → `SelectionChanged` with multiple items
- [ ] **Migrate one use case:** Inspector panel subscribes to update displayed block

**Technical Notes:**
- SelectionStore already tracks selection
- Need to emit event when selection changes

### P2: Emit runtimeError events [MEDIUM]
**Acceptance Criteria:**
- [ ] NaN detection → `RuntimeError` emitted
- [ ] Infinity detection → `RuntimeError` emitted
- [ ] Error includes location context (block, field)
- [ ] **Migrate one use case:** DiagnosticHub subscribes for runtime diagnostics

#### Unknowns to Resolve
- Where are runtime errors currently detected?
- Is there existing error handling to hook into?

#### Exit Criteria
- Find runtime error detection code
- Understand error context available
- Confidence → HIGH

### P3: Emit hoverChanged events [MEDIUM]
**Acceptance Criteria:**
- [ ] Hover over block → `HoverChanged` with target
- [ ] Hover over port → `HoverChanged` with target
- [ ] Mouse leave → `HoverChanged` with null
- [ ] Debounced appropriately (no spam)
- [ ] **Migrate one use case:** Port highlight store subscribes for hover effects

#### Unknowns to Resolve
- Is hover state currently tracked?
- Where does hover tracking live (UI component or store)?

#### Exit Criteria
- Locate hover tracking code
- Understand current hover state management
- Confidence → HIGH

## Dependencies
- Sprint 1 (event-types) must be complete
- Need EventHub available in relevant stores/services

## Risks
- Event spam: hover events can fire rapidly
- Mitigation: Debounce hover events

## EXCLUDED (per user direction)
- ~~frameStarted~~ - Too high frequency, not useful
- ~~frameCompleted~~ - Too high frequency, not useful
