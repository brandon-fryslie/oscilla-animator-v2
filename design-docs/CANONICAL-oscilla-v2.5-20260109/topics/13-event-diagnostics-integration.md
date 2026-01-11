---
parent: ../INDEX.md
topic: event-diagnostics-integration
order: 13
---

# Event-Diagnostics Integration

> How DiagnosticHub subscribes to EventHub to maintain authoritative diagnostic state across compile, runtime, and authoring contexts. This is the contract between the event spine and the diagnostic nervous system.

**Related Topics**: [12-event-hub](./12-event-hub.md), [07-diagnostics-system](./07-diagnostics-system.md)
**Key Terms**: [DiagnosticHub](../GLOSSARY.md#diagnostichub), [EventHub](../GLOSSARY.md#eventhub), [EditorEvent](../GLOSSARY.md#editorevent)

---

## Overview

DiagnosticHub is a **stateful subscriber** to EventHub. It:
- Listens to five key events (GraphCommitted, CompileStarted, CompileFinished, ProgramSwapped, RuntimeHealthSnapshot)
- Maintains separate diagnostic snapshots (compile, authoring, runtime)
- Manages diagnostic lifecycle (deduplication, expiry, aggregation)
- Provides query interface for UI

**Key distinction**:
- **EventHub**: Stateless stream of facts ("what happened")
- **DiagnosticHub**: Stateful model with lifecycle ("what's currently true/risky/broken")

---

## The Five-Event Contract

DiagnosticHub subscribes to exactly five events from EventHub:

| Event | Purpose | DiagnosticHub Action |
|-------|---------|----------------------|
| `GraphCommitted` | Patch graph changed | Run authoring validators, update authoring snapshot |
| `CompileBegin` | Compilation began | Mark revision as "pending compile" |
| `CompileEnd` | Compilation completed | **Replace** compile snapshot (authoritative) |
| `ProgramSwapped` | Runtime adopted new program | Set active revision pointer |
| `RuntimeHealthSnapshot` | Periodic runtime health (2-5 Hz) | Update/merge runtime diagnostics |

No other events are needed for diagnostics.

---

## Event Handlers

### 1. GraphCommitted → Authoring Validators

When the user edits the patch, immediate feedback is critical.

```typescript
events.on('GraphCommitted', (event) => {
  // Fast, synchronous validators (no compilation)
  const authoringDiags = runAuthoringValidators(patchStore.graph, event.patchRevision);

  // Update authoring snapshot
  diagnosticHub.setAuthoringSnapshot(event.patchRevision, authoringDiags);
});
```

**Authoring validators** check for:
- Missing TimeRoot
- Multiple TimeRoots
- Disconnected blocks (no path to TimeRoot)
- Empty buses (publishers but no listeners)
- Unbound inputs using silent values

These run **synchronously** (no async compilation) for instant feedback.

**Timing**: < 10ms for typical patches

---

### 2. CompileBegin → Pending State

When compilation begins, mark that revision as "compiling."

```typescript
events.on('CompileBegin', (event) => {
  diagnosticHub.markCompilePending(event.patchRevision, event.compileId);
});
```

**UI effect**: Can show "compiling..." badge or dim compile diagnostics

---

### 3. CompileEnd → Compile Snapshot Replacement

When compilation completes (status: 'success' | 'failure'), the `diagnostics` payload is the **authoritative snapshot** for that revision.

```typescript
events.on('CompileEnd', (event) => {
  // REPLACE compile snapshot entirely (not merge)
  diagnosticHub.setCompileSnapshot(
    event.patchRevision,
    event.compileId,
    event.diagnostics
  );

  // Clear pending state
  diagnosticHub.clearCompilePending(event.patchRevision);
});
```

**Critical rule**: This is a **snapshot replacement**, not incremental updates.

If `CompileEnd` has 3 diagnostics, the compile snapshot for that revision is exactly those 3 diagnostics (even if the previous compile had 10).

**Why replacement, not merge**:
- Diagnostics that were present but are now fixed should disappear
- Compiler knows the complete state—no partial updates
- Simpler reasoning: "compile snapshot = what compiler said"

---

### 4. ProgramSwapped → Active Revision Tracking

When the runtime begins executing a newly compiled program, set the "active revision" pointer.

```typescript
events.on('ProgramSwapped', (event) => {
  diagnosticHub.setActiveRevision(event.patchRevision);
});
```

**Purpose**: Runtime diagnostics are attached to the **active revision** (the program currently running), not the latest edit.

**Example scenario**:
1. User edits patch → patchRevision = 42
2. Compile starts for revision 42
3. User makes another edit → patchRevision = 43
4. Compile finishes for revision 42
5. Runtime swaps to revision 42 program
6. `activeRevision = 42` (NOT 43)
7. Runtime diagnostics attach to revision 42

This prevents runtime diagnostics from "jumping" to a program that hasn't started yet.

---

### 5. RuntimeHealthSnapshot → Runtime Diagnostics Update

Runtime emits health snapshots at low frequency (2-5 Hz), containing performance metrics and optional diagnostic deltas.

```typescript
events.on('RuntimeHealthSnapshot', (event) => {
  if (event.diagnosticsDelta) {
    // Merge raised/resolved diagnostics into runtime snapshot
    for (const diag of event.diagnosticsDelta.raised) {
      diagnosticHub.addOrUpdateRuntimeDiagnostic(diag, event.activePatchRevision);
    }

    for (const diagId of event.diagnosticsDelta.resolved) {
      diagnosticHub.resolveRuntimeDiagnostic(diagId);
    }
  }

  // Apply expiry (diagnostics not seen recently are auto-resolved)
  diagnosticHub.expireRuntimeDiagnostics(event.at, RUNTIME_DIAG_TTL);
});
```

**Runtime diagnostics** are accumulated with decay:
- Same diagnostic ID → update `occurrenceCount` + `lastSeenAt`
- Old entries (not seen in last 10 seconds) → expire

**No spam**: UI shows "P_NAN_DETECTED x237" not 237 separate entries.

---

## DiagnosticHub Internal State

DiagnosticHub maintains three separate diagnostic spaces:

```typescript
class DiagnosticHub {
  // Compile diagnostics: one snapshot per patchRevision
  private compileSnapshots = new Map<number, CompileSnapshot>();

  // Authoring diagnostics: fast validators, updated on GraphCommitted
  private authoringSnapshot: AuthoringSnapshot | null = null;

  // Runtime diagnostics: aggregated window with expiry
  private runtimeDiagnostics = new Map<string, Diagnostic>();

  // Which patchRevision is currently active in runtime
  private activeRevision: number = 0;

  // Which patchRevision is currently compiling
  private pendingCompile: { revision: number; compileId: string } | null = null;

  // User mute state (per diagnostic ID)
  private mutedDiagnostics = new Set<string>();

  // Monotonic counter for snapshot versioning
  private diagnosticsRevision: number = 0;
}

interface CompileSnapshot {
  patchRevision: number;
  compileId: string;
  diagnostics: Diagnostic[];
  timestamp: number;
}

interface AuthoringSnapshot {
  patchRevision: number;
  diagnostics: Diagnostic[];
  timestamp: number;
}
```

---

## Query Interface

UI and other consumers query DiagnosticHub, not EventHub:

```typescript
// Get all diagnostics for currently active revision (running program)
getActiveDiagnostics(): Diagnostic[]

// Get diagnostics for a specific revision
getDiagnosticsByRevision(patchRevision: number): Diagnostic[]

// Get compile diagnostics snapshot for a revision
getCompileSnapshot(patchRevision: number): Diagnostic[] | undefined

// Get current authoring snapshot
getAuthoringSnapshot(): Diagnostic[]

// Get runtime diagnostics (aggregated, with occurrence counts)
getRuntimeDiagnostics(): Diagnostic[]

// Is compilation pending for current revision?
isCompilePending(): boolean
getPendingRevision(): number | null

// Get current active revision
getActiveRevision(): number

// Get diagnostics revision (monotonic counter, for UI reactivity)
getDiagnosticsRevision(): number
```

---

## Behavior Rules

### Rule 1: Compile Snapshots Are Complete

When `CompileFinished` emits diagnostics, that list **replaces** the previous compile snapshot for that revision.

```typescript
// BAD: Merge new diagnostics with old
setCompileSnapshot(rev, newDiags) {
  this.compileSnapshots[rev] = [...this.compileSnapshots[rev], ...newDiags];
}

// GOOD: Replace entirely
setCompileSnapshot(rev, compileId, diags) {
  this.compileSnapshots.set(rev, { patchRevision: rev, compileId, diagnostics: diags, timestamp: Date.now() });
  this.incrementRevision();
}
```

### Rule 2: Runtime Diagnostics Aggregate with Expiry

Runtime diagnostics are **not** snapshot-based. They accumulate over a time window:

```typescript
addOrUpdateRuntimeDiagnostic(diag: Diagnostic, activePatchRevision: number) {
  const existing = this.runtimeDiagnostics.get(diag.id);

  if (existing) {
    // Update occurrence count + lastSeenAt
    existing.metadata.occurrenceCount++;
    existing.metadata.lastSeenAt = Date.now();
  } else {
    // Add new
    this.runtimeDiagnostics.set(diag.id, diag);
    this.incrementRevision();
  }
}

expireRuntimeDiagnostics(currentTime: number, ttlMs: number) {
  for (const [id, diag] of this.runtimeDiagnostics) {
    if (currentTime - diag.metadata.lastSeenAt > ttlMs) {
      this.runtimeDiagnostics.delete(id);
      this.incrementRevision();
    }
  }
}
```

**TTL** (time-to-live): Typically 10 seconds. If a runtime diagnostic hasn't been seen in 10 seconds, it's considered resolved.

### Rule 3: Authoring Validators Run Synchronously

Authoring validators must be **fast** (< 10ms) because they run on every `GraphCommitted`:

```typescript
function runAuthoringValidators(graph: Graph, patchRevision: number): Diagnostic[] {
  const diags: Diagnostic[] = [];

  // Fast checks only (no compilation, no deep traversal)
  if (countTimeRoots(graph) === 0) {
    diags.push(createDiagnostic({
      code: 'E_TIME_ROOT_MISSING',
      severity: 'error',
      domain: 'authoring',
      primaryTarget: { kind: 'graph' },
      title: 'No TimeRoot',
      message: 'Patch must have exactly one TimeRoot block',
      patchRevision,
    }));
  }

  if (countTimeRoots(graph) > 1) {
    diags.push(createDiagnostic({
      code: 'E_TIME_ROOT_MULTIPLE',
      severity: 'error',
      domain: 'authoring',
      primaryTarget: { kind: 'graph' },
      title: 'Multiple TimeRoots',
      message: 'Patch has multiple TimeRoot blocks',
      patchRevision,
    }));
  }

  // Check for empty buses, disconnected blocks, etc.
  // All fast, synchronous checks

  return diags;
}
```

**What NOT to do in authoring validators**:
- Run full compilation
- Deep graph traversals (SCC, reachability beyond immediate neighbors)
- Async I/O

Those checks belong in **compile validators**, not authoring.

### Rule 4: Muting Is Per-ID

Users can mute specific diagnostics:

```typescript
muteDiagnostic(diagnosticId: string) {
  this.mutedDiagnostics.add(diagnosticId);
  this.incrementRevision();
}

unmuteDiagnostic(diagnosticId: string) {
  this.mutedDiagnostics.delete(diagnosticId);
  this.incrementRevision();
}

isMuted(diagnosticId: string): boolean {
  return this.mutedDiagnostics.has(diagnosticId);
}
```

Muted diagnostics are **still tracked** but filtered from UI queries:

```typescript
getActiveDiagnostics(): Diagnostic[] {
  const all = [
    ...this.getCompileSnapshot(this.activeRevision) || [],
    ...this.getAuthoringSnapshot(),
    ...this.getRuntimeDiagnostics(),
  ];

  return all.filter(d => !this.isMuted(d.id));
}
```

**Mute clearing**: If the user edits the patch and the diagnostic's target changes (e.g., they add a listener to the bus that was empty), the mute can be auto-cleared based on signature change.

---

## UI Integration

UI components subscribe to DiagnosticHub (via MobX store wrapper):

```tsx
import { observer } from 'mobx-react-lite';

const DiagnosticsPanel = observer(() => {
  const { diagnosticStore } = useRootStore();

  // diagnosticStore wraps DiagnosticHub and exposes MobX observables
  return (
    <div>
      <h2>Diagnostics ({diagnosticStore.totalCount})</h2>

      <div className="summary">
        <span>{diagnosticStore.errorCount} errors</span>
        <span>{diagnosticStore.warningCount} warnings</span>
      </div>

      {diagnosticStore.activeDiagnostics.map(diag => (
        <DiagnosticRow key={diag.id} diagnostic={diag} />
      ))}
    </div>
  );
});
```

**Reactivity**: When DiagnosticHub calls `incrementRevision()`, the MobX store detects the change and triggers UI re-render.

---

## Example: Full Flow

User drops a macro, which triggers a type error:

```
1. User action: expandMacro('Dots', position)

2. GraphCommitted emitted
   → DiagnosticHub runs authoring validators
   → Authoring snapshot updated (no errors from fast checks)
   → UI shows "authoring: clean"

3. CompileBegin emitted
   → DiagnosticHub marks revision 42 as "pending"
   → UI shows "compiling..."

4. Compiler runs, finds type mismatch

5. CompileEnd emitted { status: 'failure', diagnostics: [E_TYPE_MISMATCH] }
   → DiagnosticHub replaces compile snapshot for revision 42
   → Compile snapshot now has 1 error
   → DiagnosticHub.incrementRevision()
   → UI re-renders, shows error in diagnostic panel

6. User sees error, clicks "Go to target"
   → UI focuses the port with the type mismatch

7. User fixes the error, edits the patch
   → GraphCommitted emitted (revision 43)
   → Authoring validators run (clean)

8. CompileBegin emitted (revision 43)

9. CompileEnd emitted { status: 'success', diagnostics: [] }
   → DiagnosticHub replaces compile snapshot for revision 43 with empty array
   → Error disappears from UI

10. ProgramSwapped emitted
    → DiagnosticHub sets activeRevision = 43
    → Runtime diagnostics now attach to revision 43
```

All coordination happens via events. No direct coupling between compiler, diagnostics, and UI.

---

## Performance Considerations

### Authoring Validators Must Be Fast

Authoring validators run **on every GraphCommitted** (potentially many times per second during active editing).

**Target**: < 10ms even for large patches

**Techniques**:
- Simple graph property checks (count TimeRoots, check for empty buses)
- No deep traversals (no SCC, no reachability beyond immediate neighbors)
- No compilation

If a check is slow, move it to **compile validators** (runs once per compilation, not per edit).

### Runtime Health Snapshots Are Throttled

Runtime emits `RuntimeHealthSnapshot` at 2-5 Hz, **not per-frame** (which would be 60 Hz).

This keeps event throughput low and prevents event log spam.

### Diagnostic Revision Bumping

DiagnosticHub calls `incrementRevision()` when the active diagnostic set changes. UI subscribes to this counter.

**Only increment when**:
- Compile snapshot replaced
- Authoring snapshot updated
- Runtime diagnostic added/updated/expired
- Diagnostic muted/unmuted

**Do NOT increment** for:
- Internal state changes that don't affect queries
- Metadata updates within existing diagnostics (unless occurrence count changes meaningfully)

---

## Testing

DiagnosticHub integration is testable by subscribing to events and asserting diagnostic state:

```typescript
test('compile error updates diagnostic snapshot', () => {
  const hub = new DiagnosticHub();
  const events = new EventHub();

  hub.subscribe(events);

  // Emit compile end with error
  events.emit({
    type: 'CompileEnd',
    patchRevision: 1,
    compileId: 'compile-1',
    status: 'failure',
    diagnostics: [{
      id: 'E_TYPE_MISMATCH:port-b1:p2:rev1',
      code: 'E_TYPE_MISMATCH',
      severity: 'error',
      domain: 'compile',
      primaryTarget: { kind: 'port', blockId: 'b1', portId: 'p2' },
      title: 'Type Mismatch',
      message: 'Expected color, got float',
      scope: { patchRevision: 1, compileId: 'compile-1' },
      metadata: { firstSeenAt: 0, lastSeenAt: 0, occurrenceCount: 1, patchRevision: 1 }
    }]
  });

  // Assert compile snapshot updated
  const snapshot = hub.getCompileSnapshot(1);
  expect(snapshot).toHaveLength(1);
  expect(snapshot[0].code).toBe('E_TYPE_MISMATCH');
});
```

---

## See Also

- [12-event-hub](./12-event-hub.md) - Event architecture and emission patterns
- [07-diagnostics-system](./07-diagnostics-system.md) - Diagnostic types, codes, and UI integration
- [04-compilation](./04-compilation.md) - Where compile diagnostics originate
- [05-runtime](./05-runtime.md) - Runtime health monitoring
- [Glossary: DiagnosticHub](../GLOSSARY.md#diagnostichub)
