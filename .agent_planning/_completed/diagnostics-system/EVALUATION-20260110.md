# Diagnostics System Evaluation
**Date**: 2026-01-10 21:30 UTC  
**Spec**: `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/07-diagnostics-system.md`  
**Related Specs**: 12-event-hub.md, 13-event-diagnostics-integration.md

---

## Executive Summary

The Diagnostics System is **partially implemented** with significant gaps between spec and reality:

| Component | Status | Completeness |
|-----------|--------|--------------|
| **DiagnosticsStore** | BASIC | ~20% - Only basic error/warning/log tracking, no spec structure |
| **DiagnosticHub (Event Integration)** | MISSING | 0% - No event subscription mechanism |
| **EventHub** | MISSING | 0% - No centralized event bus exists |
| **Diagnostic Codes (30+ codes)** | MISSING | 0% - Not defined anywhere |
| **TargetRef (Discriminated Union)** | MISSING | 0% - No target addressing system |
| **Compiler Integration** | PARTIAL | ~30% - CompileError exists but doesn't map to Diagnostics |
| **Runtime Diagnostics** | MISSING | 0% - No NaN/performance monitoring |
| **Authoring Validators** | MISSING | 0% - No fast synchronous validators |
| **UI Components** | MINIMAL | ~10% - LogPanel only, no diagnostic console |
| **Muting/Lifecycle** | MISSING | 0% - No diagnostic lifecycle management |

---

## Part 1: What Exists

### 1.1 DiagnosticsStore (`src/stores/DiagnosticsStore.ts`)

**Current State**:
```typescript
export interface Diagnostic {
  id: string;
  message: string;
  source?: string;
  blockId?: BlockId;
  timestamp: number;
}

export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: number;
  data?: unknown;
}
```

**Issues**:
- Store conflates diagnostics with logs (should be separate)
- No `code` field (required by spec)
- No `severity` enum (spec defines: hint/info/warn/error/fatal)
- No `domain` field (required for authoring/compile/runtime/perf)
- No `primaryTarget` or `TargetRef` (cannot address targets)
- No `title` field
- No `actions` or `quickFixId`
- No `scope` (patchRevision, compileId, runtimeSessionId)
- No `metadata` (occurrence count, firstSeenAt, lastSeenAt)
- No deduplication by ID
- No muting mechanism
- Simple counter-based `_nextId` (not stable hash-based IDs per spec)

**Current Usage**:
- `LogPanel.tsx` consumes logs
- `RootStore` creates the store but it's never wired to compilation or runtime
- No event subscribers attached

### 1.2 Compiler Error System (`src/compiler/`)

**Current State**:
```typescript
// src/compiler/types.ts
export interface CompileError {
  code: CompileErrorCode | string;
  message: string;
  where?: CompileErrorWhere;
  details?: Record<string, unknown>;
}

export type CompileErrorCode =
  | 'TypeMismatch'
  | 'PortTypeMismatch'
  | 'UnconnectedInput'
  | 'Cycle'
  | 'UnknownBlockType'
  | ...
```

**What Works**:
- Compiler already has error tracking
- `compile()` function returns `CompileResult | CompileFailure`
- Some error codes are defined

**What's Missing**:
- No conversion from `CompileError` → `Diagnostic` (spec calls this `compileErrorToDiagnostic()`)
- `CompileErrorCode` values don't match spec diagnostic codes (e.g., `TypeMismatch` vs `E_TYPE_MISMATCH`)
- No bus warning generation after successful compilation
- Errors are not wrapped in Diagnostic with full spec structure

### 1.3 Event System

**Current State**: COMPLETELY ABSENT

**What the spec requires**:
- EventHub: Typed, discriminated-union event bus
- Five core events: `GraphCommitted`, `CompileBegin`, `CompileEnd`, `ProgramSwapped`, `RuntimeHealthSnapshot`
- Each event has specific payload structure with metadata

