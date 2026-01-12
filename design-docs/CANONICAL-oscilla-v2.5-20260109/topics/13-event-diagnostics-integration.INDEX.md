---
title: Event-Diagnostics Integration (Indexed)
parent: ../INDEX.md
source_hash: cd20cc64dedf
index_version: 1
generated: 2026-01-12
---

# Index: Event-Diagnostics Integration

**Source**: `13-event-diagnostics-integration.md`
**Topic**: event-diagnostics-integration
**Order**: 13
**Tier**: T2 (Structural)

---

## 1. ABSTRACT

DiagnosticHub is a **stateful subscriber** to EventHub that maintains authoritative diagnostic state across three contexts:
- **Compile diagnostics**: Snapshot-based, replaced on CompileEnd
- **Authoring diagnostics**: Fast validators run synchronously on GraphCommitted
- **Runtime diagnostics**: Aggregated with expiry (TTL-based, 2-5 Hz updates)

The Five-Event Contract defines the integration:
| Event | Action |
|-------|--------|
| GraphCommitted | Run authoring validators (fast, < 10ms) |
| CompileBegin | Mark revision as "pending compile" |
| CompileEnd | **Replace** compile snapshot (authoritative) |
| ProgramSwapped | Set active revision pointer |
| RuntimeHealthSnapshot | Update/merge runtime diagnostics with expiry |

**Key distinction**: EventHub is stateless (facts), DiagnosticHub is stateful (lifecycle).

---

## 2. CONCEPTS

### Core Concepts

| Concept | Definition | Location |
|---------|-----------|----------|
| **DiagnosticHub** | Stateful subscriber maintaining diagnostic snapshots across compile, authoring, runtime | Classes section |
| **EventHub** | Stateless event stream ("what happened") | Overview |
| **Compile Snapshot** | Authoritative diagnostic state per patchRevision, replaced on CompileEnd | Internal State |
| **Authoring Snapshot** | Fast validators for immediate feedback on edit | Event Handlers §1 |
| **Runtime Diagnostics** | Aggregated window with TTL expiry, 2-5 Hz updates | Event Handlers §5 |
| **Active Revision** | PatchRevision currently executing in runtime | Event Handlers §4 |
| **Pending Compile** | Revision currently being compiled | Internal State |
| **Mute State** | Per-diagnostic user preference, still tracked but filtered from UI | Behavior Rules §4 |
| **Diagnostic Revision** | Monotonic counter for UI reactivity on state changes | Internal State |

### Related Concepts

- **PatchRevision**: Version identifier for user edits
- **CompileId**: Unique identifier for compilation batch
- **Diagnostic**: Error/warning with code, severity, domain, targets, metadata
- **Occurrence Count**: How many times a diagnostic has been observed
- **TTL** (Time-To-Live): Expiry window for runtime diagnostics (typically 10 seconds)

---

## 3. RULES

### Compilation Rules

| Rule | Constraint | Why |
|------|-----------|-----|
| **Rule 1: Compile Snapshots Are Complete** | When CompileFinished emits diagnostics, that list **replaces** the previous snapshot (not merge) | Diagnostics that were fixed should disappear; compiler knows complete state |
| **Rule 2: Runtime Diagnostics Aggregate with Expiry** | Runtime diags accumulate over a time window; same ID = update occurrence + lastSeenAt; old entries (> TTL) auto-resolve | Prevents spam (show "P_NAN_DETECTED x237" not 237 entries); mirrors runtime's actual health |
| **Rule 3: Authoring Validators Run Synchronously** | Must be fast (< 10ms) on every GraphCommitted; no compilation, no deep traversals | Fast feedback critical for editing; slow checks belong in compile validators |
| **Rule 4: Muting Is Per-ID** | User mutes specific diagnostics; still tracked, filtered from queries | Preserve history; allow auto-unmute on target signature change |

### Event Handling Rules

| Event | Idempotency | Ordering | Side Effects |
|-------|------------|----------|--------------|
| GraphCommitted | Safe (snapshot replace) | Immediate | Update authoring snapshot, increment revision |
| CompileBegin | Safe (mark pending) | Before CompileEnd | Show "compiling..." badge |
| CompileEnd | Idempotent (replace snapshot) | Must follow CompileBegin | Clear pending state, increment revision |
| ProgramSwapped | Idempotent (set pointer) | After CompileEnd | Route runtime diags to correct revision |
| RuntimeHealthSnapshot | Merge semantics (update + expire) | Continuous (2-5 Hz) | Merge raised/resolved, apply TTL, increment revision |

### Query Rules

