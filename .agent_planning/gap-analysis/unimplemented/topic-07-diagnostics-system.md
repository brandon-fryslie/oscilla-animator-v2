---
topic: 7
name: diagnostics-system
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/07-diagnostics-system.md
category: unimplemented
audited: 2026-01-24T22:00:00Z
item_count: 14
---

# Topic 07: Diagnostics System - Gap Analysis

## Primary Category: UNIMPLEMENTED (14 items)

The core architecture (DiagnosticHub, Diagnostic type, stable IDs, event subscription) is implemented. However, many spec features are missing.

### 1. Diagnostic Actions (DiagnosticAction type)
- **Spec**: Defines 7 action kinds: goToTarget, insertBlock, removeBlock, addAdapter, createTimeRoot, muteDiagnostic, openDocs
- **Status**: UNIMPLEMENTED - types.ts defines DiagnosticAction type but no action is ever attached to any diagnostic
- **File**: `src/diagnostics/types.ts`

### 2. DiagnosticPayload (structured payload)
- **Spec**: typeMismatch, cycle, busMetrics, performance, domainMismatch payloads
- **Status**: UNIMPLEMENTED - The `payload?: DiagnosticPayload` field exists in the type but is never populated by any producer
- **File**: `src/diagnostics/types.ts`

### 3. affectedTargets (related targets)
- **Spec**: `affectedTargets?: TargetRef[]` for multi-target diagnostics (e.g., both ends of type mismatch)
- **Status**: UNIMPLEMENTED - Field exists in type but never set

### 4. Muting system (mutedDiagnostics)
- **Spec**: Per-diagnostic-id, per-patch muting. Mute cleared when target changes.
- **Status**: UNIMPLEMENTED - No `mutedDiagnostics: Set<string>` in DiagnosticHub, no mute/unmute API

### 5. Runtime diagnostic expiry (TTL)
- **Spec**: Old entries expire after time window (10 seconds). `expireRuntimeDiagnostics(currentTime, ttlMs)`
- **Status**: UNIMPLEMENTED - Runtime diagnostics are added/removed but never expired by TTL

### 6. Runtime diagnostic occurrence count aggregation
- **Spec**: Same diagnostic ID updates `occurrenceCount + lastSeenAt` (addOrUpdateRuntimeDiagnostic)
- **Status**: UNIMPLEMENTED - RuntimeHealthSnapshot handler simply adds/removes, never updates existing counts

### 7. Bus warnings (W_BUS_EMPTY, W_BUS_NO_PUBLISHERS, W_BUS_COMBINE_CONFLICT)
- **Spec**: Generated after successful compilation from bus usage summary
- **Status**: UNIMPLEMENTED - Config exists for bus warnings but no bus warning generation code

### 8. Dual Addressing (pathRef + hardRef)
- **Spec**: Every TargetRef optionally carries semantic address for resilience across graph rewrites
- **Status**: UNIMPLEMENTED - T3 polish feature. No pathRef field exists.

### 9. Diagnostic grouping (groupKey)
- **Spec**: groupKey for UI to collapse similar warnings
- **Status**: UNIMPLEMENTED - No groupKey concept

### 10. Missing query methods
- **Spec**: `isCompilePending()`, `getPendingRevision()`, `getActiveRevision()`, `getAll(filters?)`
- **Status**: UNIMPLEMENTED - These methods are not exposed (some internal state exists)

### 11. Missing diagnostic codes
- **Spec**: 30+ codes including E_TIME_ROOT_INVALID_TOPOLOGY, E_DOMAIN_MISMATCH, E_INVALID_CONNECTION, W_BUS_COMBINE_CONFLICT, W_GRAPH_DEAD_CHANNEL, I_REDUCE_REQUIRED, I_SILENT_VALUE_USED, I_DEPRECATED_PRIMITIVE, P_FIELD_MATERIALIZATION_HEAVY
- **Status**: UNIMPLEMENTED - Only ~10 codes implemented (E_TIME_ROOT_MISSING/MULTIPLE, E_TYPE_MISMATCH, E_CYCLE_DETECTED, E_MISSING_INPUT, E_UNKNOWN_BLOCK_TYPE, P_NAN/INF/FRAME_BUDGET, W_GRAPH_DISCONNECTED_BLOCK, W_GRAPH_UNUSED_OUTPUT, plus expression/cardinality/payload codes)

### 12. GraphCommitted diffSummary gaps
- **Spec**: diffSummary includes busesAdded, busesRemoved, bindingsChanged, timeRootChanged
- **Status**: UNIMPLEMENTED - Implementation only has blocksAdded, blocksRemoved, edgesChanged

### 13. GraphCommitted reason gaps
- **Spec**: reason includes 'compositeSave' | 'migration'
- **Status**: UNIMPLEMENTED - Implementation only has 'userEdit' | 'macroExpand' | 'import' | 'undo' | 'redo'

### 14. CompileEnd programMeta
- **Spec**: `programMeta?: { timelineHint, busUsageSummary? }`
- **Status**: UNIMPLEMENTED - CompileEndEvent has no programMeta field

## Also

### DONE (8 items)
1. Core Diagnostic type with id, code, severity, domain, primaryTarget, title, message, scope, metadata
2. TargetRef discriminated union (all 7 kinds: block, port, bus, binding, timeRoot, graphSpan, composite)
3. Stable ID generation (CODE:targetStr:revN format)
4. DiagnosticHub five-event subscription contract
5. Compile snapshot replace semantics (not merge)
6. Authoring validators (TimeRoot check, connectivity, output usage)
7. Runtime health snapshot integration (NaN/Inf/frame budget)
8. diagnosticsRevision counter for MobX reactivity

### TO-REVIEW (2 items)
1. CompileBegin trigger: spec has 'hotReload', implementation has 'startup' instead
2. ProgramSwapped: spec has 'deferred' swapMode and swapLatencyMs/stateBridgeUsed fields, implementation lacks these