**What exists in codebase**:
- No `EventHub` class
- No `on()` / `subscribe()` / `emit()` mechanism
- No event type definitions
- MobX reactions in stores but no centralized event coordination

**Consequence**:
- DiagnosticHub cannot subscribe to compilation/runtime events
- No way to update diagnostics when graph commits
- No way to trigger authoring validators on edits
- No snapshot management (compile vs runtime vs authoring)

### 1.4 Block and Type System (Relevant to TargetRef)

**Current State**: 
- `BlockId`, `PortId` are branded types ✓
- No `TargetRef` discriminated union (required by spec)
- No `BusId` branded type

**Missing TargetRef**:
```typescript
// SPEC REQUIRES:
type TargetRef =
  | { kind: 'block'; blockId: string }
  | { kind: 'port'; blockId: string; portId: string }
  | { kind: 'bus'; busId: string }
  | { kind: 'binding'; bindingId: string; busId: string; blockId: string; direction: 'publish' | 'subscribe' }
  | { kind: 'timeRoot'; blockId: string }
  | { kind: 'graphSpan'; blockIds: string[]; spanKind?: 'cycle' | 'island' | 'subgraph' }
  | { kind: 'composite'; compositeDefId: string; instanceId?: string };

// CURRENTLY MISSING ENTIRELY
```

---

## Part 2: What's Missing

### 2.1 Core Diagnostic Infrastructure

**Gap 1: Diagnostic Codes (30+ required)**

The spec defines 30+ codes organized by domain:

```
TIME & TOPOLOGY:
  E_TIME_ROOT_MISSING
  E_TIME_ROOT_MULTIPLE
  E_TIME_ROOT_INVALID_TOPOLOGY

TYPE SYSTEM:
  E_TYPE_MISMATCH
  E_DOMAIN_MISMATCH
  E_CARDINALITY_MISMATCH

GRAPH STRUCTURE:
  E_CYCLE_DETECTED
  E_MISSING_INPUT
  E_INVALID_CONNECTION

BUS OPERATIONS:
  W_BUS_EMPTY
  W_BUS_NO_PUBLISHERS
  W_BUS_COMBINE_CONFLICT

GRAPH QUALITY:
  W_GRAPH_UNUSED_OUTPUT
  W_GRAPH_DISCONNECTED_BLOCK
  W_GRAPH_DEAD_CHANNEL

AUTHORING HINTS:
  I_REDUCE_REQUIRED
  I_SILENT_VALUE_USED
  I_DEPRECATED_PRIMITIVE

PERFORMANCE:
  P_FIELD_MATERIALIZATION_HEAVY
  P_FRAME_BUDGET_EXCEEDED
  P_NAN_DETECTED
  P_INFINITY_DETECTED
```

**Status**: NOT DEFINED ANYWHERE  
**Impact**: UI cannot display correctly categorized diagnostics

---

**Gap 2: DiagnosticHub (State Manager)**

Spec requires:
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
  
  // Query methods
  getAll(filters?: DiagnosticFilter): Diagnostic[]
  getByRevision(patchRevision: number): Diagnostic[]
  getActive(): Diagnostic[]
  getAuthoringSnapshot(): Diagnostic[]
  getCompileSnapshot(patchRevision: number): Diagnostic[] | undefined
  isCompilePending(): boolean
  getPendingRevision(): number | null
  getActiveRevision(): number
}
```

**Status**: COMPLETELY MISSING  
**Impact**: 
- Cannot maintain separate compile/authoring/runtime diagnostic scopes
- Cannot deduplicate by ID
- Cannot implement muting
- Cannot track diagnostic lifecycle
- Cannot support multi-revision tracking for UI

---

**Gap 3: EventHub (Event Bus)**

Spec requires typed, discriminated-union event bus:

```typescript
type EditorEvent =
  | GraphCommittedEvent
  | CompileBeginEvent
  | CompileEndEvent
  | ProgramSwappedEvent
  | RuntimeHealthSnapshotEvent
  | ... (20+ other events)

