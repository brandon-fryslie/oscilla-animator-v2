---
parent: ../INDEX.md
topic: diagnostics-system
order: 7
---

# Diagnostics System

> Diagnostics are stable, target-addressable, typed facts about system health—resilient across graph rewrites and supporting integrated developer feedback at every layer.

**Related Topics**: [02-block-system](./02-block-system.md), [03-time-system](./03-time-system.md), [04-compilation](./04-compilation.md), [05-runtime](./05-runtime.md)
**Key Terms**: [Diagnostic](../GLOSSARY.md#diagnostic), [TargetRef](../GLOSSARY.md#targetref), [DiagnosticCode](../GLOSSARY.md#diagnosticcode)
**Relevant Invariants**: [I28](../INVARIANTS.md#i28-diagnostics-are-non-blocking), [I29](../INVARIANTS.md#i29-diagnostic-ids-are-stable)

---

## Overview

Diagnostics are the bridge between the compiler/runtime and the user. They answer:
- **What's broken?** (compile errors, topology violations)
- **What's risky?** (NaN propagation, heavy materialization)
- **What could be better?** (unused buses, missing TimeRoot, deprecated patterns)

A diagnostic is **not a console log**. It is a **structured, addressable, stable fact** with:
- **Identity**: Same root cause produces the same ID
- **Target**: Points to something in the patch (block, port, bus, edge)
- **Lifecycle**: Appears, updates, resolves without clearing unrelated diagnostics
- **Actions**: Can suggest fixes or provide UI guidance

---

## Three Diagnostic Streams

Every diagnostic belongs to one of three streams with different characteristics:

### Compile Diagnostics

**Produced by**: Type checking, topology validation, graph validation, cycle detection, composite resolution

**Characteristics**:
- Deterministic and reproducible
- Stable per patch version
- Complete snapshot per compilation

**Examples**:
- `E_TIME_ROOT_MISSING`: Patch has no TimeRoot block
- `E_TYPE_MISMATCH`: Port types cannot unify
- `E_CYCLE_DETECTED`: Graph contains unbroken cycle
- `W_BUS_EMPTY`: Bus has publishers but no listeners

### Runtime Diagnostics

**Produced by**: NaN/Infinity detection, performance monitoring, execution anomalies

**Characteristics**:
- Time-windowed (typically 10 seconds or last N samples)
- Potentially transient (may resolve on next frame)
- Aggregated to avoid spam (occurrence counts)

**Examples**:
- `P_NAN_DETECTED`: Value became NaN during evaluation
- `P_FRAME_BUDGET_EXCEEDED`: Frame took longer than budget
- `P_FIELD_MATERIALIZATION_HEAVY`: Domain materialized too many elements

### Authoring Diagnostics

**Produced by**: Graph validation passes after user edits

**Characteristics**:
- Fast (synchronous, no compilation)
- Immediate feedback (available while editing)
- Usually dismissible (hints, not errors)

**Examples**:
- `I_SILENT_VALUE_USED`: Unconnected input using default
- `W_GRAPH_DISCONNECTED_BLOCK`: Block has no path to TimeRoot
- `I_REDUCE_REQUIRED`: Binding requires destructive domain reduction

---

## Architecture

### Event-Driven Model

```
┌─────────────────────────────────────────────────────────────┐
│                        PRODUCERS                             │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │  Compiler    │  │   Runtime    │  │      Authoring     │ │
│  │  Validators  │  │   Monitors   │  │      Validators    │ │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬──────────┘ │
└─────────┼────────────────┼────────────────────┼─────────────┘
          │                │                    │
          ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                      EVENT HUB                               │
│  • GraphCommitted      • CompileBegin                     │
│  • CompileEnd     • ProgramSwapped                     │
│  • RuntimeHealthSnapshot                                     │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    DIAGNOSTIC HUB                            │
│  • Dedupes by ID                                             │
│  • Updates counts + lastSeen                                │
│  • Applies throttling (runtime)                             │
│  • Holds current active set                                 │
│  • Supports scopes (compile/runtime/authoring)              │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                   DIAGNOSTIC STORE                           │
│  MobX reactive wrapper for UI components                     │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      UI CONSUMERS                            │
│  • Diagnostic Console    • Block Inspector badges           │
│  • Bus Board warnings    • Time Console indicators           │
│  • Patch Health summary                                      │
└─────────────────────────────────────────────────────────────┘
```

**Key Distinction**:
- **EventHub**: What happened (stateless stream of facts)
- **DiagnosticHub**: What's currently true/risky/broken (stateful model with lifecycle)

Diagnostics have deduplication, aggregation, and muting; events do not.

---

## Core Events (Five-Event Spine)

Five events drive the entire diagnostic system:

### 1. GraphCommitted

Emitted exactly once after any user operation changes the patch graph.

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
  affectedBlockIds?: string[];  // Best-effort
  affectedBusIds?: string[];
}
```

**Diagnostic Role**: Signals authoring validators to recompute immediately for fast feedback.

### 2. CompileBegin

Emitted when compilation begins.

```typescript
interface CompileBeginEvent {
  type: 'CompileBegin';
  compileId: string;      // UUID for this compile pass
  patchId: string;
  patchRevision: number;
  trigger: 'graphCommitted' | 'manual' | 'startup' | 'hotReload';
}
```

**Diagnostic Role**: Marks compile diagnostics for that revision as "pending".

### 3. CompileEnd

Emitted when compilation completes (success OR failure).

```typescript
interface CompileEndEvent {
  type: 'CompileEnd';
  compileId: string;
  patchId: string;
  patchRevision: number;
  status: 'success' | 'failure';
  durationMs: number;
  diagnostics: Diagnostic[];  // Authoritative snapshot
  programMeta?: {
    timelineHint: 'infinite';
    busUsageSummary?: Record<string, { publishers: number; listeners: number }>;
  };
}
```

**Diagnostic Role**: **Replaces** all compile diagnostics for that revision. Not incremental; a complete snapshot.

### 4. ProgramSwapped

Emitted when the runtime begins executing a newly compiled program.

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

**Diagnostic Role**: Sets the "active revision" pointer for runtime diagnostics.

### 5. RuntimeHealthSnapshot

Emitted at low frequency (2–5 Hz), **not per frame**.

```typescript
interface RuntimeHealthSnapshotEvent {
  type: 'RuntimeHealthSnapshot';
  patchId: string;
  activePatchRevision: number;
  tMs: number;                    // Current runtime time
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
    resolved: string[];  // Diagnostic IDs
  };
}
```

**Diagnostic Role**: Updates runtime diagnostics without spamming the event hub.

---

## Diagnostic Types & Schema

### TargetRef (Discriminated Union)

Every diagnostic must point at something users can click to navigate or act upon.

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

**Why discriminated union**: Makes it impossible to create invalid targets. Each kind defines exactly which fields are present.

### Severity Levels

```typescript
type Severity = 'hint' | 'info' | 'warn' | 'error' | 'fatal';
```

| Level | Meaning | Example |
|-------|---------|---------|
| `fatal` | Patch cannot run | No TimeRoot, compiler failure |
| `error` | Program won't compile or is meaningless | Type mismatch, broken cycle |
| `warn` | Program runs but user should know | Bus has no listeners, NaN detected |
| `info` | Guidance and context | Port using silent value |
| `hint` | Improvement suggestion (dismissible) | Deprecated pattern |

### Domain Classification

```typescript
type Domain = 'authoring' | 'compile' | 'runtime' | 'perf';
```

Indicates which subsystem produced the diagnostic.

### Full Diagnostic Interface

```typescript
interface Diagnostic {
  // Identity: stable across graph rewrites
  id: string;  // hash(code + primaryTarget + signature + patchRevision)

