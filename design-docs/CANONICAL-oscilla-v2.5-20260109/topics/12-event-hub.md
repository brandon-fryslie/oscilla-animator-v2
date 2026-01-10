---
parent: ../INDEX.md
topic: event-hub
order: 12
---

# Event Hub

> A typed, synchronous, non-blocking event spine that decouples subsystems without becoming hooks or middleware. Events are domain facts emitted after state changes, enabling coordination without coupling.

**Related Topics**: [07-diagnostics-system](./07-diagnostics-system.md), [04-compilation](./04-compilation.md), [05-runtime](./05-runtime.md)
**Key Terms**: [EventHub](../GLOSSARY.md#eventhub), [EditorEvent](../GLOSSARY.md#editorevent), [GraphCommitted](../GLOSSARY.md#graphcommitted)

---

## Overview

The EventHub is the coordination spine of the entire system. It answers:
- **What just happened?** (patch edited, compilation finished, runtime swapped programs)
- **Who needs to know?** (diagnostics, UI, compiler, export, tests)
- **How do they react?** (by subscribing to typed events, not by coupling to each other)

Events are **not logs**. They are **structured facts about state changes** that:
- Enable decoupling (stores don't import each other)
- Support testing (tests can subscribe and assert emissions)
- Make behavior traceable (events are inspectable data)
- Prevent reentrancy loops (handlers can't synchronously mutate core state)

---

## Design Goals

### Typed (No Stringly-Typed Names)

Events are a discriminated union of strongly-typed interfaces:

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

This gives compile-time exhaustiveness checking and IDE autocomplete.

### Synchronous by Default

The emitter:
- Calls listeners synchronously
- Does NOT await
- Does NOT accept Promises
- Isolates failures (try/catch per listener)

This prevents "macro expansion is slow because some listener awaited a fetch."

### Non-Blocking

Listeners **cannot affect control flow**. The emitter does not allow:
- Returning `false` to cancel
- Mutating a passed "context object" to influence behavior
- Priority ordering semantics beyond deterministic subscription order

If you need "can this happen?", that's validation, not an event.

### Scoped (Per-Store Instance)

EventHub is owned by the top-level store (e.g., `EditorStore.events`), not a global singleton.

This supports:
- Multiple patch instances
- Multi-client editing
- Server-authoritative runtime

### Traceable

Events are:
- Logged for debugging
- Inspectable data structures
- Available to tests for assertions

No "hidden side effects" in incidental traversal order.

### Testable

Unit tests can subscribe and assert:

```typescript
test('macro expansion emits MacroInserted', () => {
  const events: EditorEvent[] = [];
  editorStore.events.subscribe(e => events.push(e));

  editorStore.insertMacro('Dots', { x: 100, y: 100 });

  expect(events).toContainEqual(
    expect.objectContaining({ type: 'MacroInserted', macroName: 'Dots' })
  );
});
```

### Cannot Become Hooks

Events are emitted **after** state changes are committed. Handlers are **not allowed** to synchronously mutate core state.

No "before/after" patterns unless explicitly modeled as two separate events.

---

## Core Rule

**Events are emitted after state changes are committed, and handlers cannot mutate core state synchronously.**

This prevents:
- Reentrancy loops
- Non-deterministic behavior
- Hidden coupling

---

## Event Categories

Events are organized by domain.

### Patch / Graph Lifecycle

Domain facts about the patch structure:

- `GraphCommitted` - Patch graph changed (blocks/buses/bindings)
- `BlockAdded` - New block created
- `BlockRemoved` - Block deleted
- `BlocksMoved` - Blocks repositioned
- `BlockParamChanged` - Block parameter updated
- `BusCreated` - New bus created
- `BusDeleted` - Bus removed
- `PublisherAdded` - Bus publisher created
- `ListenerAdded` - Bus listener created
- `MacroInserted` - Macro expanded into patch
- `TimeRootChanged` - TimeRoot block changed

### Compile Lifecycle

Compilation state transitions:

- `CompileStarted` - Compilation began
- `CompileFinished` - Compilation completed (success or failure)
- `ProgramSwapped` - Runtime began executing new program

### Runtime Lifecycle

Runtime state changes:

- `PlaybackStarted` - Animation playback began
- `PlaybackStopped` - Animation playback paused/stopped
- `ScrubStarted` - User began scrubbing timeline
- `ScrubEnded` - User finished scrubbing
- `TransportModeChanged` - Switched between scrub/performance modes

### Diagnostics

Diagnostic state changes (see [07-diagnostics-system](./07-diagnostics-system.md)):

- `DiagnosticAdded` - New diagnostic surfaced
- `DiagnosticCleared` - Diagnostics cleared for a scope

### Health Monitoring

Low-frequency health snapshots:

- `RuntimeHealthSnapshot` - Periodic runtime performance metrics (2-5 Hz, NOT per-frame)

---

## Event Metadata

Every event includes standard metadata:

```typescript
interface EventMeta {
  patchId: string;         // Which patch this event relates to
  rev: number;             // Patch revision (increments on commits)
  tx: string;              // Transaction ID (groups related events)
  origin: 'ui' | 'import' | 'system' | 'remote' | 'migration';
  at: number;              // Timestamp (performance.now() or Date.now())
}
```

### Transaction Boundaries

A "transaction" is one user intent:
- Insert macro
- Create bus
- Add listener
- Delete block(s)
- Change param slider (maybe coalesced)

Within a transaction:
- Multiple events may be emitted
- All share the same `tx` ID
- All share the same `rev` (post-commit)

Implementation uses a store-level `runTx(origin, fn)` wrapper:

```typescript
runTx('ui', () => {
  // Mutate state
  // All emitted events get same tx + rev
});
```

This can be implemented with MobX `runInAction` or `transaction`.

---

## EventHub API

### Minimal Interface

```typescript
class EventHub {
  // Emit an event
  emit(event: EditorEvent): void;

  // Subscribe to specific event type
  on<T extends EditorEvent['type']>(
    type: T,
    handler: (event: Extract<EditorEvent, { type: T }>) => void
  ): () => void; // Returns unsubscribe function

  // Subscribe to all events (logging, debugging)
  subscribe(handler: (event: EditorEvent) => void): () => void;
}
```

### Example Usage

```typescript
// Subscribe to compile events
const unsubscribe = editorStore.events.on('CompileFinished', (event) => {
  if (event.status === 'ok') {
    console.log(`Compiled in ${event.durationMs}ms`);
  }
});

// Later: unsubscribe
unsubscribe();
```

---

## Emission Principles

These principles guide where and when to emit events, without being overly prescriptive about exact call sites.

### Principle 1: Single Source of Truth

Events are emitted at the **single choke point** where state actually changes:

**Good**:
```typescript
// In PatchStore.addBlock (the one place blocks are added)
addBlock(type, position) {
  const blockId = generateId();
  this.blocks.set(blockId, { type, position });
  this.events.emit({ type: 'BlockAdded', blockId, blockType: type, position });
}
```

**Bad**:
```typescript
// Emit in multiple places "wherever we add blocks"
// This leads to missed emissions and inconsistency
```

### Principle 2: Emit After Commit

Events are emitted **after** the state change is committed:

```typescript
// GOOD: State change → commit → emit
addBlock(type, position) {
  const block = createBlock(type, position);
  this.blocks.set(block.id, block); // Commit
  this.events.emit({ type: 'BlockAdded', ... }); // Emit
}

// BAD: Emit before commit
// Listeners see event but state isn't updated yet
```

### Principle 3: No Async in Emitter

Emitter calls listeners synchronously, does not await:

```typescript
emit(event: EditorEvent) {
  for (const listener of this.listeners) {
    try {
      listener(event); // Synchronous call
    } catch (err) {
      console.error('Event listener failed:', err);
    }
  }
}
```

If a listener needs async work, it handles it internally:

```typescript
events.on('PatchSaved', async (event) => {
  // Async work happens inside listener
  await uploadToCloud(event.patchId);
});
```

### Principle 4: Coalesce High-Frequency Events

For events that could fire many times per second (e.g., slider drags):

**Option A**: Emit only on commit (e.g., pointerup)
**Option B**: Throttle emissions

Do NOT emit per mousemove—this floods the event log.

### Principle 5: Domain Functions Don't Import UI

Domain functions (like `expandMacro`, `addBus`, `addListener`) may emit events, but must NOT import:
- UI services
- Other stores (except their direct dependencies)
- Side-effect systems

Events let UI react without coupling domain logic to UI concerns.

---

## Event Categories: Emission Patterns

### Graph Mutations

**When**: After any user operation that changes the patch graph

**What**: Emit `GraphCommitted` once per transaction, plus specific events (`BlockAdded`, `BusCreated`, etc.)

**Example**:
```typescript
runTx('userEdit', () => {
  addBlock('Dots', { x: 100, y: 100 });
  // Emits: BlockAdded
  // Then at end: GraphCommitted
});
```

### Macro Expansion

**When**: After macro is fully expanded and all internal blocks/wires/bindings are committed

**What**: Emit `MacroInserted` with created entity IDs

**Pattern**:
```typescript
expandMacro(macroId, position) {
  const { createdBlocks, createdWires, createdPublishers, createdListeners } =
    internalExpansion(macroId, position);

  this.events.emit({
    type: 'MacroInserted',
    macroId,
    macroName: getMacroName(macroId),
    createdBlocks,
    createdWires,
    createdPublishers,
    createdListeners
  });
}
```

Downstream systems react:
- Console log clears (if configured)
- Compiler triggers recompile
- Selection updates

**Do not** clear console inside `expandMacro`. Emit event; let console store react.

### Compile Pipeline

**When**: At compile lifecycle boundaries

**What**:
1. `CompileStarted` - When compilation begins
2. `CompileFinished` - When compilation completes (success OR failure)
3. `ProgramSwapped` - When runtime adopts new program

**Pattern**:
```typescript
async compile() {
  const compileId = generateId();
  const patchRevision = this.patchStore.revision;

  this.events.emit({ type: 'CompileStarted', compileId, patchRevision, trigger: 'graphCommitted' });

  const result = await runCompiler(this.patchStore.graph);

  this.events.emit({
    type: 'CompileFinished',
    compileId,
    patchRevision,
    status: result.ok ? 'ok' : 'failed',
    durationMs: result.durationMs,
    diagnostics: result.diagnostics || []
  });

  if (result.ok) {
    this.runtime.swapProgram(result.program);
    this.events.emit({ type: 'ProgramSwapped', compileId, patchRevision, swapMode: 'soft' });
  }
}
```

### Runtime Health

**When**: At low frequency (2-5 Hz), NOT per-frame

**What**: Emit `RuntimeHealthSnapshot` with performance metrics

**Pattern**:
```typescript
// In runtime loop, throttled to 2-5 Hz
if (shouldEmitHealthSnapshot()) {
  this.events.emit({
    type: 'RuntimeHealthSnapshot',
    patchId,
    activePatchRevision,
    tMs: currentTime,
    frameBudget: { fpsEstimate, avgFrameMs, worstFrameMs },
    evalStats: { fieldMaterializations, nanCount, infCount }
  });
}
```

---

## What NOT to Do

### Avoid High-Frequency Runtime Events

Do NOT emit per-frame or per-phase-tick events:

```typescript
// BAD: Emits 60 times per second
onFrame() {
  this.events.emit({ type: 'FrameAdvanced', tMs });
}
```

Frame ticks and phase changes are signals in the runtime model, not app-level events.

### No Cancellation / Return Values

Events cannot be cancelled or influence control flow:

```typescript
// BAD: Listener returns false to cancel
const shouldContinue = this.events.emit({ type: 'BeforeBlockAdd', ... });
if (!shouldContinue) return;
```

If you need validation, use a validation function, not an event.

### No Async Event Handlers in Emitter

The emitter does NOT support async handlers:

```typescript
// BAD: Emitter awaits listeners
for (const listener of this.listeners) {
  await listener(event); // NO
}
```

If a listener needs async work, it handles it internally (fire-and-forget or managed separately).

---

## Refactor Strategy

To adopt EventHub without boiling the ocean:

### Phase A: Put Event Spine in Place

1. Add EventHub to top-level store (EditorStore or PatchStore)
2. Add 4-6 high-value events:
   - `GraphCommitted`
   - `CompileStarted` / `CompileFinished`
   - `MacroInserted`
   - `DiagnosticCleared`

### Phase B: Convert Cross-Store Coupling

Find places where stores import each other **only to cause side effects** and replace with events.

**Rule**: If store A imports store B only to call `B.doSomething()`, replace with event emission and subscription.

### Phase C: Convert UI Coordination

UI panels should react to events rather than store-to-store calls:
- Console/log panel
- Diagnostics panel
- Selection changes
- Toasts

### Phase D: Leave Core Dataflow Alone

Don't touch the compiler pipeline or runtime scheduler "just to event-ify" it unless currently coupled in a bad way.

---

## Integration with DiagnosticHub

See [13-event-diagnostics-integration](./13-event-diagnostics-integration.md) for how DiagnosticHub subscribes to events.

Key pattern:
- `GraphCommitted` → authoring validators run
- `CompileFinished` → compile diagnostics snapshot updated
- `RuntimeHealthSnapshot` → runtime diagnostics updated

---

## Example: Full Event Flow

User drops a macro into the patch:

```
1. UI calls editorStore.insertMacro('Dots', position)

2. Inside insertMacro:
   - runTx('ui', () => {
       - Add blocks
       - Add wires
       - Add bus bindings
     })
   - Emit MacroInserted { createdBlocks, createdWires, ... }
   - Emit GraphCommitted { reason: 'macroExpand', diffSummary, ... }

3. Subscribers react:
   - LogStore hears MacroInserted → clears console (if configured)
   - DiagnosticHub hears GraphCommitted → runs authoring validators
   - CompileOrchestrator hears GraphCommitted → triggers compile

4. Compile runs:
   - Emit CompileStarted
   - Run compiler
   - Emit CompileFinished { status: 'ok', diagnostics: [...] }

5. DiagnosticHub hears CompileFinished → updates compile diagnostics snapshot

6. Runtime swaps program:
   - Emit ProgramSwapped { swapMode: 'soft' }

7. UI updates reactively via MobX stores subscribing to diagnostics/state
```

All coordination happens via events. No direct store-to-store calls.

---

## See Also

- [07-diagnostics-system](./07-diagnostics-system.md) - How diagnostics consume events
- [13-event-diagnostics-integration](./13-event-diagnostics-integration.md) - DiagnosticHub subscription contract
- [04-compilation](./04-compilation.md) - Compile lifecycle
- [05-runtime](./05-runtime.md) - Runtime lifecycle
- [Glossary: EventHub](../GLOSSARY.md#eventhub)
