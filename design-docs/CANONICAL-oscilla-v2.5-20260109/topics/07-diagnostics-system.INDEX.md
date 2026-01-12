---
indexed: true
source: ./07-diagnostics-system.md
source_hash: d0b6d7de0922
source_mtime: 2026-01-12T00:00:00Z
original_tokens: ~5037
index_tokens: ~1100
compression: 21.9%
index_version: 1.0
---

# Index: Diagnostics System (07-diagnostics-system.md)

## 1. Key Concepts & Definitions

### Core Definition [L7-28]
- **Diagnostics**: Stable, target-addressable, typed facts about system health
- Bridges compiler/runtime and user
- **NOT** console logs—structured, addressable, with identity and lifecycle
- Answer three questions: What's broken? What's risky? What could be better?

### Three Diagnostic Streams [L32-78]
- **Compile Diagnostics**: Type checking, topology validation, graph validation, cycle detection
  - Deterministic, reproducible, stable per patch version
  - Complete snapshot per compilation
- **Runtime Diagnostics**: NaN/Infinity detection, performance monitoring, execution anomalies
  - Time-windowed (10s), transient, aggregated to prevent spam
  - Occurrence counts rather than separate entries
- **Authoring Diagnostics**: Graph validation after user edits
  - Fast (synchronous), immediate feedback
  - Usually dismissible (hints, not errors)

### Critical Architecture [L81-131]
- **EventHub** (stateless): What happened—stream of facts
- **DiagnosticHub** (stateful): What's currently true—model with lifecycle, dedup, muting
- Distinction: Diagnostics have dedup/aggregation/muting; events do not

---

## 2. Events: Five-Event Spine [L135-250]

### The Five Events Driving Diagnostics
1. **GraphCommitted** [L139-162]: User operation changes patch graph
   - Contains: patchId, patchRevision, reason, diffSummary, affectedBlockIds, affectedBusIds
   - Signals authoring validators to recompute immediately

2. **CompileBegin** [L164-178]: Compilation starts
   - Contains: compileId, patchId, patchRevision, trigger
   - Marks compile diagnostics as "pending"

3. **CompileEnd** [L180-200]: Compilation completes (success or failure)
   - Contains: compileId, patchId, patchRevision, status, durationMs, diagnostics[], programMeta
   - **Replaces** entire compile diagnostic snapshot (not incremental)

4. **ProgramSwapped** [L202-218]: Runtime begins executing new compiled program
   - Contains: patchId, patchRevision, compileId, swapMode, swapLatencyMs, stateBridgeUsed
   - Sets "active revision" pointer for runtime diagnostics

5. **RuntimeHealthSnapshot** [L220-250]: Low-frequency health update (2–5 Hz, not per-frame)
   - Contains: patchId, activePatchRevision, tMs, frameBudget, evalStats, diagnosticsDelta
   - Updates runtime diagnostics without spamming event hub

### Event Subscription Contract [L431-437]
| Event | Handler |
|-------|---------|
| GraphCommitted | Run authoring validators, update authoring snapshot |
| CompileBegin | Mark revision as "pending" |
| CompileEnd | **Replace** compile snapshot entirely |
| ProgramSwapped | Set active revision pointer |
| RuntimeHealthSnapshot | Update/merge runtime diagnostics |

---

## 3. Diagnostic Schema & Types [L253-397]

### TargetRef Discriminated Union [L255-268]
Every diagnostic must point at something users can click:
- `{ kind: 'block'; blockId }`
- `{ kind: 'port'; blockId; portId }`
- `{ kind: 'bus'; busId }`
- `{ kind: 'binding'; bindingId; busId; blockId; direction }`
- `{ kind: 'timeRoot'; blockId }`
- `{ kind: 'graphSpan'; blockIds[]; spanKind? }`
- `{ kind: 'composite'; compositeDefId; instanceId? }`

### Severity Levels [L273-284]
| Level | Meaning |
|-------|---------|
| `fatal` | Patch cannot run |
| `error` | Program won't compile or is meaningless |
| `warn` | Program runs but user should know |
| `info` | Guidance and context |
| `hint` | Improvement suggestion (dismissible) |

### Domain Classification [L288-292]
- `authoring`: Graph validation after edits
- `compile`: Type checking, topology validation
- `runtime`: NaN/Infinity, execution anomalies
- `perf`: Performance-specific diagnostics

