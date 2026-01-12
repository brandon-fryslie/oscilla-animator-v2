# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

The Diagnostics System provides structured, stable feedback about patch health across **three streams**:
1. **Compile-time errors** - Type mismatches, cycles, missing inputs
2. **Authoring hints** - Immediate structural issues (runs on every edit)
3. **Runtime warnings** - NaN/Inf detection, performance (Sprint 2+)

### Event-Driven Flow

```
Producers (Compiler, Runtime, Validators)
    │
    ▼
EventHub (5 core events)
    │
    ▼
DiagnosticHub (maintains snapshots per stream)
    │
    ▼
DiagnosticsStore (MobX wrapper)
    │
    ▼
UI Components (DiagnosticConsole, badges)
```

### Five-Event Contract

DiagnosticHub subscribes to exactly five events:

| Event | Action | Snapshot Behavior |
|-------|--------|-------------------|
| `GraphCommitted` | Run authoring validators | **REPLACE** authoring snapshot |
| `CompileBegin` | Mark revision pending | - |
| `CompileEnd` | Store compile diagnostics | **REPLACE** compile snapshot (NOT merge!) |
| `ProgramSwapped` | Update active revision | - |
| `RuntimeHealthSnapshot` | Update runtime diagnostics | **MERGE** with expiry |

### Snapshot Semantics

**Critical**: Compile and authoring snapshots are **replaced**, not merged. When a new CompileEnd arrives for a revision, the old diagnostics for that revision are completely replaced. This ensures users see current state, not accumulated history.

## Key Types

### Diagnostic Structure
```typescript
interface Diagnostic {
  id: string;           // Stable: "CODE:targetStr:revN"
  code: DiagnosticCode; // E.g., E_TYPE_MISMATCH
  severity: 'fatal' | 'error' | 'warn' | 'info' | 'hint';
  domain: 'authoring' | 'compile' | 'runtime' | 'perf';
  primaryTarget: TargetRef;
  title: string;        // Short summary
  message: string;      // Detailed explanation
  scope: { patchRevision: number; compileId?: string };
  metadata: { firstSeenAt, lastSeenAt, occurrenceCount };
}
```

### TargetRef (What the diagnostic points to)
```typescript
type TargetRef =
  | { kind: 'block'; blockId: string }
  | { kind: 'port'; blockId: string; portId: string }
  | { kind: 'bus'; busId: string }
  | { kind: 'binding'; bindingId, busId, blockId, direction }
  | { kind: 'timeRoot'; blockId: string }
  | { kind: 'graphSpan'; blockIds: string[]; spanKind?: 'cycle' | 'island' }
  | { kind: 'composite'; compositeDefId: string; instanceId?: string }
```

Use exhaustive switch with `never` check when handling TargetRef.

## Stable ID Generation

Format: `CODE:targetStr:revN[:signature]`

Example: `E_TYPE_MISMATCH:port-b1:p2:rev42`

**Why patchRevision is in the ID**: Same error in different patch versions → different diagnostic ID. User wants to see it again after editing.

## MobX Reactivity Pattern

DiagnosticHub is NOT observable. DiagnosticsStore wraps it for MobX:

```typescript
// DiagnosticsStore
get revision(): number {
  return this.hub.getDiagnosticsRevision();
}

get activeDiagnostics(): Diagnostic[] {
  this.revision; // Force MobX dependency
  return this.hub.getActive();
}
```

DiagnosticHub calls `incrementRevision()` after every state change to trigger UI updates.

## Authoring Validators

Fast (<10ms), synchronous checks that run on every GraphCommitted:

- **TimeRoot validation**: Missing or multiple → `E_TIME_ROOT_MISSING` / `E_TIME_ROOT_MULTIPLE`
- Sprint 2+: Disconnected blocks, unused outputs

Performance budget: <10ms for 50 blocks, <50ms for 200 blocks.

## Compiler Integration

Compiler errors are converted to Diagnostics in `src/compiler/diagnosticConversion.ts`:

```typescript
const ERROR_KIND_TO_CODE: Record<string, DiagnosticCode> = {
  NoTimeRoot: 'E_TIME_ROOT_MISSING',
  TypeMismatch: 'E_TYPE_MISMATCH',
  CycleDetected: 'E_CYCLE_DETECTED',
  // ...
};
```

## Testing

```bash
# Run diagnostic tests
npm run test -- src/diagnostics

# Run specific test file
npm run test -- src/diagnostics/__tests__/DiagnosticHub.test.ts
```

Test patterns:
- Create mock EventHub and Patch
- Emit events, verify snapshots
- Test replace-not-merge semantics
- Verify deduplication by ID

## Common Pitfalls

1. **Merging instead of replacing**: CompileEnd must REPLACE the snapshot, never merge
2. **Missing patchRevision in ID**: IDs must include revision for proper deduplication
3. **Blocking on validators**: Authoring validators must complete in <10ms
4. **Forgetting incrementRevision()**: Always call after modifying diagnostics state

## File Structure

```
src/diagnostics/
├── types.ts              # Diagnostic, TargetRef, DiagnosticCode
├── diagnosticId.ts       # Stable ID generation
├── DiagnosticHub.ts      # Central state manager
├── validators/
│   └── authoringValidators.ts  # Fast structural checks
└── __tests__/            # Unit tests
```

## Spec References

- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/07-diagnostics-system.md`
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/12-event-hub.md`
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/13-event-diagnostics-integration.md`