  // Classification
  code: DiagnosticCode;
  severity: Severity;
  domain: Domain;

  // Location: what does this affect?
  primaryTarget: TargetRef;
  affectedTargets?: TargetRef[];  // Related targets (both ends of mismatch, cycle members)

  // Content
  title: string;                  // Short summary ("Type Mismatch")
  message: string;                // Full explanation
  payload?: DiagnosticPayload;    // Optional structured data

  // Actions: what can the user do?
  actions?: DiagnosticAction[];
  quickFixId?: string;            // Optional: recommended primary action

  // Scope: where/when does this apply?
  scope: {
    patchRevision: number;        // Which patch version this applies to
    compileId?: string;           // For compile-only diagnostics
    runtimeSessionId?: string;    // For runtime-only diagnostics
    exportTarget?: 'svg' | 'video' | 'server';  // For export-specific diagnostics
  };

  // Lifecycle
  metadata: {
    firstSeenAt: number;          // Timestamp when first observed
    lastSeenAt: number;           // Last time this exact diagnostic occurred
    occurrenceCount: number;      // How many times seen (for runtime diagnostics)
  };
}
```

### Stable ID Generation

```typescript
function generateDiagnosticId(
  code: DiagnosticCode,
  primaryTarget: TargetRef,
  patchRevision: number,
  signature?: string
): string {
  const targetStr = serializeTargetRef(primaryTarget);
  const base = `${code}:${targetStr}:rev${patchRevision}`;
  return signature ? `${base}:${signature}` : base;
}
```

**Critical rule**: ID is derived from:
- `code` - Diagnostic type
- `primaryTarget` - Serialized target reference
- `patchRevision` - Which patch version this applies to (same error in different patch is different diagnostic)
- `signature` - Optional key data fields defining the condition

**Not included in ID** (goes in metadata):
- Timestamps
- Occurrence counts
- Frame counts
- Current time t
- Dynamic data

This ensures same root cause in same patch → same ID → dedupe works.

**Why patchRevision is included**: If a patch is edited and the same error re-appears, that's a NEW diagnostic instance (user wants to see it again). Different patches, different diagnostics—even if the root cause is identical.

### Diagnostic Actions

```typescript
type DiagnosticAction =
  | { kind: 'goToTarget'; target: TargetRef }
  | { kind: 'insertBlock'; blockType: string; position?: 'before' | 'after'; nearBlockId?: string }
  | { kind: 'removeBlock'; blockId: string }
  | { kind: 'addAdapter'; fromPort: PortTargetRef; adapterType: string }
  | { kind: 'createTimeRoot'; timeRootKind: 'Infinite' }
  | { kind: 'muteDiagnostic'; diagnosticId: string }
  | { kind: 'openDocs'; docUrl: string };