| Query | Preconditions | Filtering | Caching |
|-------|---------------|-----------|---------|
| getActiveDiagnostics() | Must have activeRevision set | Remove muted diagnostics | Use diagnosticsRevision for change detection |
| getDiagnosticsByRevision() | Valid patchRevision | Remove muted diagnostics | Per-revision snapshot |
| getCompileSnapshot() | Compilation must have completed | None (raw snapshot) | Immutable; bump revision on change |
| getAuthoringSnapshot() | GraphCommitted must have fired | Remove muted diagnostics | Replace on each edit |
| getRuntimeDiagnostics() | Runtime must be healthy | None (aggregate) | TTL-based expiry |
| isCompilePending() | Must track pendingCompile state | N/A | Fast boolean check |
| getDiagnosticsRevision() | Always valid | N/A | Monotonic counter; auto-increment |

---

## 4. INTERFACES

### DiagnosticHub Public API

```typescript
// Query diagnostics
getActiveDiagnostics(): Diagnostic[]
getDiagnosticsByRevision(patchRevision: number): Diagnostic[]
getCompileSnapshot(patchRevision: number): Diagnostic[] | undefined
getAuthoringSnapshot(): Diagnostic[]
getRuntimeDiagnostics(): Diagnostic[]

// Compile state
isCompilePending(): boolean
getPendingRevision(): number | null
getActiveRevision(): number

// Reactivity
getDiagnosticsRevision(): number

// Muting
muteDiagnostic(diagnosticId: string): void
unmuteDiagnostic(diagnosticId: string): void
isMuted(diagnosticId: string): boolean
```

### Event Subscriptions

DiagnosticHub subscribes to exactly 5 EventHub events:

```typescript
events.on('GraphCommitted', (event: GraphCommittedEvent) => {...})
events.on('CompileBegin', (event: CompileBeginEvent) => {...})
events.on('CompileEnd', (event: CompileEndEvent) => {...})
events.on('ProgramSwapped', (event: ProgramSwappedEvent) => {...})
events.on('RuntimeHealthSnapshot', (event: RuntimeHealthSnapshotEvent) => {...})
```

### Internal State Structure

```typescript
private compileSnapshots = new Map<number, CompileSnapshot>()
private authoringSnapshot: AuthoringSnapshot | null = null
private runtimeDiagnostics = new Map<string, Diagnostic>()
private activeRevision: number = 0
private pendingCompile: { revision: number; compileId: string } | null = null
private mutedDiagnostics = new Set<string>()
private diagnosticsRevision: number = 0
```

---

## 5. PATTERNS

### Pattern 1: Snapshot Replacement on CompileEnd

**When**: Compilation completes (success or failure)
**What**: Replace entire compile snapshot for revision
**Why**: Diagnostics fixed should disappear; compiler has complete state
**Implementation**:
```typescript
events.on('CompileEnd', (event) => {
  diagnosticHub.setCompileSnapshot(
    event.patchRevision,
    event.compileId,
    event.diagnostics  // Replace, not merge
  );
  diagnosticHub.clearCompilePending(event.patchRevision);
});
```

### Pattern 2: Authoring Validators on Every Edit

**When**: User edits patch (GraphCommitted)
**What**: Run fast synchronous validators (< 10ms)
**Why**: Immediate feedback for editing; slow checks deferred to compile
**Checks**: TimeRoot count, disconnected blocks, empty buses, unbound inputs
**Implementation**:
```typescript
events.on('GraphCommitted', (event) => {
  const authoringDiags = runAuthoringValidators(patchStore.graph, event.patchRevision);
  diagnosticHub.setAuthoringSnapshot(event.patchRevision, authoringDiags);
});
```

### Pattern 3: Runtime Diagnostics with TTL Expiry

**When**: Periodic health snapshots (2-5 Hz)
**What**: Merge raised/resolved diagnostics; auto-expire old entries
**Why**: Prevent spam; capture occurrence patterns; clean up stale diagnostics
**Implementation**:
```typescript
events.on('RuntimeHealthSnapshot', (event) => {
  // Merge raised/resolved
  for (const diag of event.diagnosticsDelta.raised) {
    diagnosticHub.addOrUpdateRuntimeDiagnostic(diag, event.activePatchRevision);
  }
  for (const diagId of event.diagnosticsDelta.resolved) {
    diagnosticHub.resolveRuntimeDiagnostic(diagId);
  }
  // Apply expiry
  diagnosticHub.expireRuntimeDiagnostics(event.at, RUNTIME_DIAG_TTL);
});
```

### Pattern 4: Active Revision Tracking

**When**: ProgramSwapped emitted
**What**: Set activeRevision pointer to current running program
**Why**: Route runtime diagnostics to correct revision; prevent "jumping" to unstarted programs
**Implementation**:
```typescript
events.on('ProgramSwapped', (event) => {
  diagnosticHub.setActiveRevision(event.patchRevision);
});
```

### Pattern 5: Monotonic Revision Bumping for UI Reactivity

