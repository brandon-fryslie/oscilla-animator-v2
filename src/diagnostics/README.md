# Diagnostics System Architecture

The Diagnostics System provides structured, stable, and actionable feedback about patch health across three streams: compile-time errors, authoring hints, and runtime warnings.

## Overview

The diagnostics system is built on an **event-driven architecture** that coordinates between the compiler, runtime, and UI through a central EventHub and DiagnosticHub.

```
┌─────────────────────────────────────────────────────────┐
│                      PRODUCERS                          │
│  ┌──────────┐  ┌─────────┐  ┌──────────────────────┐   │
│  │ Compiler │  │ Runtime │  │ Authoring Validators │   │
│  └────┬─────┘  └────┬────┘  └─────────┬────────────┘   │
└───────┼─────────────┼─────────────────┼────────────────┘
        │             │                 │
        ▼             ▼                 ▼
┌─────────────────────────────────────────────────────────┐
│                    EVENT HUB                            │
│  GraphCommitted • CompileBegin • CompileEnd             │
│  ProgramSwapped • RuntimeHealthSnapshot                 │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                 DIAGNOSTIC HUB                          │
│  • Maintains compile/authoring/runtime snapshots        │
│  • Deduplicates by stable ID                            │
│  • Exposes MobX-reactive queries                        │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                 UI COMPONENTS                           │
│  DiagnosticConsole • Block badges • Port indicators     │
└─────────────────────────────────────────────────────────┘
```

## Core Components

### EventHub (`src/events/EventHub.ts`)

**Purpose**: Type-safe, synchronous event bus for coordinating subsystems.

**Key Features**:
- **Type safety**: `on<T>()` narrows event type using TypeScript generics
- **Synchronous execution**: All listeners execute before `emit()` returns
- **Exception isolation**: Error in one listener doesn't prevent others from running
- **One per RootStore**: Each patch gets its own EventHub (not a global singleton)

**API**:
```typescript
// Type-safe subscription
const unsubscribe = events.on('CompileEnd', (event) => {
  // TypeScript knows event has status, durationMs, diagnostics
  console.log(`Compilation ${event.status} in ${event.durationMs}ms`);
});

// Emit event
events.emit({
  type: 'CompileEnd',
  compileId: 'compile-123',
  patchId: 'patch-0',
  patchRevision: 42,
  status: 'success',
  durationMs: 150,
  diagnostics: [],
});
```

**Events** (`src/events/types.ts`):
1. **GraphCommitted** - Patch graph changed (user edit, undo/redo)
2. **CompileBegin** - Compilation started
3. **CompileEnd** - Compilation finished (success or failure)
4. **ProgramSwapped** - Runtime adopted new compiled program
5. **RuntimeHealthSnapshot** - Periodic performance/health metrics (2-5 Hz)

---

### DiagnosticHub (`src/diagnostics/DiagnosticHub.ts`)

**Purpose**: Central state manager for all diagnostics, maintaining separate snapshots per stream.

**Snapshot Model**:
- **Compile diagnostics**: Complete snapshot per `patchRevision` (replaced on each CompileEnd)
- **Authoring diagnostics**: Single snapshot, recomputed on each GraphCommitted
- **Runtime diagnostics**: Aggregated over time window (merged, not replaced)

**Five-Event Subscription Contract**:

| Event | Action |
|-------|--------|
| `GraphCommitted` | Run authoring validators, replace authoring snapshot |
| `CompileBegin` | Mark revision as "pending compile" |
| `CompileEnd` | **Replace** compile snapshot for that revision (not merge) |
| `ProgramSwapped` | Update active revision pointer |
| `RuntimeHealthSnapshot` | Merge runtime diagnostics (update counts) |

**Key Methods**:
```typescript
// Get all diagnostics for currently active patch revision
getActive(): Diagnostic[]

// Get diagnostics for specific revision
getByRevision(rev: number): Diagnostic[]

// Get compile snapshot for revision
getCompileSnapshot(rev: number): Diagnostic[] | undefined

// Get authoring snapshot (latest validation results)
getAuthoringSnapshot(): Diagnostic[]

// Which revision is currently running in runtime
getActiveRevision(): number

// Monotonic counter for MobX reactivity
getDiagnosticsRevision(): number
```