```

Actions are:
- Serializable (can be sent over network)
- Replayable (user/code can execute them)
- Safe (all references are by ID, not mutable objects)

### DiagnosticPayload

Optional structured data for specific diagnostic types:

```typescript
type DiagnosticPayload =
  | { kind: 'typeMismatch'; expected: SignalType; actual: SignalType; suggestedAdapters?: string[] }
  | { kind: 'cycle'; memberBlockIds: string[] }
  | { kind: 'busMetrics'; publishers: number; listeners: number; defaultValue?: unknown }
  | { kind: 'performance'; threshold: number; actual: number; blockId?: string }
  | { kind: 'domainMismatch'; expectedDomain: string; actualDomain: string };
```

---

## DiagnosticHub: State Management

Central hub managing diagnostic state with snapshot semantics.

### State Organization

```typescript
class DiagnosticHub {
  // Compile diagnostics: snapshot per patchRevision
  private compileSnapshots = new Map<number, Diagnostic[]>();

  // Authoring diagnostics: recomputed on each GraphCommitted
  private authoringSnapshot: Diagnostic[] = [];

  // Runtime diagnostics: aggregated window (e.g., last 10 seconds)
  private runtimeDiagnostics: Map<string, Diagnostic> = new Map();

  // Which patchRevision is currently active in runtime
  private activeRevision: number = 0;

  // Which patchRevision is currently compiling
  private pendingCompileRevision: number | null = null;

  // User mute state (per diagnostic ID, per patch)
  private mutedDiagnostics: Set<string> = new Set();
}
```

### Event Subscription Contract

| Event | Handler |
|-------|---------|
| `GraphCommitted` | Run authoring validators, update authoring snapshot |
| `CompileBegin` | Mark revision as "pending" |
| `CompileEnd` | **Replace** compile snapshot (complete replacement) |
| `ProgramSwapped` | Set active revision pointer |
| `RuntimeHealthSnapshot` | Update/merge runtime diagnostics |

### Query Methods

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

// Is compilation pending?
isCompilePending(): boolean
getPendingRevision(): number | null
getActiveRevision(): number
```

---

## Diagnostic Codes (30+ Codes)

Canonical diagnostic codes organized by domain and severity:

### Time & Topology (E_ = Error)

| Code | Severity | Message |
|------|----------|---------|
| `E_TIME_ROOT_MISSING` | error | Patch has no TimeRoot block |
| `E_TIME_ROOT_MULTIPLE` | error | Patch has multiple TimeRoot blocks |
| `E_TIME_ROOT_INVALID_TOPOLOGY` | error | TimeRoot cannot feed from other blocks |

### Type System (E_ = Error)

