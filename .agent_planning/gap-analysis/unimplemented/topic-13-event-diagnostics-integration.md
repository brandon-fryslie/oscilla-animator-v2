---
topic: 13
name: event-diagnostics-integration
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/13-event-diagnostics-integration.md
category: unimplemented
audited: 2026-01-24T22:00:00Z
item_count: 7
---

# Topic 13: Event-Diagnostics Integration - Gap Analysis

## Primary Category: UNIMPLEMENTED (7 items)

The five-event contract between EventHub and DiagnosticHub is substantially implemented. However, several spec-mandated behaviors within those handlers are missing.

### 1. Runtime diagnostic aggregation (addOrUpdateRuntimeDiagnostic)
- **Spec**: Same diagnostic ID updates occurrenceCount + lastSeenAt. Shows "P_NAN_DETECTED x237"
- **Status**: UNIMPLEMENTED - handleRuntimeHealthSnapshot simply adds/removes diagnostics without updating counts on existing entries

### 2. Runtime diagnostic expiry (expireRuntimeDiagnostics)
- **Spec**: Diagnostics not seen in last 10 seconds auto-expire
- **Status**: UNIMPLEMENTED - No TTL-based expiry logic

### 3. CompileSnapshot structured type
- **Spec**: CompileSnapshot includes `{ patchRevision, compileId, diagnostics, timestamp }`
- **Status**: UNIMPLEMENTED - compileSnapshots stores plain `Diagnostic[]` without compileId or timestamp

### 4. AuthoringSnapshot structured type
- **Spec**: AuthoringSnapshot includes `{ patchRevision, diagnostics, timestamp }`
- **Status**: UNIMPLEMENTED - authoringSnapshot is plain `Diagnostic[]` without patchRevision or timestamp

### 5. Muted diagnostics filtering in queries
- **Spec**: mutedDiagnostics Set<string> filters diagnostics from query results
- **Status**: UNIMPLEMENTED - No muting support

### 6. Authoring validators: empty buses, unbound inputs using silent values
- **Spec**: Validators check for empty buses (publishers but no listeners), unbound inputs
- **Status**: UNIMPLEMENTED - Only TimeRoot, connectivity, and output usage validators exist

### 7. clearCompilePending on CompileEnd
- **Spec**: `diagnosticHub.clearCompilePending(event.patchRevision)` after snapshot replacement
- **Status**: UNIMPLEMENTED - pendingCompileRevision is cleared by checking equality, not via explicit method. The logic exists but differently shaped.

## Also

### DONE (8 items)
1. Five-event subscription contract (GraphCommitted, CompileBegin, CompileEnd, ProgramSwapped, RuntimeHealthSnapshot)
2. GraphCommitted -> authoring validators -> replace authoring snapshot
3. CompileBegin -> set pendingCompileRevision
4. CompileEnd -> REPLACE compile snapshot (not merge) -- correctly implements the critical replace semantics
5. ProgramSwapped -> update activeRevision
6. RuntimeHealthSnapshot -> add/remove runtime diagnostics from diagnosticsDelta
7. diagnosticsRevision increment on every state change
8. Query methods: getActive(), getByRevision(), getCompileSnapshot(), getAuthoringSnapshot(), getRuntimeDiagnostics()

### TO-REVIEW (2 items)
1. **ParamChanged/BlockLowered handlers**: Implementation adds two extra event subscriptions not in spec (for param flow visibility logging). These are useful for debugging but expand the "five-event contract" to seven events.
2. **getActive() fallback logic**: Implementation falls back to most recent compile snapshot if active revision has none. Spec doesn't describe this behavior -- it may be pragmatic or it may mask revision-tracking bugs.