### Full Diagnostic Interface [L296-333]
```
id: string                          // Stable hash
code: DiagnosticCode               // Type identifier
severity: Severity                 // Level
domain: Domain                     // Producer (authoring/compile/runtime/perf)
primaryTarget: TargetRef           // Required target
affectedTargets?: TargetRef[]      // Related targets
title: string                      // Short summary
message: string                    // Full explanation
payload?: DiagnosticPayload        // Structured data
actions?: DiagnosticAction[]       // Fix suggestions
quickFixId?: string                // Recommended action
scope: {
  patchRevision: number
  compileId?: string
  runtimeSessionId?: string
  exportTarget?: 'svg'|'video'|'server'
}
metadata: {
  firstSeenAt: number
  lastSeenAt: number
  occurrenceCount: number
}
```

### Stable ID Generation [L336-366]
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

**Critical Rules**:
- ID derived from: `code` + `primaryTarget` + `patchRevision` + optional `signature`
- **NOT included**: timestamps, occurrence counts, frame counts, dynamic data (go in metadata)
- **Why patchRevision**: Same error in different patch = different diagnostic instance (user wants to see it again)

### Diagnostic Actions [L368-384]
```
- goToTarget: Navigate to target
- insertBlock: Insert block type at position
- removeBlock: Remove block
- addAdapter: Insert adapter between ports
- createTimeRoot: Create TimeRoot
- muteDiagnostic: Suppress diagnostic
- openDocs: Open documentation
```

Actions are serializable, replayable, safe (by ID, not mutable objects).

### DiagnosticPayload [L386-396]
Optional structured data for specific types:
```
- typeMismatch: expected, actual, suggestedAdapters
- cycle: memberBlockIds
- busMetrics: publishers, listeners, defaultValue
- performance: threshold, actual, blockId
- domainMismatch: expectedDomain, actualDomain
```

---

## 4. DiagnosticHub: State Management [L401-461]

### State Organization [L407-426]
```typescript
class DiagnosticHub {
  private compileSnapshots: Map<number, Diagnostic[]>      // Per patchRevision
  private authoringSnapshot: Diagnostic[]                  // Current authoring batch
  private runtimeDiagnostics: Map<string, Diagnostic>      // Aggregated window
  private activeRevision: number                           // Currently executing patch
  private pendingCompileRevision: number | null           // What's compiling
  private mutedDiagnostics: Set<string>                   // User mutes
}
```

### Query Methods [L439-461]
- `getAll(filters?)`: All diagnostics, optionally filtered
- `getByRevision(patchRevision)`: Diagnostics for specific revision
- `getActive()`: Diagnostics for active revision
- `getAuthoringSnapshot()`: Current authoring snapshot
- `getCompileSnapshot(patchRevision)`: Snapshot for specific revision
- `isCompilePending()`, `getPendingRevision()`, `getActiveRevision()`: State queries

---

## 5. Behavior Rules [L528-581]

### Rule 1: Snapshots vs Streams [L530-545]
- **Compile**: Complete snapshot per compilation (CompileEnd contains full list, replaces previous)
- **Runtime**: Accumulated with decay (updates via RuntimeHealthSnapshot, same ID updates count + lastSeen)
- **Authoring**: Fast continuous (recomputed on GraphCommitted, synchronous, no throttling)

### Rule 2: No Spam [L547-559]
- Aggregate runtime diagnostics by ID
- Display: "P_NAN_DETECTED x237" not 237 separate entries
- Update: `hub.updateDiagnostic(id, { lastSeenAt, occurrenceCount })`

### Rule 3: Diagnostics ≠ Logs [L561-567]
- Always attached to something (TargetRef required)
- Always actionable or interpretable
- Always deterministic where possible

### Rule 4: Muting [L569-581]
- Per diagnostic ID, per patch
- `mute('W_BUS_EMPTY:bus-id-42')` suppresses that specific bus
- Different bus still shows W_BUS_EMPTY
- Edit to affected element clears mute

### Rule 5: Compiler Integration [L585-643]
- CompileError → Diagnostic via mapping
- Bus warnings computed after successful compilation
- Includes error location → TargetRef conversion

### Rule 6: Resilience & Polish [L774-891]
**Dual Addressing**:
- Hard address: `{ blockId: 'block-123', portId: 'radius' }` (exact, executable)
- Semantic address: `{ pathRef: '/renderers/dots[instance=block-123]/inputs/radius' }` (stable intent)
- Try hard first, fall back to semantic resolution
- Display "target missing (stale)" instead of silent disappear

**Canonical Type Formatting**:
- `signal:number`, `field:vec2(point)`, `special:renderTree`
- Used for diagnostic IDs, adapter lookup, UI badges, serialization

**Diagnostic Grouping**:
- Coalesce duplicates by ID
- Group multi-target diagnostics (primary + related)
- Provide `groupKey` for UI collapsing
- Prevents warning fatigue while staying strict