**When**: Any change to active diagnostic set
**What**: Increment diagnosticsRevision counter; MobX store detects change
**Why**: Efficient UI re-rendering without polling; change detection via counter
**When to bump**: Snapshot replace, authoring update, runtime add/update/expire, mute/unmute
**Implementation**:
```typescript
private incrementRevision() {
  this.diagnosticsRevision++;
  // MobX observable property triggers re-render
}
```

---

## 6. EXAMPLES

### Example 1: User Drops Macro with Type Error

```
1. User drops macro → GraphCommitted emitted
   ✓ Authoring validators run (fast, < 10ms)
   ✓ Authoring snapshot updated (no errors from fast checks)
   ✓ UI shows "authoring: clean"

2. CompileBegin emitted
   ✓ Revision marked as "pending"
   ✓ UI shows "compiling..."

3. Compiler finds type mismatch → CompileEnd emitted
   ✓ Compile snapshot for revision replaced with 1 error
   ✓ diagnosticsRevision bumped
   ✓ UI re-renders, shows error in diagnostic panel

4. User fixes error → GraphCommitted emitted (new revision)
   ✓ Authoring validators run (clean)

5. CompileEnd emitted with success
   ✓ Compile snapshot replaced with empty array
   ✓ Error disappears from UI

6. ProgramSwapped emitted
   ✓ activeRevision updated
   ✓ Runtime diagnostics attach to new revision
```

### Example 2: Runtime Health Monitoring

```
t=0s: User starts running patch (ProgramSwapped → activeRevision=42)

t=0.2s: Runtime reports P_NAN_DETECTED on Port B1:P2
        → RuntimeHealthSnapshot with diagnosticsDelta.raised=[...]
        → addOrUpdateRuntimeDiagnostic() called
        → UI shows "P_NAN_DETECTED x1" in diagnostics panel

t=0.4s: P_NAN occurs again on same port
        → RuntimeHealthSnapshot emitted
        → occurrenceCount++ (now x2)
        → diagnosticsRevision bumped

t=10.5s: No new RuntimeHealthSnapshot with this diag
         → expireRuntimeDiagnostics() removes it (> 10s TTL)
         → UI updates, diagnostic disappears

t=11s: User makes edit → GraphCommitted emitted
       → Authoring snapshot updated
       → activeRevision still 42 (no compile yet)
```

### Example 3: Muting a Diagnostic

```
1. User sees persistent diagnostic with known cause → clicks "Mute"
   ✓ muteDiagnostic(id) called
   ✓ Added to mutedDiagnostics set
   ✓ diagnosticsRevision bumped
   ✓ UI filters it out (getActiveDiagnostics returns filtered list)
   ✓ Still tracked internally (not deleted)

2. User edits patch, signature of target changes
   ✓ Auto-unmute logic can check if target signature changed
   ✓ If so, unmuteDiagnostic(id) called
   ✓ diagnostic reappears in UI
```

---

## 7. PERFORMANCE & TESTING

### Performance Targets

| Component | Target | Technique |
|-----------|--------|-----------|
| Authoring validators | < 10ms per GraphCommitted | Simple checks, no traversals, no compilation |
| Runtime health snapshot processing | < 2ms | Merge + expire only; no recomputation |
| Query methods (getActiveDiagnostics, etc.) | < 1ms | In-memory map lookups, filter muted |
| UI re-render trigger | Immediate | Monotonic diagnosticsRevision counter |

### Testing Strategy

**Unit tests**: Emit events, assert diagnostic state changes
```typescript
test('compile error updates diagnostic snapshot', () => {
  const hub = new DiagnosticHub();
  const events = new EventHub();
  hub.subscribe(events);

  events.emit({
    type: 'CompileEnd',
    patchRevision: 1,
    compileId: 'compile-1',
    status: 'failure',
    diagnostics: [{ id: 'E_TYPE_MISMATCH:...', ... }]
  });

  const snapshot = hub.getCompileSnapshot(1);
  expect(snapshot).toHaveLength(1);
  expect(snapshot[0].code).toBe('E_TYPE_MISMATCH');
});
```

**Integration tests**: Full event flow (user action → compile → diagnostics → UI update)

**Performance tests**: Measure authoring validator latency; ensure no polling in UI

---

## REFERENCES

**Related Topics**:
- [12-event-hub](./12-event-hub.md) - Event architecture and emission patterns
- [07-diagnostics-system](./07-diagnostics-system.md) - Diagnostic types, codes, and UI integration
- [04-compilation](./04-compilation.md) - Where compile diagnostics originate
- [05-runtime](./05-runtime.md) - Runtime health monitoring

**Glossary**:
- [DiagnosticHub](../GLOSSARY.md#diagnostichub)
- [EventHub](../GLOSSARY.md#eventhub)
- [EditorEvent](../GLOSSARY.md#editorevent)

---

**Index Type**: Structural (T2)
**Last Updated**: 2026-01-12
**Status**: Ready for Implementation