**Reactivity**: `incrementRevision()` bumps `diagnosticsRevision`, triggering MobX recomputation in `DiagnosticsStore`.

---

### Diagnostic Structure (`src/diagnostics/types.ts`)

Every diagnostic is a structured, addressable fact with:

**Identity**:
```typescript
interface Diagnostic {
  id: string; // Stable: "CODE:targetStr:revN"
  code: DiagnosticCode; // E.g., E_TYPE_MISMATCH
  severity: 'hint' | 'info' | 'warn' | 'error' | 'fatal';
  domain: 'authoring' | 'compile' | 'runtime' | 'perf';
}
```

**Location**:
```typescript
interface Diagnostic {
  primaryTarget: TargetRef; // What this affects
  affectedTargets?: TargetRef[]; // Related targets
}
```

**Content**:
```typescript
interface Diagnostic {
  title: string; // "Type Mismatch"
  message: string; // "Port expects color but received float"
  payload?: DiagnosticPayload; // Optional structured data
}
```

**Scope**:
```typescript
interface Diagnostic {
  scope: {
    patchRevision: number; // Which patch version
    compileId?: string; // For compile-only diagnostics
    runtimeSessionId?: string; // For runtime-only diagnostics
  };
}
```

**Lifecycle**:
```typescript
interface Diagnostic {
  metadata: {
    firstSeenAt: number; // Timestamp
    lastSeenAt: number; // Updated on each occurrence
    occurrenceCount: number; // How many times seen
  };
}
```

---

### TargetRef (`src/diagnostics/types.ts`)

Discriminated union addressing any graph element:

```typescript
type TargetRef =
  | { kind: 'block'; blockId: string }
  | { kind: 'port'; blockId: string; portId: string }
  | { kind: 'bus'; busId: string }
  | { kind: 'binding'; bindingId: string; busId: string; blockId: string; direction: 'publish' | 'subscribe' }
  | { kind: 'timeRoot'; blockId: string }
  | { kind: 'graphSpan'; blockIds: string[]; spanKind?: 'cycle' | 'island' | 'subgraph' }
  | { kind: 'composite'; compositeDefId: string; instanceId?: string };
```

**Type Safety**: Exhaustive switch statements enforced by TypeScript with `never` check.

---

### Stable Diagnostic IDs (`src/diagnostics/diagnosticId.ts`)

**Format**: `CODE:targetStr:revN[:signature]`

**Example**: `E_TYPE_MISMATCH:port-b1:p2:rev42`

