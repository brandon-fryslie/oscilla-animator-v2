---
indexed: true
source: ./07-diagnostics-system.md
source_hash: a4f8c2e9d1b5
source_mtime: 2026-01-09T00:00:00Z
original_tokens: ~4510
index_tokens: ~670
compression: 14.8%
index_version: 1.0
---

# Index: Diagnostics System (07-diagnostics-system.md)

## Key Assertions
- Diagnostics are structured, addressable, stable facts (not console logs) [L24]
- Same root cause produces the same ID; diagnostics have identity and lifecycle [L25-28]
- Three diagnostic streams (Compile, Runtime, Authoring) with different characteristics [L32-78]
- EventHub produces facts; DiagnosticHub maintains stateful model with deduplication [L127-131]
- Diagnostics dedup by ID: code + primaryTarget + patchRevision + signature [L299, 336-365]
- Compile diagnostics are complete snapshots per CompileEnd; not incremental [L200]
- Runtime diagnostics are time-windowed (10s) with aggregation to prevent spam [L55-58]
- Authoring diagnostics are fast, synchronous, dismissible [L70-72]
- ID includes patchRevision: same error in different patch = different diagnostic instance [L354-366]

## Definitions
- **Diagnostic** (13 fields): id, code, severity, domain, primaryTarget, affectedTargets, title, message, payload, actions, quickFixId, scope, metadata [L297-333]
- **TargetRef** (7 variants): block, port, bus, binding, timeRoot, graphSpan, composite [L260-267]
- **Severity** (5 levels): fatal, error, warn, info, hint [L274-284]
- **Domain** (4 types): authoring, compile, runtime, perf [L289]
- **DiagnosticCode** (30+ codes): E_TIME_ROOT_MISSING, E_TYPE_MISMATCH, E_CYCLE_DETECTED, W_BUS_EMPTY, P_NAN_DETECTED, etc. [L465-524]
- **DiagnosticAction** (7 variants): goToTarget, insertBlock, removeBlock, addAdapter, createTimeRoot, muteDiagnostic, openDocs [L371-378]
- **DiagnosticPayload** (5 variants): typeMismatch, cycle, busMetrics, performance, domainMismatch [L391-396]
- **Five-Event Spine**: GraphCommitted, CompileBegin, CompileEnd, ProgramSwapped, RuntimeHealthSnapshot [L135-250]

## Invariants
- **I1**: Stable ID generation: hash(code + primaryTarget + signature + patchRevision) [L299]
- **I2**: ID NOT include timestamps, counts, frame data—goes in metadata [L357-362]
- **I3**: Compile diagnostics completely replaced on CompileEnd (not merged) [L435]
- **I4**: Runtime diagnostics aggregated with occurrence count to prevent spam [L549-559]
- **I5**: Same diagnostic ID updates metadata (count, lastSeen) but keeps same identity [L539]
- **I6**: Diagnostic must have TargetRef; no target = log, not diagnostic [L565]
- **I7**: Mute per diagnostic ID per patch; clearing target clears mute [L569-581]
- **I8**: Actions are deterministic, serializable, replayable, safe (by ID, not mutable) [L837-854]

## Data Structures
- **Diagnostic** (13 fields) [L297]
  - id, code, severity, domain, primaryTarget, affectedTargets, title, message, payload, actions, quickFixId, scope, metadata
- **TargetRef** (7 discriminated variants) [L260-267]
  - block, port, bus, binding, timeRoot, graphSpan, composite
- **DiagnosticHub** (4 maps + state) [L407-426]
  - compileSnapshots, authoringSnapshot, runtimeDiagnostics, activeRevision, pendingCompileRevision, mutedDiagnostics
- **CompileEndEvent** (6 fields + diagnostics[]) [L184-197]
  - compileId, patchId, patchRevision, status, durationMs, diagnostics, programMeta
- **RuntimeHealthSnapshotEvent** (6 fields + diagnosticsDelta) [L225-246]
  - patchId, activePatchRevision, tMs, frameBudget, evalStats, diagnosticsDelta

## Dependencies
- **Depends on**: [02-block-system](./02-block-system.md) (block/port/bus structure), [04-compilation](./04-compilation.md) (compiler errors), [05-runtime](./05-runtime.md) (performance monitoring)
- **Referenced by**: [12-event-hub](./12-event-hub.md) (event architecture), [13-event-diagnostics-integration](./13-event-diagnostics-integration.md) (integration pattern)

## Decisions
- DECISION: Five-event spine (GraphCommitted, CompileBegin, CompileEnd, ProgramSwapped, RuntimeHealthSnapshot) [L135-250]
- DECISION: Compile diagnostics = complete snapshot per revision, not incremental [L200]
- DECISION: patchRevision in diagnostic ID ensures same error in different patch = different instance [L354-366]
- DECISION: TargetRef as discriminated union ensures impossible to create invalid targets [L270]
- DECISION: Muting is per ID per patch; clearing target clears mute [L569]
- DECISION: Diagnostic actions deterministic and fully specified (exact insertion site, params, mode) [L837-854]
- DECISION: Dual addressing: hard (blockId) + semantic (pathRef) for resilience [L778-796]
- DECISION: Grouping multi-target diagnostics by groupKey for UI scalability [L817-833]

## Tier Classification
- **Tier**: T2 (Structural)
- **Rationale**: Diagnostics system provides foundational observability and developer feedback across compile/runtime/authoring domains. T2 classification reflects that it's a structural component supporting the entire system's health reporting and user communication, but not foundational to core compilation or execution.
