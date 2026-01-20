# Implementation Context: fix-typecheck-tests

**Generated**: 2026-01-20
**Sprint**: Fix TypeScript and Test Failures

## Key Files

### Files to Modify

| File | Purpose |
|------|---------|
| `src/diagnostics/__tests__/DiagnosticHub.test.ts` | Fix event shapes, fix method calls |
| `src/runtime/timeResolution.ts` | Add `progress` property to `EffectiveTime` |
| `src/diagnostics/DiagnosticHub.ts` | Add convenience methods `getBySeverity` and `getByDomain` |

### Reference Files (Read-Only)

| File | Contains |
|------|----------|
| `src/events/types.ts` | Event type definitions - the source of truth |
| `src/diagnostics/types.ts` | `Diagnostic` and `DiagnosticFilter` types |

## Event Type Shapes

### GraphCommittedEvent (Required Shape)

```typescript
{
  type: 'GraphCommitted',
  patchId: string,
  patchRevision: number,
  reason: 'userEdit' | 'macroExpand' | 'import' | 'undo' | 'redo',
  diffSummary: {
    blocksAdded: number,
    blocksRemoved: number,
    edgesChanged: number,
  },
  affectedBlockIds?: readonly string[],
}
```

### CompileBeginEvent (Required Shape)

```typescript
{
  type: 'CompileBegin',
  compileId: string,
  patchId: string,
  patchRevision: number,
  trigger: 'graphCommitted' | 'manual' | 'startup',
}
```

### CompileEndEvent (Required Shape)

```typescript
{
  type: 'CompileEnd',
  compileId: string,
  patchId: string,
  patchRevision: number,
  status: 'success' | 'failure',
  durationMs: number,
  diagnostics: readonly Diagnostic[],
}
```

## Diagnostic Type Shape

```typescript
interface Diagnostic {
  id: string;
  code: DiagnosticCode;
  severity: 'fatal' | 'error' | 'warn' | 'info' | 'hint';
  domain: 'authoring' | 'compile' | 'runtime' | 'perf';
  primaryTarget: TargetRef;
  title: string;
  message: string;
  scope: { patchRevision: number; compileId?: string };
  metadata: { firstSeenAt: number; lastSeenAt: number; occurrenceCount: number };
}
```

## Helper Function Template

To reduce test boilerplate, create helpers:

```typescript
function makeGraphCommitted(patchRevision: number): GraphCommittedEvent {
  return {
    type: 'GraphCommitted',
    patchId: 'patch-0',
    patchRevision,
    reason: 'userEdit',
    diffSummary: { blocksAdded: 0, blocksRemoved: 0, edgesChanged: 0 },
  };
}

function makeCompileBegin(patchRevision: number, compileId: string): CompileBeginEvent {
  return {
    type: 'CompileBegin',
    patchId: 'patch-0',
    patchRevision,
    compileId,
    trigger: 'graphCommitted',
  };
}

function makeCompileEnd(
  patchRevision: number,
  compileId: string,
  diagnostics: Diagnostic[]
): CompileEndEvent {
  return {
    type: 'CompileEnd',
    patchId: 'patch-0',
    patchRevision,
    compileId,
    status: diagnostics.length > 0 ? 'failure' : 'success',
    durationMs: 10,
    diagnostics,
  };
}

function makeDiagnostic(
  code: DiagnosticCode,
  overrides?: Partial<Diagnostic>
): Diagnostic {
  return {
    id: `${code}:block-b1:rev1`,
    code,
    severity: 'error',
    domain: 'compile',
    primaryTarget: { kind: 'block', blockId: 'b1' },
    title: `Test diagnostic for ${code}`,
    message: 'Test message',
    scope: { patchRevision: 1 },
    metadata: { firstSeenAt: Date.now(), lastSeenAt: Date.now(), occurrenceCount: 1 },
    ...overrides,
  };
}
```

## Implementation Notes

### Adding `progress` to EffectiveTime

In `src/runtime/timeResolution.ts`, add at the end of the interface:

```typescript
export interface EffectiveTime {
  // ... existing fields ...

  /** Progress within finite time (0-1), only set for finite time roots */
  progress?: number;
}
```

### Adding Convenience Methods to DiagnosticHub

In `src/diagnostics/DiagnosticHub.ts`, add these methods:

```typescript
/**
 * Returns diagnostics filtered by severity.
 */
getBySeverity(severity: Diagnostic['severity']): Diagnostic[] {
  return this.filter(this.getActive(), { severity });
}

/**
 * Returns diagnostics filtered by domain.
 */
getByDomain(domain: Diagnostic['domain']): Diagnostic[] {
  return this.filter(this.getActive(), { domain });
}
```

## Commands for Verification

```bash
# Check types
npm run typecheck

# Run all tests
npm test

# Run specific test file
npm test -- src/diagnostics/__tests__/DiagnosticHub.test.ts

# Run with verbose output
npm test -- src/diagnostics/__tests__/DiagnosticHub.test.ts --reporter=verbose
```