class EventHub {
  on<E extends EditorEvent>(
    type: E['type'],
    handler: (event: E) => void
  ): Unsubscribe;
  
  emit<E extends EditorEvent>(event: E): void;
}
```

**Status**: COMPLETELY MISSING  
**Impact**:
- No coordination between stores
- No event-driven architecture
- DiagnosticHub cannot listen to compilation/runtime events
- Tests cannot assert on event emissions

---

**Gap 4: Stable Diagnostic ID Generation**

Spec specifies:
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

Current implementation: Simple sequential counter (`error-0`, `error-1`, etc.)  
**Impact**: 
- Deduplication doesn't work
- Cannot track same diagnostic across edits
- Muting is impossible

---

**Gap 5: Five-Event Integration Contract**

Spec requires DiagnosticHub to subscribe to exactly five events:

| Event | Action |
|-------|--------|
| `GraphCommitted` | Run authoring validators, update authoring snapshot |
| `CompileBegin` | Mark revision as "pending compile" |
| `CompileEnd` | **Replace** compile snapshot (complete replacement) |
| `ProgramSwapped` | Set active revision pointer |
| `RuntimeHealthSnapshot` | Update/merge runtime diagnostics |

**Status**: COMPLETELY MISSING  
**Impact**: 
- Authoring diagnostics never run
- Compile diagnostics never collected
- Runtime diagnostics never tracked
- No revision tracking

---

### 2.2 Authoring Validators

Spec requires fast, synchronous validators that run on `GraphCommitted`:

```typescript
// Should validate:
// - Missing TimeRoot
// - Multiple TimeRoots
// - Disconnected blocks (no path to TimeRoot)
// - Empty buses (publishers but no listeners)
// - Unbound inputs using silent values
```

**Status**: COMPLETELY MISSING  
**Current behavior**: Zero authoring feedback except console errors  
**Impact**: Users get no immediate feedback while editing

---

### 2.3 Runtime Diagnostics

Spec requires runtime to emit `RuntimeHealthSnapshot` events (2-5 Hz) containing:

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
    resolved: string[];  // Diagnostic IDs
  };
}
```

**Status**: 
- Runtime exists (`src/runtime/`) but doesn't emit these events
- No NaN/Infinity detection
- No performance monitoring
- No health snapshot emission

**Impact**: 
- No P_NAN_DETECTED diagnostics
- No P_FRAME_BUDGET_EXCEEDED diagnostics
- No field materialization warnings

---

### 2.4 UI Integration

**Current State**:
- `LogPanel.tsx` displays logs only
- No diagnostic console
- No block inspector integration
- No port badges
- No bus board warnings
- No patch health summary

**Missing Components** (per spec):
- Diagnostic Console - list view of all active diagnostics
- Block Inspector badges - diagnostics targeting selected block
- Port Badges - inline type mismatch icons
- Bus Board warnings - aggregated badges per bus row
- Time Console - TimeRoot health and clock status
- Patch Health summary - Clean / Warnings / Errors header

---

### 2.5 Compiler Integration (Error → Diagnostic Conversion)

Missing function from spec:
```typescript
function compileErrorToDiagnostic(
  error: CompileError,
  patchRevision: number
): Diagnostic {
  // Map compiler error type to diagnostic code + severity
  // Create full Diagnostic with TargetRef, actions, payload
}
```

Also missing:
```typescript
function generateBusWarnings(
  patch: CompiledPatch, 
  patchRevision: number
): Diagnostic[] {
  // After successful compilation, generate warnings for:
  // - W_BUS_EMPTY (publishers but no listeners)
  // - W_BUS_NO_PUBLISHERS (uses silent value)
  // - W_BUS_COMBINE_CONFLICT (incompatible combine modes)
}
```