| Code | Severity | Message |
|------|----------|---------|
| `E_TYPE_MISMATCH` | error | Port types cannot unify |
| `E_DOMAIN_MISMATCH` | error | Domain cardinalities conflict |
| `E_CARDINALITY_MISMATCH` | error | Cardinality bounds incompatible |

### Graph Structure (E_/W_)

| Code | Severity | Message |
|------|----------|---------|
| `E_CYCLE_DETECTED` | error | Cycle has no stateful boundary |
| `E_MISSING_INPUT` | error | Required input not connected |
| `E_INVALID_CONNECTION` | error | Edge violates topology rules |

### Bus Operations (W_ = Warning)

| Code | Severity | Message |
|------|----------|---------|
| `W_BUS_EMPTY` | warn | Bus has publishers but no listeners |
| `W_BUS_NO_PUBLISHERS` | warn | Bus has no publishers (uses silent value) |
| `W_BUS_COMBINE_CONFLICT` | warn | Publishers use incompatible combine modes |

### Graph Quality (W_)

| Code | Severity | Message |
|------|----------|---------|
| `W_GRAPH_UNUSED_OUTPUT` | warn | Block output not connected or published |
| `W_GRAPH_DISCONNECTED_BLOCK` | warn | Block not reachable from TimeRoot |
| `W_GRAPH_DEAD_CHANNEL` | warn | Edge is unreachable code |

### Authoring Hints (I_)

| Code | Severity | Message |
|------|----------|---------|
| `I_REDUCE_REQUIRED` | info | Binding requires destructive domain reduce |
| `I_SILENT_VALUE_USED` | info | Unconnected input using default/silent value |
| `I_DEPRECATED_PRIMITIVE` | info | Block uses deprecated pattern |

### Performance (P_)

| Code | Severity | Message |
|------|----------|---------|
| `P_FIELD_MATERIALIZATION_HEAVY` | warn | Domain materialized > threshold elements |
| `P_FRAME_BUDGET_EXCEEDED` | warn | Frame eval exceeded time budget |
| `P_NAN_DETECTED` | warn | NaN value produced during eval |
| `P_INFINITY_DETECTED` | warn | Infinity value produced during eval |

---

## Behavior Rules

### Rule 1: Snapshots vs Streams

- **Compile diagnostics**: Complete snapshot per compilation
  - `CompileEnd` event contains full list
  - Replaces previous snapshot entirely (not merged)
  - Scope is a single patch revision

- **Runtime diagnostics**: Accumulated with decay
  - Emitted via `RuntimeHealthSnapshot` (throttled, not per-frame)
  - Same diagnostic ID updates `occurrenceCount` + `lastSeenAt`
  - Old entries expire after time window (e.g., 10 seconds)

- **Authoring diagnostics**: Fast continuous update
  - Recomputed on `GraphCommitted`
  - No throttling (synchronous)
  - Scoped to current edit session

### Rule 2: No Spam

For runtime diagnostics specifically:

```typescript
// BAD: Emit one event per NaN occurrence
events.emit({ type: 'DiagnosticRaised', diagnostic: { code: 'P_NAN_DETECTED', ... } });

// GOOD: Aggregate and update occurrence count
hub.updateDiagnostic(id, { lastSeenAt: now(), occurrenceCount: count + 1 });
```

UI shows "P_NAN_DETECTED x237" not 237 separate entries.

### Rule 3: Diagnostics Are Not Logs

Logs are for developer debugging. Diagnostics are for users:

- **Always attached to something**: If a diagnostic has no target, it's a log entry, not a diagnostic
- **Always actionable or interpretable**: "Type mismatch at port X: expected Y, got Z"—not "oops"
- **Always deterministic where possible**: Same patch version + same runtime state = same diagnostics

### Rule 4: Muting

Mute is per-diagnostic-id and per-patch:

```typescript
// User sees "Bus empty: no listeners"
// User clicks "don't show again for this bus"
mute('W_BUS_EMPTY:bus-id-42');

// Same diagnostic for same bus won't appear
// But W_BUS_EMPTY for a different bus still appears
// If user edits the bus (adds a listener), mute is cleared
```

---

## Compiler Integration

### Error Conversion

The compiler converts `CompileError` to `Diagnostic`:

```typescript
function compileErrorToDiagnostic(
  error: CompileError,
  patchRevision: number
): Diagnostic {
  // Map compiler error type to diagnostic code + severity
  const mapping = {
    'MissingTimeRoot': { code: 'E_TIME_ROOT_MISSING', severity: 'error' },
    'MultipleTimeRoots': { code: 'E_TIME_ROOT_MULTIPLE', severity: 'error' },
    'TypeMismatch': { code: 'E_TYPE_MISMATCH', severity: 'error' },
    // ...
  };

  return createDiagnostic({
    code: mapping[error.kind].code,
    severity: mapping[error.kind].severity,
    domain: 'compile',
    primaryTarget: createTargetFromErrorLocation(error),
    title: error.title,
    message: error.message,
    payload: error.payload,
    patchRevision,
  });
}
```

### Bus Warnings

Computed after successful compilation:

```typescript
function generateBusWarnings(patch: CompiledPatch, patchRevision: number): Diagnostic[] {
  const warnings: Diagnostic[] = [];

  for (const bus of patch.buses ?? []) {
    const publishers = countPublishers(patch, bus.id);
    const listeners = countListeners(patch, bus.id);

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

  return warnings;
}
```

---

## UI Integration

### Where Diagnostics Appear

| Location | Shows | Trigger |
|----------|-------|---------|
| **Diagnostic Console** | All active diagnostics in list view | Main UI panel |
| **Block Inspector** | Diagnostics targeting selected block | Block selection |
| **Port Badges** | Inline icons (type mismatch, unbound) | Render loop |
| **Bus Board** | Aggregated badges per row | Render loop |
| **Time Console** | TimeRoot health and clock status | Specialized view |
| **Patch Health** | Summary: Clean / Warnings / Errors | Persistent header |

### Component Pattern (MobX Integration)