**Determinism**: Same (code, target, patchRevision) → same ID. Enables:
- Deduplication (same error doesn't appear twice)
- Occurrence counting (update metadata instead of creating new diagnostic)
- UI stability (diagnostic component keys don't churn)

**Critical**: `patchRevision` is included so same error in different patch version → different diagnostic ID. User wants to see it again after editing.

---

## Data Flow

### 1. User Edits Patch

```
User adds block
  ↓
PatchStore.addBlock() mutation
  ↓
MobX reaction in RootStore detects change
  ↓
EventHub.emit(GraphCommitted)
  ↓
DiagnosticHub receives event
  ↓
runAuthoringValidators() executes (<10ms)
  ↓
DiagnosticHub.authoringSnapshot updated
  ↓
DiagnosticHub.incrementRevision()
  ↓
DiagnosticsStore.revision computed updates
  ↓
MobX triggers DiagnosticConsole re-render
  ↓
UI shows updated diagnostics
```

### 2. Compilation

```
User triggers compile
  ↓
compile() function called
  ↓
EventHub.emit(CompileBegin)
  ↓
Compilation runs (type check, topology validation, lowering)
  ↓
Errors collected and converted to Diagnostics
  ↓
EventHub.emit(CompileEnd) with diagnostics payload
  ↓
DiagnosticHub receives CompileEnd
  ↓
DiagnosticHub.compileSnapshots.set(revision, diagnostics)
  ↓
Previous compile diagnostics for that revision are REPLACED
  ↓
DiagnosticHub.incrementRevision()
  ↓
UI updates with compilation errors
```

### 3. Runtime Health (Sprint 2+)

```
Runtime evaluates patch
  ↓
NaN/Infinity detected, performance measured
  ↓
EventHub.emit(RuntimeHealthSnapshot) every ~200ms
  ↓
DiagnosticHub receives snapshot
  ↓
Runtime diagnostics MERGED (not replaced)
  ↓
Occurrence counts incremented for existing diagnostics
  ↓
Old diagnostics expired after time window
  ↓
UI shows aggregated runtime warnings
```

---

## Authoring Validators (`src/diagnostics/validators/authoringValidators.ts`)

**Purpose**: Fast, synchronous checks providing immediate feedback during editing.

**Performance Budget**: <10ms for 50-block patch, <50ms for 200-block patch

**Current Validators**:
1. **TimeRoot validation**: Missing, multiple, or exactly one TimeRoot
   - Produces: `E_TIME_ROOT_MISSING` or `E_TIME_ROOT_MULTIPLE`

**Future Validators** (Sprint 2+):
2. Disconnected blocks (no path to TimeRoot) → `W_GRAPH_DISCONNECTED_BLOCK`
3. Unused outputs → `W_GRAPH_UNUSED_OUTPUT`
4. Unbound inputs using silent values → `I_SILENT_VALUE_USED`

**Execution**: Triggered on every `GraphCommitted` event, before compilation.

---

## Compiler Integration (`src/compiler/diagnosticConversion.ts`)

**Error Mapping**:

| CompileError.code | DiagnosticCode | Severity |
|-------------------|----------------|----------|
| `TypeMismatch` | `E_TYPE_MISMATCH` | error |
| `PortTypeMismatch` | `E_TYPE_MISMATCH` | error |
| `UnconnectedInput` | `E_MISSING_INPUT` | error |
| `Cycle` | `E_CYCLE_DETECTED` | error |
| `UnknownBlockType` | `E_UNKNOWN_BLOCK_TYPE` | error |
| `NoTimeRoot` | `E_TIME_ROOT_MISSING` | error |
| `MultipleTimeRoots` | `E_TIME_ROOT_MULTIPLE` | error |

**Process**:
1. Compiler collects `CompileError[]` during validation passes
2. Each error converted to `Diagnostic` with stable ID
3. Target extracted from error's `where` field
4. All diagnostics included in `CompileEnd` event payload

---

## MobX Integration (`src/stores/DiagnosticsStore.ts`)

**Pattern**: Wrap DiagnosticHub with MobX observables for UI reactivity.

```typescript
class DiagnosticsStore {
  constructor(private hub: DiagnosticHub) {
    makeObservable(this, {
      revision: computed,
      activeDiagnostics: computed,
      errorCount: computed,
      warningCount: computed,
    });
  }

  // Forces MobX dependency on hub's revision counter
  get revision(): number {
    return this.hub.getDiagnosticsRevision();
  }

  // Recomputed when revision changes
  get activeDiagnostics(): Diagnostic[] {
    this.revision; // Track dependency
    return this.hub.getActive();
  }
}
```

**UI Components**: Use `observer()` wrapper and access computed properties.

```typescript
const DiagnosticConsole = observer(() => {
  const { diagnostics } = useRootStore();

  return (
    <div>
      <h3>Diagnostics ({diagnostics.activeDiagnostics.length})</h3>
      {diagnostics.activeDiagnostics.map(d => (
        <DiagnosticRow key={d.id} diagnostic={d} />
      ))}
    </div>
  );
});
```

---

## Diagnostic Codes (Sprint 1)

### Time & Topology Errors
- `E_TIME_ROOT_MISSING` - Patch has no TimeRoot block
- `E_TIME_ROOT_MULTIPLE` - Patch has multiple TimeRoot blocks

### Type System Errors
- `E_TYPE_MISMATCH` - Port types cannot unify
- `E_DOMAIN_MISMATCH` - Domain cardinalities conflict

### Graph Structure Errors
- `E_CYCLE_DETECTED` - Cycle has no stateful boundary
- `E_MISSING_INPUT` - Required input not connected
- `E_UNKNOWN_BLOCK_TYPE` - Block type not recognized

### Graph Quality Warnings
- `W_GRAPH_DISCONNECTED_BLOCK` - Block not reachable from TimeRoot
- `W_GRAPH_UNUSED_OUTPUT` - Block output not connected

### Authoring Hints
- `I_SILENT_VALUE_USED` - Unconnected input using default

**30+ more codes planned for Sprint 2+** (bus warnings, performance, etc.)

---

## Key Design Principles

### 1. Snapshot Semantics

**Compile diagnostics** are **replaced** on each CompileEnd:
- Old compile errors disappear if not in new snapshot
- User sees current state, not accumulated history
- Each patchRevision has independent compile snapshot

**Authoring diagnostics** are **replaced** on each GraphCommitted:
- Fast, synchronous validation runs on every edit
- No merge or accumulation

**Runtime diagnostics** are **merged** with time-based expiry:
- Same diagnostic ID updates occurrence count
- Old diagnostics expire after window (configurable)
- Prevents spam from per-frame emissions

### 2. Stable IDs Enable Deduplication

Without stable IDs:
- Same error appears multiple times
- UI keys churn on every update
- Can't track occurrence count

With stable IDs:
- `DiagnosticHub.getActive()` deduplicates by ID
- UI components stable (React key doesn't change)
- Metadata accumulates (firstSeen, lastSeen, count)

### 3. Event-Driven Decoupling

**Before**:
- Compiler directly mutates global diagnostics array
- Runtime directly pushes warnings to UI
- Tight coupling, hard to test

**After**:
- Compiler emits `CompileEnd` event with diagnostics
- Runtime emits `RuntimeHealthSnapshot` event
- DiagnosticHub subscribes and manages state
- UI reads from DiagnosticHub via MobX
- Clean separation of concerns

### 4. Type Safety Over Flexibility

- TargetRef is discriminated union (not string + free-form object)
- DiagnosticCode is closed enum (not arbitrary strings)
- EditorEvent is discriminated union (not `{ type: string; data: any }`)
- TypeScript enforces exhaustiveness in switch statements

---

## Testing Strategy

### Unit Tests
- **diagnosticId.test.ts**: ID generation, determinism, serialization
- **EventHub.test.ts**: Emit, subscribe, exception isolation, type narrowing
- **DiagnosticHub.test.ts**: Snapshot replacement, query methods, five-event contract
- **authoringValidators.test.ts**: TimeRoot validation, performance (<10ms)

### Integration Tests
- **diagnostics-integration.test.ts**: End-to-end flow (add block → compile → UI)
- Verify GraphCommitted emission on PatchStore mutation
- Verify authoring validators trigger on GraphCommitted
- Verify compile diagnostics appear after CompileEnd

### Performance Tests
- Authoring validators: <10ms for 50-block patch, <50ms for 200-block patch
- EventHub overhead: <1ms per event emission
- Diagnostic ID generation: <0.1ms per ID

---

## Roadmap

### Sprint 1 (Complete) ✅
- Core types (TargetRef, Diagnostic, DiagnosticCode)
- EventHub with 5 core events
- DiagnosticHub with compile/authoring snapshots
- Compiler integration (CompileBegin/CompileEnd)
- Authoring validators (TimeRoot checks)
- DiagnosticConsole UI

### Sprint 2 (Planned)
- Runtime diagnostics (NaN/Infinity detection)
- Performance monitoring (frame budget, materialization)
- Bus warnings (empty buses, no publishers)
- Diagnostic actions (quick fixes)
- UI badges (blocks, ports, buses)

### Sprint 3 (Future)
- Diagnostic grouping
- Export-specific diagnostics (SVG, video)
- Advanced UI (severity filtering, search, muting)
- Composite diagnostics (multi-level errors)

---

## See Also

- **Specification**: `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/07-diagnostics-system.md`
- **Event Hub Spec**: `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/12-event-hub.md`
- **Integration Spec**: `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/13-event-diagnostics-integration.md`
- **Implementation Context**: `.agent_planning/diagnostics-system/CONTEXT-20260110-211500.md`