---

## Part 3: Dependencies & Architecture Gaps

### 3.1 Critical Path

To implement the diagnostics system requires:

1. **EventHub first** (blocks all downstream systems)
   - Define `EditorEvent` discriminated union
   - Implement `EventHub` class with `on()` / `emit()`
   - Wire EventHub into `RootStore`

2. **TargetRef discriminated union**
   - Define all 7 kinds of targets
   - Implement `serializeTargetRef()` for stable ID generation

3. **Diagnostic Code Enumeration**
   - Define 30+ diagnostic codes
   - Organize by domain + severity

4. **DiagnosticHub**
   - Subscribe to five core events
   - Maintain compile/authoring/runtime snapshots
   - Implement muting
   - Provide query interface

5. **Compiler Integration**
   - Convert `CompileError` → `Diagnostic`
   - Generate bus warnings after compilation
   - Emit `CompileBegin` / `CompileEnd` events

6. **Authoring Validators**
   - Implement synchronous validators
   - Wire to `GraphCommitted` event
   - Run in < 10ms for typical patches

7. **Runtime Integration**
   - Add NaN/Infinity detection to evaluators
   - Track field materialization
   - Emit `RuntimeHealthSnapshot` events (2-5 Hz)
   - DiagnosticHub merges runtime diagnostic deltas

8. **UI Components**
   - Replace LogPanel with DiagnosticConsole
   - Add block inspector integration
   - Add port badges, bus board warnings, etc.

### 3.2 Architectural Coupling Points

**Current issues**:
- PatchStore doesn't emit GraphCommitted events
- Compiler doesn't emit CompileBegin/CompileEnd
- Runtime doesn't emit RuntimeHealthSnapshot
- DiagnosticsStore not connected to event flow
- No event hub for coordination

**Required changes**:
- All stores must emit/subscribe to EventHub
- Compiler must be wrapped with event emission
- Runtime must emit health snapshots
- DiagnosticsStore becomes DiagnosticHub with event handlers

---

## Part 4: Ambiguities & Open Questions

### 4.1 Diagnostic ID Stability Across Rewrites

**Question**: When a patch is edited and the same error re-occurs, should it be the same diagnostic ID?

**Spec statement** (line 366):
> "If a patch is edited and the same error re-appears, that's a NEW diagnostic instance (user wants to see it again). Different patches, different diagnostics—even if the root cause is identical."

**Ambiguity**: How is this implemented in muting? If user mutes a diagnostic and then fixes it, unmute behavior is unclear.

**Resolution needed**: 
- Should muting be per (diagnosticId, patchRevision)?
- What happens to muted diagnostics if the patch is edited?
- Should mute automatically clear when patch revision changes?

---

### 4.2 Snapshot Replacement vs Merge

**Question**: When `CompileEnd` event arrives, should compile diagnostics be replaced or merged?

**Spec statement** (lines 107-115):
> "This is a **snapshot replacement**, not incremental updates... If `CompileEnd` has 3 diagnostics, the compile snapshot for that revision is exactly those 3 diagnostics (even if the previous compile had 10)."

**Ambiguity**: What about diagnostics from the same revision if multiple compile attempts happen?

**Resolution needed**:
- If user edits quickly, patchRevision = 42 is created
- Compile starts for 42
- User edits again, patchRevision = 43
- Compile finishes for 42
- What happens to 43? Does it get compile diagnostics?
- Should there be a "pending" state in the UI?

---

### 4.3 Runtime Diagnostic Expiry Window

**Question**: The spec says "time window (e.g., 10 seconds)" but doesn't specify exact behavior.

**Spec statement** (line 540):
> "Old entries expire after time window (e.g., 10 seconds)"

**Ambiguity**: 
- Is it exactly 10 seconds or configurable?
- Should it be oldest-first or last-occurrence-first?
- What happens to occurrence count when an entry expires?
- Does expiry trigger a UI update?