```tsx
import { observer } from 'mobx-react-lite';
import { useRootStore } from './hooks';

const DiagnosticsPanel = observer(() => {
  const { diagnosticStore } = useRootStore();

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

---

## Behavior Examples

### Example 1: Type Mismatch

User connects a `float` output to a `color` input.

**Compiler produces**:
```typescript
{
  id: 'E_TYPE_MISMATCH:port-b1:p2:rev42:float->color',
  code: 'E_TYPE_MISMATCH',
  severity: 'error',
  domain: 'compile',
  primaryTarget: { kind: 'port', blockId: 'b1', portId: 'p2' },
  title: 'Type Mismatch',
  message: 'Input expects color but received float',
  payload: {
    kind: 'typeMismatch',
    expected: { ... },
    actual: { ... },
    suggestedAdapters: ['HSVtoRGB', 'Grayscale']
  },
  actions: [
    { kind: 'insertBlock', blockType: 'HSVtoRGB', nearBlockId: 'b0' },
  ],
  scope: { patchRevision: 42, compileId: 'compile-xyz' },
  metadata: { firstSeenAt: 123, lastSeenAt: 123, occurrenceCount: 1 }
}
```

---

### Example 2: Empty Bus

Compile detects a bus with publishers but no subscribers.

**Diagnostic**:
```typescript
{
  id: 'W_BUS_EMPTY:bus-mybus:rev42',
  code: 'W_BUS_EMPTY',
  severity: 'warn',
  domain: 'compile',
  primaryTarget: { kind: 'bus', busId: 'mybus' },
  title: 'Bus has no listeners',
  message: 'Bus "mybus" has 2 publisher(s) but 0 listener(s)',
  payload: {
    kind: 'busMetrics',
    publishers: 2,
    listeners: 0
  },
  actions: [
    { kind: 'goToTarget', target: { kind: 'bus', busId: 'mybus' } }
  ],
  scope: { patchRevision: 42, compileId: 'compile-xyz' },
  metadata: { firstSeenAt: 200, lastSeenAt: 200, occurrenceCount: 1 }
}
```

---

### Example 3: NaN at Runtime

During evaluation, a Noise block produces NaN due to invalid parameters.

**Runtime emits** (via `RuntimeHealthSnapshot`):
```typescript
{
  id: 'P_NAN_DETECTED:block-b3:rev42',
  code: 'P_NAN_DETECTED',
  severity: 'warn',
  domain: 'perf',
  primaryTarget: { kind: 'block', blockId: 'b3' },
  title: 'NaN value detected',
  message: 'Block produced NaN during evaluation',
  scope: { patchRevision: 42, runtimeSessionId: 'session-abc' },
  metadata: {
    firstSeenAt: 5000,
    lastSeenAt: 5250,  // Updated on next sample
    occurrenceCount: 3  // Seen 3 times in window
  }
}
```

---

## Polish: Canonical Addressing & Resilience

These enhancements make diagnostics feel professional and future-proof.

### Dual Addressing (Hard + Semantic)

Every `TargetRef` optionally carries two parallel addresses:

**A) Hard address** (exact, executable):
```typescript
{ kind: 'port', blockId: 'block-123', portId: 'radius' }
```
Used for focusing selection, applying fixes, debugging exact wiring.

**B) Semantic address** (stable intent):
```typescript
{ pathRef: '/renderers/dots[instance=block-123]/inputs/radius' }
```
Used for long-lived diagnostics across graph rewrites, composite boundaries, server-to-client mapping when IDs differ.

**Resilience rule**: If `hardRef` resolves, use it. If not, try to resolve `pathRef` by searching the current graph. If both fail, display diagnostic with "target missing (stale)" instead of silently disappearing.

This prevents the worst UX: errors vanishing when things break.

### Canonical Type Formatting

Every `SignalType` must be representable as a stable string key:
- `signal:number`
- `field:vec2(point)`
- `special:renderTree`
- `scalar:duration(ms)`

This key is used for:
- Diagnostic IDs
- Suggested adapter chain lookup
- UI badges
- Serialization

**Equality policy**:
- **Compatibility** (can connect): `field:vec2(point)` and `field:vec2` are compatible
- **Equality** (same): `field:vec2(point)` and `field:vec2` are NOT equal
- **Display** (how shown): Always show the normalized type key + semantic tag

### Diagnostic Grouping

To keep diagnostics usable as patches grow:

**A) Coalesce duplicates by ID** (covered above)

**B) Group multi-target diagnostics**:
- Type mismatch: primary is receiving port, related is bus/source
- Illegal cycle: primary is bus or time root, related is SCC members

**C) Provide groupKey** for UI:
```typescript
groupKey = `${code}:${busId}` // or blockId
```
UI can collapse 20 similar warnings into one expandable group.

This prevents warning fatigue while staying strict.

### Action Determinism Contract

Every `DiagnosticAction` must be purely described, never "best effort".

**Actions must specify**:
- Exact target(s)
- Exact insertion site (for InsertBlock)
- Exact before/after binding chain (for ReplaceAdapterChain)
- Exact parameter values used
- Apply mode (immediate/onBoundary/staged)

**Actions must be**:
- Serializable (can be sent over network)
- Replayable (user/code can execute them)
- Safe (all references are by ID, not mutable objects)

This enables:
- Undo/redo for fixes
- "Apply all safe fixes"
- Server-authoritative collaborative editing later

### Style Guide (Wording)

**Titles**:
- Concrete, short, no blame, no internal jargon (unless user opted into "Expert" mode)
- Bad: "Type mismatch in binding graph edge"
- Good: "Radius expects Field but bus provides Signal"

**Summaries** always contain:
- What it affects (render/time/bus)
- What it's doing right now (silent value, clamping, failing)

**Details** always include:
- "Expected"
- "Got"
- "Where"
- "Fix options"

### Diagnostic Revision Tracking

DiagnosticHub maintains a `diagnosticsRevision` counter (monotonic):

```typescript
class DiagnosticHub {
  private diagnosticsRevision: number = 0;

  incrementRevision() {
    this.diagnosticsRevision++;
  }

  getRevision(): number {
    return this.diagnosticsRevision;
  }
}
```

Every time the active set changes meaningfully, bump it. UI subscribes and re-renders efficiently.

Enables:
- Deterministic tests ("after action X, diagnosticsRevision increments and active set matches")
- Stable multi-client updates (diffing snapshots)

---

## See Also

- [02-block-system](./02-block-system.md) - Block and edge structures that diagnostics target
- [03-time-system](./03-time-system.md) - TimeRoot validation
- [04-compilation](./04-compilation.md) - Where compile diagnostics originate
- [05-runtime](./05-runtime.md) - Slot-addressed execution and performance monitoring
- [12-event-hub](./12-event-hub.md) - Event architecture powering the diagnostic system
- [13-event-diagnostics-integration](./13-event-diagnostics-integration.md) - How events drive diagnostics
- [Glossary: Diagnostic](../GLOSSARY.md#diagnostic)
- [Invariant: I28](../INVARIANTS.md#i28-diagnostic-attribution)
- [Invariant: I29](../INVARIANTS.md#i29-error-taxonomy)
