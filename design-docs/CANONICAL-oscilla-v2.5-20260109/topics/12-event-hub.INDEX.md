---
parent: ../INDEX.md
topic: event-hub
source_hash: 54767532e0cd
---

# Index: Event Hub (12-event-hub.md)

Dense index for fast navigation and contradiction detection.

## 1. Identity

- **Topic**: event-hub
- **Order**: 12
- **Formal Name**: Event Hub
- **Source Hash**: 54767532e0cd
- **Applies to**: EventHub system coordination spine

---

## 2. Core Concept

**What**: Typed, synchronous, non-blocking event spine. Decouples subsystems without becoming hooks/middleware.

**Why**: Enable coordination without coupling. Events are domain facts emitted after state changes.

**Not logs** - Structured facts about state changes enabling coordination without coupling.

**Key Answers**:
- What just happened? (patch edited, compilation finished, runtime swapped programs)
- Who needs to know? (diagnostics, UI, compiler, export, tests)
- How do they react? (by subscribing to typed events, not by coupling to each other)

---

## 3. Design Goals

| Goal | Description | Mechanism |
|------|-------------|-----------|
| **Typed** | No stringly-typed names | Discriminated union of strongly-typed interfaces with exhaustiveness checking |
| **Synchronous** | Calls listeners synchronously, does NOT await | Emitter does not accept Promises |
| **Non-Blocking** | Listeners cannot affect control flow | No cancellation returns, no priority ordering |
| **Scoped** | Owned by top-level store instance, not global singleton | Supports multiple instances and multi-client editing |
| **Traceable** | Events are logged for debugging | Inspectable data structures available to tests |
| **Testable** | Unit tests can subscribe and assert | Direct subscription API for test validation |
| **Cannot Become Hooks** | Events emitted after state changes | Handlers not allowed to synchronously mutate core state |

---

## 4. Structural Rules

**Core Rule**:
- Events are emitted AFTER state changes are committed
- Handlers CANNOT mutate core state synchronously
- Prevents reentrancy loops, non-deterministic behavior, hidden coupling

**Event Type Definition**:
```typescript
type EditorEvent =
  | GraphCommittedEvent
  | CompileStartedEvent
  | CompileFinishedEvent
  | ProgramSwappedEvent
  | RuntimeHealthSnapshotEvent
  | MacroInsertedEvent
  | BusCreatedEvent
  | BlockAddedEvent
  | ... // All event types
```

**EventHub API**:
```typescript
class EventHub {
  emit(event: EditorEvent): void;
  on<T extends EditorEvent['type']>(type: T, handler: (event: Extract<EditorEvent, { type: T }>) => void): () => void;
  subscribe(handler: (event: EditorEvent) => void): () => void;
}
```

**Event Metadata** (every event):
```typescript
interface EventMeta {
  patchId: string;          // Which patch this event relates to
  rev: number;              // Patch revision (increments on commits)
  origin: 'ui' | 'import' | 'system' | 'remote' | 'migration';
  at: number;               // Timestamp (performance.now() or Date.now())
}
```

Note: Transaction concepts removed (branch-axis not yet designed)

---

## 5. Event Categories (Organized by Domain)

### Patch / Graph Lifecycle (13 events)
`PatchLoaded`, `PatchSaved`, `PatchReset`, `GraphCommitted`, `BlockAdded`, `BlockRemoved`, `BlocksMoved`, `EdgeAdded`, `EdgeRemoved`, `MacroExpanded`, `CompositeEdited`, `CompositeSaved`, `TimeRootChanged`

### Compile Lifecycle (3 events)
`CompileBegin`, `CompileEnd` (status: 'success' | 'failure'), `ProgramSwapped`

### Runtime Lifecycle (5 events)
`PlaybackStarted`, `PlaybackStopped`, `ScrubStarted`, `ScrubEnded`, `TransportModeChanged`

### Diagnostics (2 events)
`DiagnosticAdded`, `DiagnosticCleared`

### Health Monitoring (1 event)
`RuntimeHealthSnapshot` (2-5 Hz, NOT per-frame)

---

## 6. Emission Principles

| Principle | Description | Good Pattern | Anti-Pattern |
|-----------|-------------|--------------|--------------|
| **Single Source of Truth** | Emit at single choke point where state changes | One addBlock method emits once | Emit in multiple places |
| **Emit After Commit** | Emit after state change is committed | State → commit → emit | Emit before commit (listeners see event but state isn't updated) |
| **No Async in Emitter** | Calls listeners synchronously, does not await | Listener handles async internally | Emitter awaits listeners |
| **Coalesce High-Frequency** | Don't emit per mousemove | Emit only on commit or throttle | Flood event log |
| **Domain Isolation** | Domain functions may emit but must NOT import UI | emit() calls in domain logic | Domain logic imports UI services |

### Specific Emission Patterns

**Graph Mutations**: Emit `GraphCommitted` once per transaction + specific events (`BlockAdded`, etc.)

**Macro Expansion**: Emit `MacroExpanded` after all internal blocks/edges are committed. Downstream systems react: LogStore clears console, DiagnosticHub validates, CompileOrchestrator compiles.

**Compile Pipeline**: Emit `CompileBegin` → run compiler → `CompileEnd` (status + diagnostics) → `ProgramSwapped`

**Runtime Health**: Throttled to 2-5 Hz (NOT per-frame), with performance metrics and eval stats

---

## 7. Restrictions & Anti-Patterns

| What NOT to Do | Why | Rationale |
|---|---|---|
| High-frequency runtime events (per-frame) | Floods event log | Frame ticks are signals in runtime model, not app-level events |
| Cancellation / return values | Events cannot influence control flow | Use validation function instead |
| Async event handlers in emitter | Unpredictable timing | Listener handles async internally (fire-and-forget) |
| Global singleton EventHub | Prevents multi-instance and multi-client support | Must be scoped to top-level store instance |
| "Before/After" hooks | Violates emission-after-commit rule | Model as two separate events if needed |
| Cross-store direct imports for side effects | Creates hidden coupling | Replace with event emission and subscription |
| Relying on "transaction concepts" (tx ID) | Not yet designed in system | Branch axis functionality deferred |

### Refactor Strategy

**Phase A**: Put EventHub in place (4-6 high-value events: GraphCommitted, CompileStarted/Finished, MacroInserted, DiagnosticCleared)

**Phase B**: Convert cross-store coupling where stores import only for side effects

**Phase C**: Convert UI coordination (console/log panel, diagnostics panel, selection changes, toasts)

**Phase D**: Leave core dataflow alone (compiler pipeline and runtime scheduler)

### Integration with DiagnosticHub

See [13-event-diagnostics-integration](./13-event-diagnostics-integration.md) for subscription contract.

Key pattern:
- `GraphCommitted` → authoring validators run
- `CompileEnd` → compile diagnostics snapshot updated
- `RuntimeHealthSnapshot` → runtime diagnostics updated

---

## Related Topics

- [07-diagnostics-system](./07-diagnostics-system.md) - How diagnostics consume events
- [13-event-diagnostics-integration](./13-event-diagnostics-integration.md) - DiagnosticHub subscription contract
- [04-compilation](./04-compilation.md) - Compile lifecycle context
- [05-runtime](./05-runtime.md) - Runtime lifecycle context
- [Glossary: EventHub](../GLOSSARY.md#eventhub) - The coordination spine
- [Glossary: EditorEvent](../GLOSSARY.md#editorevent) - Discriminated union of all event types
- [Glossary: GraphCommitted](../GLOSSARY.md#graphcommitted) - Patch graph changed event