**Resolution needed**: Define exact expiry semantics and configurability.

---

### 4.4 Authoring Validator Performance

**Question**: Spec says validators run in < 10ms but doesn't specify what triggers them.

**Spec statement** (line 71):
> "These run **synchronously** (no async compilation) for instant feedback. **Timing**: < 10ms for typical patches"

**Ambiguity**: 
- Do they run on every keystroke or debounced?
- What's a "typical patch" size?
- If a patch takes 20ms to validate, should we async-defer?

**Resolution needed**: 
- Define debounce strategy if any
- Define maximum patch size for synchronous validation
- Define fallback if validation is slow

---

### 4.5 Diagnostic Payload Extensibility

**Question**: The spec defines five payload kinds but doesn't specify extension strategy.

**Spec statement** (lines 391-396):
```typescript
type DiagnosticPayload =
  | { kind: 'typeMismatch'; ... }
  | { kind: 'cycle'; ... }
  | { kind: 'busMetrics'; ... }
  | { kind: 'performance'; ... }
  | { kind: 'domainMismatch'; ... };
```

**Ambiguity**: 
- What if a new diagnostic type needs different payload?
- Is this union intentionally closed?
- Should there be a generic payload fallback?

**Resolution needed**: Define payload evolution strategy.

---

### 4.6 Dual Addressing (Hard + Semantic)

**Question**: The spec mentions dual addressing but doesn't specify implementation details.

**Spec statement** (lines 778-796):
> "Every `TargetRef` optionally carries two parallel addresses: hard address (exact, executable) and semantic address (stable intent)."

**Ambiguity**:
- Is semantic address required or optional?
- How is path resolution implemented?
- What if both fail?
- Performance implications of path lookup?

**Resolution needed**: 
- Define exact TargetRef structure with optional pathRef
- Implement resilient resolution algorithm
- Test stale reference handling

---

### 4.7 Diagnostic Grouping UI Hints

**Question**: Spec mentions grouping but doesn't specify the contract.

**Spec statement** (lines 827-830):
> "Provide groupKey for UI... UI can collapse 20 similar warnings into one expandable group."

**Ambiguity**:
- What is groupKey exactly? (spec shows `${code}:${busId}`)
- Should DiagnosticHub compute it or should each diagnostic have it?
- How should UI handle grouping - collapsible groups or tabs?

**Resolution needed**: Define exact grouping contract and UI affordances.

---

### 4.8 Action Determinism

**Question**: The spec says actions must be "deterministic" but doesn't define what happens if action fails.

**Spec statement** (lines 835-849):
> "Every `DiagnosticAction` must be purely described, never 'best effort'... Actions must be serializable, replayable, safe."

**Ambiguity**:
- What if InsertBlock action is replayed but block exists?
- Should action application be idempotent?
- What's the undo/redo interaction model?

**Resolution needed**: Define action application semantics and error handling.

---

### 4.9 Muting Persistence

**Question**: Should muted diagnostics persist across sessions?

**Spec statement** (lines 569-580):
> "Mute is per-diagnostic-id and per-patch... If user edits the bus (adds a listener), mute is cleared."

**Ambiguity**: 
- Is muting stored in patch file or local preference?
- How is "edited the bus" detected?
- Should muting propagate to other instances of same patch?

**Resolution needed**: Define persistence and broadcast semantics.

---

### 4.10 Multiple Patch Instances

**Question**: How do diagnostics work with multiple patches open simultaneously?

**Spec statement** (line 73):
> "EventHub is owned by the top-level store (e.g., `EditorStore.events`), not a global singleton."

**Ambiguity**: 
- Each patch has its own DiagnosticHub?
- Should cross-patch diagnostics exist (e.g., "composite reference to deleted patch")?
- How is active revision tracked with multiple patches?

**Resolution needed**: Define multi-patch diagnostic scoping.

---

