# Diagnostics System

**Oscilla Animator Diagnostic Infrastructure**

> Diagnostics are stable, target-addressable, typed facts with deterministic actions—resilient across graph rewrites and ready for future server-authoritative operation—rendered consistently via canonical target paths and canonical type keys.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Diagnostic Events (EventHub Integration)](#3-diagnostic-events-eventhub-integration)
4. [Diagnostic Types & Schema](#4-diagnostic-types--schema)
5. [DiagnosticHub](#5-diagnostichub)
6. [DiagnosticStore (MobX Reactive Layer)](#6-diagnosticstore-mobx-reactive-layer)
7. [Compiler Integration](#7-compiler-integration)
8. [Diagnostic Codes](#8-diagnostic-codes)
9. [UI Rendering](#9-ui-rendering)
10. [Implementation Status](#10-implementation-status)

---

## 1. Overview

### What "Diagnostic Event" Means in Oscilla

A diagnostic event is a **timestamped, structured record** emitted by some subsystem that asserts:

- A **condition** (error/warn/info/perf)
- A **stable identity** (for dedupe/update)
- An **attachment** to something in the model (block/bus/port/time root/composite)
- **Actionable metadata** (what to do next)

It is **not** "a message string".

### Key Properties

| Property | Description |
|----------|-------------|
| **Typed + categorical** | Compiler error vs runtime warning vs UX hint |
| **Addressable** | Points to a thing in the patch graph |
| **Stable** | Same root cause produces the same ID |
| **Updatable** | Can be "resolved" without clearing the entire log |
| **Non-blocking** | Diagnostics never control core execution |

### The Three Diagnostic Streams

| Stream | Producers | Characteristics |
|--------|-----------|-----------------|
| **Compile** | Type checking, topology validation, graph validation, composite resolution | Deterministic, reproducible, stable per patch version |
| **Runtime** | NaN/Infinity propagation, unstable evaluation, bus anomalies, performance issues | Time-windowed, potentially transient, needs throttling |
| **Authoring** | UX hints like "this bus has 0 listeners", "this port is unbound" | Gentle, dismissible, usually not "errors" |

---

## 2. Architecture

### Layered Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                        PRODUCERS                             │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  Compiler   │  │   Runtime    │  │     Authoring      │  │
│  │  Validators │  │   Monitors   │  │     Validators     │  │
│  └──────┬──────┘  └──────┬───────┘  └─────────┬──────────┘  │
└─────────┼────────────────┼────────────────────┼─────────────┘
          │                │                    │
          ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                      EVENT HUB                               │
│  GraphCommitted, CompileStarted, CompileFinished,           │
│  ProgramSwapped, RuntimeHealthSnapshot                       │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    DIAGNOSTIC HUB                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ • Dedupes by ID                                      │   │
│  │ • Updates counts + lastSeen                          │   │
│  │ • Applies throttling (runtime)                       │   │
│  │ • Applies severity policy                            │   │
│  │ • Holds current active set                           │   │
│  │ • Supports scopes (compile/runtime/authoring)        │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    DIAGNOSTIC STORE                          │
│  MobX reactive wrapper for UI components                     │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                       UI CONSUMERS                           │
│  ┌──────────┐  ┌───────────┐  ┌────────┐  ┌─────────────┐  │
│  │ Console  │  │  Inline   │  │  Bus   │  │    Time     │  │
│  │  Panel   │  │  Badges   │  │ Board  │  │   Console   │  │
│  └──────────┘  └───────────┘  └────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Relationship: Events vs Diagnostics

- **EventHub**: What happened (stateless stream)
- **DiagnosticHub**: What's currently true/risky/broken (stateful model)

Diagnostics have lifecycle and deduping; events don't.

---

## 3. Diagnostic Events (EventHub Integration)

Five events power the diagnostic system:

### 3.1 GraphCommitted

Emitted once after any user operation that changes the patch graph.

```typescript
interface GraphCommittedEvent {
  type: 'GraphCommitted';
  patchId: string;
  patchRevision: number;  // Monotonic, increments on every edit
  reason: 'userEdit' | 'macroExpand' | 'compositeSave' | 'migration' | 'import' | 'undo' | 'redo';
  diffSummary: {
    blocksAdded: number;
    blocksRemoved: number;
    busesAdded: number;
    busesRemoved: number;
    bindingsChanged: number;
    timeRootChanged: boolean;
  };
  affectedBlockIds?: string[];
  affectedBusIds?: string[];
}
```

**Diagnostic use**: Single stable "recompute point" for authoring validators.

### 3.2 CompileStarted

Emitted when compilation begins.

```typescript
interface CompileStartedEvent {
  type: 'CompileStarted';
  compileId: string;  // UUID
  patchId: string;
  patchRevision: number;
  trigger: 'graphCommitted' | 'manual' | 'startup' | 'hotReload';
}
```

**Diagnostic use**: Marks compile diagnostics "pending", shows "compiling..." badges.

### 3.3 CompileFinished

Emitted when compilation completes (success OR failure).

```typescript
interface CompileFinishedEvent {
  type: 'CompileFinished';
  compileId: string;
  patchId: string;
  patchRevision: number;
  status: 'ok' | 'failed';
  durationMs: number;
  diagnostics: Diagnostic[];  // Authoritative snapshot
  programMeta?: {
    timelineHint: 'finite' | 'cyclic' | 'infinite';

    busUsageSummary?: Record<string, { publishers: number; listeners: number }>;
  };
}
```

**Diagnostic use**: Replace compile diagnostics snapshot for that revision.

### 3.4 ProgramSwapped

Emitted when the runtime begins using a new compiled program.

```typescript
interface ProgramSwappedEvent {
  type: 'ProgramSwapped';
  patchId: string;
  patchRevision: number;
  compileId: string;
  swapMode: 'hard' | 'soft' | 'deferred';
  swapLatencyMs: number;
  stateBridgeUsed?: boolean;
}
```

**Diagnostic use**: Set "active revision" pointer for runtime diagnostics.

### 3.5 RuntimeHealthSnapshot

Emitted at low frequency (2-5 Hz), NOT per frame.

```typescript
interface RuntimeHealthSnapshotEvent {
  type: 'RuntimeHealthSnapshot';
  patchId: string;
  activePatchRevision: number;
  tMs: number;
  frameBudget: {
    fpsEstimate: number;
    avgFrameMs: number;
    worstFrameMs?: number;
  };
  evalStats: {
    fieldMaterializations: number;
    worstOffenders?: Array<{ blockId: string; count: number }>;
    allocBytesEstimate?: number;
    nanCount: number;
    infCount: number;
  };
  diagnosticsDelta?: {
    raised: Diagnostic[];
    resolved: string[];
  };
}
```

**Diagnostic use**: Update runtime diagnostics without spamming.

---

## 4. Diagnostic Types & Schema

### 4.1 TargetRef (Discriminated Union)

Every diagnostic must point at something users can click:

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

**Source**: `src/editor/diagnostics/types.ts:21-92`

### 4.2 Severity Levels

```typescript
type Severity = 'hint' | 'info' | 'warn' | 'error' | 'fatal';
```

| Level | Meaning |
|-------|---------|
| `fatal` | Patch cannot run (no TimeRoot, compiler cannot produce program) |
| `error` | Program cannot compile or will be meaningless |
| `warn` | Program runs but user should know something important |
| `info` | Guidance, not problems |
| `hint` | Suggestions for improvement (dismissible) |

### 4.3 Domain Classification

```typescript
type Domain = 'authoring' | 'compile' | 'runtime' | 'perf';
```

### 4.4 Full Diagnostic Interface

```typescript
interface Diagnostic {
  // Identity
  id: string;  // hash(code + primaryTarget + signature)

  // Classification
  code: DiagnosticCode;
  severity: Severity;
  domain: Domain;

  // Location
  primaryTarget: TargetRef;
  affectedTargets?: TargetRef[];

  // Content
  title: string;
  message: string;
  payload?: DiagnosticPayload;

  // Actions
  actions?: DiagnosticAction[];

  // Lifecycle
  metadata: {
    firstSeenAt: number;
    lastSeenAt: number;
    occurrenceCount: number;
    patchRevision: number;
  };
}
```

**Source**: `src/editor/diagnostics/types.ts:261-284`

### 4.5 Stable ID Generation

```typescript
function generateDiagnosticId(
  code: DiagnosticCode,
  primaryTarget: TargetRef,
  signature?: string
): string {
  const targetStr = serializeTargetRef(primaryTarget);
  const base = `${code}:${targetStr}`;
  return signature ? `${base}:${signature}` : base;
}
```

ID is derived from:
- **code**: Diagnostic type
- **primaryTarget**: Serialized target reference
- **signature**: Optional key data fields defining the condition

**Excluded from ID** (goes into metadata instead):
- Timestamps
- Frame counts
- Random seeds
- Current time t

### 4.6 Diagnostic Actions

```typescript
type DiagnosticAction =
  | { kind: 'goToTarget'; target: TargetRef }
  | { kind: 'insertBlock'; blockType: string; position?: 'before' | 'after'; nearBlockId?: string }
  | { kind: 'removeBlock'; blockId: string }
  | { kind: 'addAdapter'; fromPort: PortTargetRef; adapterType: string }
  | { kind: 'createTimeRoot'; timeRootKind: 'Finite' | 'Cycle' | 'Infinite' }
  | { kind: 'muteDiagnostic'; diagnosticId: string }
  | { kind: 'openDocs'; docUrl: string };
```

Actions are:
- Serializable
- Replayable
- Safe to send over network

---

## 5. DiagnosticHub

Central hub for managing diagnostic state with snapshot semantics.

### 5.1 State Organization

```typescript
class DiagnosticHub {
  // Compile diagnostics snapshots, keyed by patchRevision
  private compileSnapshots = new Map<number, Diagnostic[]>();

  // Current authoring diagnostics (fast graph validation)
  private authoringSnapshot: Diagnostic[] = [];

  // Which patchRevision is currently active in the runtime
  private activeRevision: number = 0;

  // Which patchRevision is currently being compiled
  private pendingCompileRevision: number | null = null;
}
```

**Source**: `src/editor/diagnostics/DiagnosticHub.ts:46-58`

### 5.2 Event Subscriptions

```typescript
constructor(events: EventDispatcher, patchStore: PatchStore) {
  this.unsubscribers.push(
    events.on('GraphCommitted', (event) => this.handleGraphCommitted(event)),
    events.on('CompileStarted', (event) => this.handleCompileStarted(event)),
    events.on('CompileFinished', (event) => this.handleCompileFinished(event)),
    events.on('ProgramSwapped', (event) => this.handleProgramSwapped(event))
  );
}
```

### 5.3 Event Handler Logic

| Event | Handler Action |
|-------|----------------|
| `GraphCommitted` | Run authoring validators, update authoring snapshot |
| `CompileStarted` | Mark revision as "pending" |
| `CompileFinished` | **Replace** compile snapshot (complete replacement, not merge) |
| `ProgramSwapped` | Set active revision pointer |

### 5.4 Authoring Validators

Fast, synchronous checks that provide immediate feedback:

```typescript
private runAuthoringValidators(patchRevision: number): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Validator: Check for missing TimeRoot
  const timeRootBlocks = blocks.filter(block =>
    block.type === 'FiniteTimeRoot' ||

    block.type === 'InfiniteTimeRoot'
  );

  if (timeRootBlocks.length === 0) {
    diagnostics.push(createDiagnostic({
      code: 'E_TIME_ROOT_MISSING',
      severity: 'error',
      domain: 'authoring',
      primaryTarget: { kind: 'graphSpan', blockIds: [], spanKind: 'subgraph' },
      title: 'Missing TimeRoot',
      message: 'The patch requires exactly one TimeRoot block.',
      patchRevision,
      actions: [{ kind: 'createTimeRoot', timeRootKind: 'Cycle' }],
    }));
  }

  // Validator: Disconnected blocks (island detection)
  // ...

  return diagnostics;
}
```

**Source**: `src/editor/diagnostics/DiagnosticHub.ts:134-219`

### 5.5 Query Methods

```typescript
// Get all diagnostics, optionally filtered
getAll(filters?: DiagnosticFilter): Diagnostic[]

// Get diagnostics for a specific patch revision
getByRevision(patchRevision: number): Diagnostic[]

// Get diagnostics for the currently active revision
getActive(): Diagnostic[]

// Get current authoring diagnostics snapshot
getAuthoringSnapshot(): Diagnostic[]

// Get compile diagnostics snapshot for a revision
getCompileSnapshot(patchRevision: number): Diagnostic[] | undefined

// Check if compilation is pending
isCompilePending(): boolean
getPendingRevision(): number | null
getActiveRevision(): number
```

---

## 6. DiagnosticStore (MobX Reactive Layer)

Provides reactive access to diagnostic state for React components.

### 6.1 Computed Properties

```typescript
class DiagnosticStore {
  private readonly hub: DiagnosticHub;
  private revisionCounter = 0;  // Observable trigger

  get activeDiagnostics(): Diagnostic[] { ... }
  get errorCount(): number { ... }
  get warningCount(): number { ... }
  get hintCount(): number { ... }
  get infoCount(): number { ... }
  get fatalCount(): number { ... }
  get totalCount(): number { ... }
  get hasErrors(): boolean { ... }
  get hasWarnings(): boolean { ... }
  get activeRevision(): number { ... }
}
```

**Source**: `src/editor/stores/DiagnosticStore.ts:27-134`

### 6.2 Query Methods

```typescript
// Filter by severity
getDiagnosticsBySeverity(severity: Severity): Diagnostic[]

// Get diagnostics for a specific block
getDiagnosticsForBlock(blockId: string): Diagnostic[]

// Get diagnostics for a specific bus
getDiagnosticsForBus(busId: string): Diagnostic[]
```

### 6.3 Invalidation

The store invalidates on key events:

```typescript
// In RootStore constructor:
this.events.on('CompileFinished', () => this.diagnosticStore.invalidate());
this.events.on('ProgramSwapped', () => this.diagnosticStore.invalidate());
this.events.on('GraphCommitted', () => this.diagnosticStore.invalidate());
```

---

## 7. Compiler Integration

### 7.1 Error-to-Diagnostic Conversion

The compiler converts `CompileError` to `Diagnostic`:

```typescript
function compileErrorToDiagnostic(
  error: CompileError,
  patchRevision: number
): Diagnostic {
  const codeMappings: Record<string, { code: DiagnosticCode; severity: ... }> = {
    MissingTimeRoot: { code: 'E_TIME_ROOT_MISSING', severity: 'error' },
    MultipleTimeRoots: { code: 'E_TIME_ROOT_MULTIPLE', severity: 'error' },
    PortTypeMismatch: { code: 'E_TYPE_MISMATCH', severity: 'error' },
    // ...
  };

  // Create TargetRef from error location
  // Extract payload for type mismatches
  // Return structured Diagnostic
}
```

**Source**: `src/editor/compiler/integration.ts:34-106`

### 7.2 CompileFinished Emission

```typescript
compile(): CompileResult {
  const compileId = randomUUID();

  // Emit CompileStarted
  store.events.emit({
    type: 'CompileStarted',
    compileId,
    patchId,
    patchRevision,
    trigger: 'graphCommitted',
  });

  try {
    const result = compilePatch(...);
    const diagnostics = result.errors.map(err =>
      compileErrorToDiagnostic(err, patchRevision)
    );

    // Generate bus warnings
    const busWarnings = generateBusWarnings(patch, patchRevision);

    // Emit CompileFinished
    store.events.emit({
      type: 'CompileFinished',
      compileId,
      patchId,
      patchRevision,
      status: result.ok ? 'ok' : 'failed',
      durationMs,
      diagnostics: [...diagnostics, ...busWarnings],
      programMeta: result.ok ? { ... } : undefined,
    });
  } catch (e) {
    // Always emit CompileFinished, even on exception
  }
}
```

**Source**: `src/editor/compiler/integration.ts:682-908`

### 7.3 Bus Warning Generation

```typescript
function generateBusWarnings(patch: CompilerPatch, patchRevision: number): Diagnostic[] {
  const warnings: Diagnostic[] = [];

  // W_BUS_EMPTY: Buses with publishers but no listeners
  for (const bus of patch.buses ?? []) {
    const publishers = busPublishers.get(bus.id) ?? 0;
    const listeners = busListeners.get(bus.id) ?? 0;

    if (publishers > 0 && listeners === 0) {
      warnings.push(createDiagnostic({
        code: 'W_BUS_EMPTY',
        severity: 'warn',
        domain: 'compile',
        primaryTarget: { kind: 'bus', busId: bus.id },
        title: 'Bus has no listeners',
        message: `Bus "${bus.name}" has ${publishers} publisher(s) but no listeners.`,
        patchRevision,
      }));
    }
  }

  // W_GRAPH_UNUSED_OUTPUT: Block outputs not connected or published
  // ...

  return warnings;
}
```

**Source**: `src/editor/compiler/integration.ts:988-1074`

---

## 8. Diagnostic Codes

### 8.1 Current Codes

```typescript
type DiagnosticCode =
  // Time / topology (E_ = Error)
  | 'E_TIME_ROOT_MISSING'
  | 'E_TIME_ROOT_MULTIPLE'
  | 'E_TIME_ROOT_INVALID_TOPOLOGY'

  // Type-related errors
  | 'E_TYPE_MISMATCH'
  | 'E_WORLD_MISMATCH'
  | 'E_DOMAIN_MISMATCH'

  // Graph topology errors
  | 'E_CYCLE_DETECTED'
  | 'E_MISSING_INPUT'
  | 'E_INVALID_CONNECTION'

  // Bus-related warnings (W_ = Warning)
  | 'W_BUS_EMPTY'
  | 'W_BUS_NO_PUBLISHERS'
  | 'W_BUS_COMBINE_CONFLICT'

  // Graph structure warnings
  | 'W_GRAPH_UNUSED_OUTPUT'
  | 'W_GRAPH_DISCONNECTED_BLOCK'
  | 'W_GRAPH_DEAD_CHANNEL'

  // Authoring hints (I_ = Info)
  | 'I_REDUCE_REQUIRED'
  | 'I_SILENT_VALUE_USED'
  | 'I_DEPRECATED_PRIMITIVE'

  // Performance warnings (P_ = Performance)
  | 'P_FIELD_MATERIALIZATION_HEAVY'
  | 'P_FRAME_BUDGET_EXCEEDED'
  | 'P_NAN_DETECTED'
  | 'P_INFINITY_DETECTED';
```

**Source**: `src/editor/diagnostics/types.ts:132-161`

### 8.2 Naming Convention

| Prefix | Severity | Domain |
|--------|----------|--------|
| `E_` | error or fatal | Usually compile |
| `W_` | warn | Any |
| `I_` | info or hint | Usually authoring |
| `P_` | warn | perf |

---

## 9. UI Rendering

### 9.1 Where Diagnostics Appear

| Location | What It Shows |
|----------|---------------|
| **Diagnostic Console** | All active diagnostics in a list |
| **Block Inspector** | Diagnostics targeting a selected block |
| **Port Badges** | Inline icons for port-level issues |
| **Bus Board** | Aggregated badges per bus row |
| **Time Console** | TimeRoot health status |
| **Patch Health** | One-line summary: Clean / Warnings / Errors |

### 9.2 Component Integration Pattern

```tsx
// In a React component
import { observer } from 'mobx-react-lite';
import { useRootStore } from './hooks';

const DiagnosticsPanel = observer(() => {
  const { diagnosticStore } = useRootStore();

  return (
    <div>
      <h2>Patch Health</h2>
      <p>Errors: {diagnosticStore.errorCount}</p>
      <p>Warnings: {diagnosticStore.warningCount}</p>

      {diagnosticStore.activeDiagnostics.map(diag => (
        <DiagnosticRow key={diag.id} diagnostic={diag} />
      ))}
    </div>
  );
});
```

### 9.3 Badge Indicators

- Every bus row can show: `warning:empty bus` | `error:invalid binding` | `perf:heavy materialization`
- Every port can show: bound/unbound status, lens chain, warning if destructive reduce
- Time Console: "CycleRoot healthy" | "Secondary clock conflicts"

---

## 10. Implementation Status

### 10.1 Completed

| Component | Status | Source |
|-----------|--------|--------|
| **TargetRef types** | Complete | `src/editor/diagnostics/types.ts` |
| **Diagnostic interface** | Complete | `src/editor/diagnostics/types.ts` |
| **DiagnosticCode enum** | Complete | `src/editor/diagnostics/types.ts` |
| **createDiagnostic helper** | Complete | `src/editor/diagnostics/types.ts` |
| **DiagnosticHub** | Complete | `src/editor/diagnostics/DiagnosticHub.ts` |
| **DiagnosticStore** | Complete | `src/editor/stores/DiagnosticStore.ts` |
| **Event types** | Complete | `src/editor/events/types.ts` |
| **GraphCommitted event** | Complete | Emitted by PatchStore |
| **CompileStarted/Finished events** | Complete | Emitted by integration.ts |
| **ProgramSwapped event** | Complete | Emitted by Player |
| **Compiler->Diagnostic conversion** | Complete | `src/editor/compiler/integration.ts` |
| **Authoring validators** | Partial | Missing TimeRoot, Disconnected blocks |
| **Bus warning generation** | Complete | `W_BUS_EMPTY`, `W_GRAPH_UNUSED_OUTPUT` |
| **Tests** | Complete | `DiagnosticHub.test.ts`, `DiagnosticStore.test.ts`, `diagnostic-emission.test.ts` |

### 10.2 Remaining Work

| Component | Status | Notes |
|-----------|--------|-------|
| **RuntimeHealthSnapshot event** | Not started | Needs Player integration |
| **Runtime diagnostics** | Not started | NaN, frame budget, etc. |
| **Mute/unmute functionality** | Not started | Requires TrackedDiagnostic status |
| **UI components** | Not started | Console panel, badges, etc. |
| **Action execution** | Not started | GoToTarget, InsertBlock, etc. |
| **Diagnostic Style Guide** | Not started | Consistent wording |

### 10.3 Behavior Rules

1. **Compile diagnostics replace, runtime diagnostics accumulate (with decay)**
   - Compile diagnostics are a snapshot of the current patch
   - Runtime diagnostics aggregate over a time window (e.g., last 10 seconds)

2. **No spam**
   - Same diagnostic ID updates `occurrenceCount`
   - UI shows "x237" rather than 237 lines

3. **Diagnostics are not logs**
   - Always attached to something
   - Always actionable or interpretable
   - Always deterministic where possible

4. **Mute is per-diagnostic-id and per-patch**
   - If user mutes "Empty bus uses silent value" for a given bus, don't show it again unless context changes materially

---

## References

- `src/editor/diagnostics/types.ts` - Type definitions
- `src/editor/diagnostics/DiagnosticHub.ts` - State management
- `src/editor/stores/DiagnosticStore.ts` - MobX reactive layer
- `src/editor/events/types.ts` - Event definitions
- `src/editor/compiler/integration.ts` - Compiler integration
- `src/editor/diagnostics/__tests__/DiagnosticHub.test.ts` - Hub tests
- `src/editor/stores/__tests__/DiagnosticStore.test.ts` - Store tests
- `src/editor/compiler/__tests__/diagnostic-emission.test.ts` - Emission tests
