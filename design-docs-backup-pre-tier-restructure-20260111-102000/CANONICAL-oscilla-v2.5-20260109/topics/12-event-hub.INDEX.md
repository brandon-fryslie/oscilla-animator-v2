# Event Hub - Indexed Summary

**Tier**: T2 (Coordination Spine)
**Size**: 550 lines → ~120 lines (22% compression)

## Overview [L16-28]
Typed, synchronous, non-blocking event spine. Decouples subsystems without becoming hooks/middleware.

**Not logs** - Structured facts about state changes enabling coordination without coupling.

## Design Goals [L31-111]

**Typed** (no stringly-typed): Discriminated union of interfaces + exhaustiveness checking [L33-50]

**Synchronous by Default**: Listeners called synchronously, no awaits, isolates failures [L52-60]

**Non-Blocking**: Listeners cannot affect control flow. No `return false` cancellation, no context mutation, no priority ordering [L62-69]

**Scoped**: Owned by top-level store, not global singleton. Supports multi-instance [L71-78]

**Traceable**: Logged, inspectable data, available to tests [L80-87]

**Testable**: Unit tests can subscribe + assert [L89-103]

**Cannot Become Hooks**: Emitted after state change commits. Handlers can't sync-mutate core state [L106-110]

## Core Rule [L114-122]
**Events emitted after state commits, handlers cannot mutate core state synchronously.**
Prevents reentrancy, non-determinism, hidden coupling.

## Event Categories [L125-176]

**Patch/Graph Lifecycle**: PatchLoaded, PatchSaved, GraphCommitted, BlockAdded/Removed, BlocksMoved, EdgeAdded/Removed, MacroExpanded, CompositeEdited, TimeRootChanged [L130-146]

**Compile Lifecycle**: CompileBegin, CompileEnd, ProgramSwapped [L148-153]

**Runtime Lifecycle**: PlaybackStarted/Stopped, ScrubStarted/Ended, TransportModeChanged [L156-162]

**Diagnostics**: DiagnosticAdded, DiagnosticCleared [L165-166]

**Health Monitoring**: RuntimeHealthSnapshot (2-5 Hz, NOT per-frame) [L169-175]

## Event Metadata [L180-193]
```typescript
interface EventMeta {
  patchId: string;
  rev: number;             // Patch revision (increments on commits)
  origin: 'ui'|'import'|'system'|'remote'|'migration';
  at: number;              // Timestamp
}
```
Note: Transaction concepts removed (branch-axis not yet designed)

## EventHub API [L197-229]
```typescript
class EventHub {
  emit(event: EditorEvent): void;
  on<T extends EditorEvent['type']>(
    type: T,
    handler: (event: Extract<EditorEvent, { type: T }>) => void
  ): () => void;  // Unsubscribe function
  subscribe(handler: (event: EditorEvent) => void): () => void;
}
```

## Emission Principles [L232-314]

**Principle 1: Single Source of Truth** - Emit at one choke point where state changes

**Principle 2: Emit After Commit** - State change → commit → emit (listeners see updated state)

**Principle 3: No Async in Emitter** - Synchronous calls, no await. Listeners handle async internally.

**Principle 4: Coalesce High-Frequency** - Don't emit per-mousemove/per-frame. Emit on commit (pointerup) or throttle.

**Principle 5: Domain Functions Don't Import UI** - May emit events, but not import UI services or other stores (except direct deps).

## Event Categories: Emission Patterns [L318-397]

**Graph Mutations** [L320-332]: Emit GraphCommitted once/tx + specific events (BlockAdded, etc.)

**Macro Expansion** [L334-361]: After fully expanded, emit MacroExpanded with created IDs. Downstream systems react (console clear, compiler trigger, selection).

**Compile Pipeline** [L363-396]:
1. CompileBegin (when starts)
2. Run compiler
3. CompileEnd (status: success|failure, diagnostics, durationMs)
4. Runtime swaps program → ProgramSwapped

**Runtime Health** [L398-417]: 2-5 Hz throttled, emit RuntimeHealthSnapshot with perf metrics

## What NOT to Do [L422-461]

**Avoid High-Frequency**: Don't emit per-frame (would be 60 Hz). Frame ticks are signals, not events.

**No Cancellation**: Events can't return false or influence control flow. Use validation functions, not events.

**No Async in Emitter**: Emitter doesn't await listeners. Listeners handle async internally.

## Refactor Strategy [L464-494]

**Phase A**: Put EventHub in place (4-6 high-value events)
**Phase B**: Convert cross-store coupling (stores import only for side effects)
**Phase C**: Convert UI coordination (console, diagnostics, selection)
**Phase D**: Leave core dataflow alone

## Integration with DiagnosticHub [L497-504]
See [13-event-diagnostics-integration](./13-event-diagnostics-integration.md)

Key pattern:
- GraphCommitted → authoring validators
- CompileFinished → compile diagnostics
- RuntimeHealthSnapshot → runtime diagnostics

## Example: Full Event Flow [L508-540]
User drops macro:
1. UI calls expandMacro()
2. Emit MacroExpanded + GraphCommitted
3. Subscribers react: LogStore clears, DiagnosticHub validates, CompileOrchestrator compiles
4. Compile emits CompileBegin → run compiler → CompileEnd
5. DiagnosticHub updates compile diagnostics
6. Runtime swaps → emit ProgramSwapped
7. UI updates reactively via MobX

All via events. No direct store-to-store calls.

## Related
- [07-diagnostics-system](./07-diagnostics-system.md)
- [13-event-diagnostics-integration](./13-event-diagnostics-integration.md)
- [04-compilation](./04-compilation.md)
- [05-runtime](./05-runtime.md)
- [Glossary: EventHub](../GLOSSARY.md#eventhub)