## Part 5: What Needs Changes (By File/Component)

### 5.1 Type System

**File**: `src/types/index.ts`  
**Action**: ADD
```
- TargetRef discriminated union (7 kinds)
- DiagnosticCode enum (30+ codes)
- Severity enum (hint/info/warn/error/fatal)
- Domain enum (authoring/compile/runtime/perf)
- Diagnostic interface (full spec structure)
- DiagnosticAction union type
- DiagnosticPayload union type
- serializeTargetRef() function
```

---

### 5.2 Event System

**Files**: 
- CREATE: `src/events/EventHub.ts` (NEW)
- CREATE: `src/events/EditorEvent.ts` (NEW)
- Modify: `src/stores/RootStore.ts`

**Actions**:
- Implement EventHub with typed `on<E>(type, handler)` and `emit<E>(event)`
- Define EditorEvent discriminated union with 25+ event types
- Wire EventHub into RootStore
- Ensure no event handler can mutate core state synchronously

---

### 5.3 Compiler Integration

**Files**:
- Modify: `src/compiler/compile.ts`
- Modify: `src/compiler/types.ts`
- CREATE: `src/compiler/DiagnosticConverter.ts` (NEW)

**Actions**:
- Emit `CompileBegin` event before compilation
- Emit `CompileEnd` event with Diagnostic[] after compilation
- Implement `compileErrorToDiagnostic()` conversion
- Implement `generateBusWarnings()` after successful compilation
- Wire compile() with event emissions

---

### 5.4 DiagnosticsStore → DiagnosticHub

**Files**:
- RENAME: `src/stores/DiagnosticsStore.ts` → `src/stores/DiagnosticHub.ts`
- Rewrite entirely to match spec

**Actions**:
- Separate logs from diagnostics
- Implement three snapshot maps (compile/authoring/runtime)
- Implement muting state
- Subscribe to five core events
- Implement all query methods
- Implement diagnostic ID stable generation

---

### 5.5 Runtime Integration

**Files**:
- Modify: `src/runtime/SignalEvaluator.ts` (NaN/Infinity detection)
- Modify: `src/runtime/Materializer.ts` (field materialization tracking)
- Modify: `src/runtime/ScheduleExecutor.ts` (frame budget tracking)
- CREATE: `src/runtime/HealthMonitor.ts` (NEW - emits RuntimeHealthSnapshot)

**Actions**:
- Add NaN/Infinity detection in signal evaluation
- Track field materialization counts by block
- Track frame budget (avg, worst)
- Emit RuntimeHealthSnapshot events at 2-5 Hz
- Include diagnostic deltas in health snapshot

---

### 5.6 Authoring Validators

**Files**:
- CREATE: `src/compiler/authoringValidators.ts` (NEW)
- Modify: `src/stores/DiagnosticHub.ts` (subscribe to GraphCommitted)

**Actions**:
- Implement synchronous validators for:
  - Missing/multiple TimeRoot
  - Disconnected blocks
  - Empty buses
  - Unbound inputs
- Run on GraphCommitted event
- Return authoring diagnostics < 10ms

---

### 5.7 UI Components

**Files**:
- RENAME/REWRITE: `src/ui/components/app/LogPanel.tsx` → `DiagnosticConsole.tsx`
- CREATE: `src/ui/components/DiagnosticRow.tsx` (NEW)
- CREATE: `src/ui/components/DiagnosticActions.tsx` (NEW)
- Modify: `src/ui/components/BlockInspector.tsx` (add diagnostic badges)
- Modify: `src/ui/components/TableView.tsx` (add bus board warnings)

**Actions**:
- Replace LogPanel with DiagnosticConsole
- Add filtering by severity/domain
- Add sorting and grouping
- Add muting affordances
- Add action buttons
- Integrate diagnostics into block inspector
- Add port/bus badges

---

## Part 6: Risks & Blockers