**Action Determinism Contract**:
- Exact targets, exact insertion site, exact parameters
- Serializable, replayable, safe
- Enables undo/redo, "apply all safe fixes", server-authoritative editing

**Diagnostic Revision Tracking**:
- `DiagnosticHub.diagnosticsRevision`: monotonic counter
- Incremented when active set changes meaningfully
- UI subscribes for efficient re-render
- Enables deterministic tests and stable multi-client updates

---

## 6. Diagnostic Codes (30+) [L465-524]

### Time & Topology
- `E_TIME_ROOT_MISSING`: Patch has no TimeRoot
- `E_TIME_ROOT_MULTIPLE`: Patch has multiple TimeRoots
- `E_TIME_ROOT_INVALID_TOPOLOGY`: TimeRoot cannot feed from other blocks

### Type System
- `E_TYPE_MISMATCH`: Port types cannot unify
- `E_DOMAIN_MISMATCH`: Domain cardinalities conflict
- `E_CARDINALITY_MISMATCH`: Cardinality bounds incompatible

### Graph Structure
- `E_CYCLE_DETECTED`: Cycle has no stateful boundary
- `E_MISSING_INPUT`: Required input not connected
- `E_INVALID_CONNECTION`: Edge violates topology rules

### Bus Operations
- `W_BUS_EMPTY`: Bus has publishers but no listeners
- `W_BUS_NO_PUBLISHERS`: Bus has no publishers (uses silent value)
- `W_BUS_COMBINE_CONFLICT`: Publishers use incompatible combine modes

### Graph Quality
- `W_GRAPH_UNUSED_OUTPUT`: Block output not connected or published
- `W_GRAPH_DISCONNECTED_BLOCK`: Block not reachable from TimeRoot
- `W_GRAPH_DEAD_CHANNEL`: Edge is unreachable code

### Authoring Hints
- `I_REDUCE_REQUIRED`: Binding requires destructive domain reduce
- `I_SILENT_VALUE_USED`: Unconnected input using default/silent value
- `I_DEPRECATED_PRIMITIVE`: Block uses deprecated pattern

### Performance
- `P_FIELD_MATERIALIZATION_HEAVY`: Domain materialized > threshold elements
- `P_FRAME_BUDGET_EXCEEDED`: Frame eval exceeded time budget
- `P_NAN_DETECTED`: NaN value produced during eval
- `P_INFINITY_DETECTED`: Infinity value produced during eval

---

## 7. UI Integration & Examples [L648-770]

### Where Diagnostics Appear [L650-659]
| Location | Shows | Trigger |
|----------|-------|---------|
| Diagnostic Console | All active diagnostics in list view | Main UI panel |
| Block Inspector | Diagnostics for selected block | Block selection |
| Port Badges | Inline icons (type mismatch, unbound) | Render loop |
| Bus Board | Aggregated badges per row | Render loop |
| Time Console | TimeRoot health and clock status | Specialized view |
| Patch Health | Summary: Clean/Warnings/Errors | Header |

### MobX Component Pattern [L662-683]
```tsx
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

### Example 1: Type Mismatch [L689-716]
- User connects `float` output to `color` input
- ID: `E_TYPE_MISMATCH:port-b1:p2:rev42:float->color`
- Payload: expected/actual types + suggested adapters
- Actions: insertBlock (HSVtoRGB)

### Example 2: Empty Bus [L719-745]
- Compile detects bus with publishers, no listeners
- ID: `W_BUS_EMPTY:bus-mybus:rev42`
- Payload: { publishers: 2, listeners: 0 }
- Actions: goToTarget bus

### Example 3: NaN at Runtime [L748-770]
- Noise block produces NaN
- ID: `P_NAN_DETECTED:block-b3:rev42`
- Domain: `perf`
- Metadata: firstSeen, lastSeen, occurrenceCount (updated on samples)

---

## Related Topics & References
- [02-block-system](./02-block-system.md): Block/edge/port structures that diagnostics target
- [03-time-system](./03-time-system.md): TimeRoot validation
- [04-compilation](./04-compilation.md): Compile diagnostic origin
- [05-runtime](./05-runtime.md): Performance monitoring, slot-addressed execution
- [12-event-hub](./12-event-hub.md): Event architecture
- [13-event-diagnostics-integration](./13-event-diagnostics-integration.md): Event-diagnostic coupling
- [Invariants: I28, I29](../INVARIANTS.md): Diagnostic invariants
- [Glossary](../GLOSSARY.md): Diagnostic, TargetRef, DiagnosticCode

---

## Tier Classification
- **Tier**: T2 (Structural)
- **Rationale**: Provides foundational observability and developer feedback across compile/runtime/authoring domains. Structural component supporting system health reporting and user communication, but not foundational to core compilation or execution.
