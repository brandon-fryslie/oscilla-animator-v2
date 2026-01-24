---
topic: 12
name: event-hub
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/12-event-hub.md
category: to-review
audited: 2026-01-24T22:00:00Z
item_count: 5
---

# Topic 12: Event Hub - Gap Analysis

## Primary Category: TO-REVIEW (5 items)

The EventHub core is well-implemented (typed, synchronous, exception-isolated, unsubscribe pattern). However, it differs from spec in scope and additional event types.

### 1. Scoped per-store (not singleton)
- **Spec**: "EventHub is owned by the top-level store (EditorStore.events), not a global singleton"
- **Implementation**: EventHub is instantiated in RootStore and passed to DiagnosticHub. Appears per-store, not singleton.
- **Assessment**: TO-REVIEW - Verify that multiple patches each get their own EventHub instance

### 2. Event metadata (EventMeta)
- **Spec**: Every event includes `{ patchId, rev, origin, at }` metadata
- **Implementation**: Events have patchId and patchRevision but NOT `origin` or `at` timestamp fields
- **Assessment**: TO-REVIEW - Missing origin and timestamp may not matter for current use cases but deviates from spec

### 3. Missing event types (Patch/Graph lifecycle)
- **Spec**: PatchLoaded, PatchSaved, PatchReset, BlockAdded, BlockRemoved, BlocksMoved, EdgeAdded, EdgeRemoved, MacroExpanded, CompositeEdited, CompositeSaved, TimeRootChanged
- **Implementation**: Only 7 event types (GraphCommitted, CompileBegin, CompileEnd, ProgramSwapped, RuntimeHealthSnapshot, ParamChanged, BlockLowered)
- **Assessment**: TO-REVIEW - Many spec events are not in the union. GraphCommitted aggregates most patch changes. Some granular events (BlockAdded, EdgeRemoved) might be unnecessary if GraphCommitted suffices.

### 4. Missing event types (Runtime lifecycle)
- **Spec**: PlaybackStarted, PlaybackStopped, ScrubStarted, ScrubEnded, TransportModeChanged
- **Implementation**: None of these exist
- **Assessment**: TO-REVIEW - May be needed for continuity system's wrapEvent detection

### 5. Missing event types (Diagnostics)
- **Spec**: DiagnosticAdded, DiagnosticCleared
- **Implementation**: Not implemented. Diagnostics are managed internally by DiagnosticHub.
- **Assessment**: TO-REVIEW - May not be needed if UI queries DiagnosticHub directly via MobX

## Also

### DONE (6 items)
1. Typed discriminated union for EditorEvent
2. Synchronous emission (listeners run before emit returns)
3. Exception isolation (try/catch per listener, continues on error)
4. Type-safe `on<T>()` subscription with narrowing
5. Global `subscribe()` for all events (logging/debugging)
6. `clear()` for cleanup and `listenerCount()` for introspection

### UNIMPLEMENTED (2 items)
1. **Handlers cannot mutate core state**: Spec says this is enforced. Implementation has no enforcement mechanism (it's a policy, not a constraint).
2. **Event logging/tracing**: Spec mentions events are "logged for debugging". No automatic event log exists.

### TRIVIAL (1 item)
1. Spec calls it "CompileStarted"/"CompileFinished", implementation calls it "CompileBegin"/"CompileEnd" - same semantics, naming difference only.