### Risk 1: EventHub Reentrancy
**Severity**: HIGH  
**Description**: If event handlers can mutate core state, circular event emissions are possible.  
**Mitigation**: Enforce that handlers only queue state changes; emit after handler finishes.

### Risk 2: Compile Diagnostic Snapshot Races
**Severity**: HIGH  
**Description**: If user edits during compilation, which revision do compile diagnostics belong to?  
**Mitigation**: Use `compileId` + `patchRevision` to disambiguate; reject stale compile results.

### Risk 3: Runtime Diagnostic Expiry
**Severity**: MEDIUM  
**Description**: Slow runtimes might not emit snapshots frequently enough; diagnostics might expire.  
**Mitigation**: Make expiry window configurable; log missed snapshots.

### Risk 4: Performance of Authoring Validators
**Severity**: MEDIUM  
**Description**: Large patches might exceed 10ms validation budget.  
**Mitigation**: Profile on typical patches; add fallback to async-defer if needed.

### Risk 5: Muting State Loss
**Severity**: LOW  
**Description**: If muting is not persisted, users lose their preferences on reload.  
**Mitigation**: Store muting state in patch metadata or local preference file.

---

## Part 7: Test Coverage Requirements

### Required Test Cases

1. **Diagnostic ID Stability**
   - Same error in same patch → same ID
   - Same error in different patch → different ID
   - ID includes patchRevision

2. **Compile Snapshot Replacement**
   - CompileEnd replaces (not merges) previous snapshot
   - Removed diagnostics disappear
   - New diagnostics appear

3. **Authoring Validator Timing**
   - Validators run < 10ms on typical patches
   - Run synchronously (no awaits)
   - Run on GraphCommitted event

4. **Runtime Diagnostic Aggregation**
   - NaN count increments
   - Occurrence count updates
   - Old diagnostics expire after time window

5. **Muting**
   - Muted diagnostics don't appear in active set
   - Muting is per diagnostic ID
   - Muting clears when patch edited (if configured)

6. **Event Ordering**
   - GraphCommitted triggers authoring validators
   - CompileBegin marks revision pending
   - CompileEnd replaces compile snapshot
   - ProgramSwapped sets active revision

---

## Summary Table: Spec Compliance

| Feature | Spec | Impl | Gap | Priority |
|---------|------|------|-----|----------|
| Diagnostic Codes | 30+ | 0 | Complete | P0 |
| TargetRef | Yes | No | Complete | P0 |
| DiagnosticHub | Yes | No | Complete | P0 |
| EventHub | Yes | No | Complete | P0 |
| Five-Event Integration | Yes | No | Complete | P0 |
| Compiler Error→Diag | Yes | No | Complete | P1 |
| Authoring Validators | Yes | No | Complete | P1 |
| Runtime Diagnostics | Yes | No | Complete | P1 |
| Diagnostic Console UI | Yes | Partial | Significant | P2 |
| Muting | Yes | No | Complete | P2 |
| Stable IDs | Yes | No | Complete | P0 |
| Bus Warnings | Yes | No | Complete | P1 |
| Port Badges | Yes | No | Complete | P2 |
| Diagnostic Grouping | Yes | No | Complete | P2 |

---

## Recommendation

The diagnostics system is foundational infrastructure that blocks multiple other systems (UI feedback, runtime monitoring, quality gates). **Implement in this order**:

1. **EventHub** (P0) - All other systems depend on this
2. **TargetRef + Diagnostic Codes** (P0) - Core types
3. **DiagnosticHub** (P0) - State management
4. **Compiler Integration** (P1) - Connect compiler to diagnostics
5. **Authoring Validators** (P1) - Immediate feedback
6. **Runtime Integration** (P1) - Performance monitoring
7. **UI Components** (P2) - User-facing elements
8. **Polish** (P3) - Muting, grouping, actions

Estimated effort: 80-120 engineering hours for full implementation.

