# Implementation Context: compiler-flags
Generated: 2026-02-02
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260202-compiler-flags-PLAN.md

## Work Item 1: DiagnosticFlagDef Type and Registry

### New file: `src/compiler/diagnostic-flags.ts`

```typescript
// Types
export type DiagnosticSeverityOverride = 'error' | 'warn' | 'ignore';

export interface DiagnosticFlagDef {
  readonly code: string;
  readonly label: string;
  readonly description: string;
  readonly defaultSeverity: DiagnosticSeverityOverride;
  readonly category: string;
}

// Registry - single source of truth for all configurable diagnostic codes
export const DIAGNOSTIC_FLAGS: readonly DiagnosticFlagDef[] = Object.freeze([
  { code: 'ConflictingUnits', label: 'Conflicting Units', description: 'Unit mismatch across connected ports', defaultSeverity: 'warn', category: 'type-system' },
  { code: 'ConflictingPayloads', label: 'Conflicting Payloads', description: 'Payload type mismatch across connected ports', defaultSeverity: 'error', category: 'type-system' },
  { code: 'UnresolvedUnit', label: 'Unresolved Unit', description: 'Could not infer unit for a port', defaultSeverity: 'error', category: 'type-system' },
  { code: 'UnresolvedPayload', label: 'Unresolved Payload', description: 'Could not infer payload type for a port', defaultSeverity: 'error', category: 'type-system' },
  { code: 'MissingBlockDef', label: 'Missing Block Definition', description: 'Block type not found in registry', defaultSeverity: 'error', category: 'type-system' },
  { code: 'MissingPortDef', label: 'Missing Port Definition', description: 'Port not found on block definition', defaultSeverity: 'error', category: 'type-system' },
  { code: 'CardinalityConflict', label: 'Cardinality Conflict', description: 'Incompatible cardinality across connected ports', defaultSeverity: 'error', category: 'type-system' },
  { code: 'UnresolvedCardinality', label: 'Unresolved Cardinality', description: 'Could not resolve cardinality for a port', defaultSeverity: 'error', category: 'type-system' },
]);

// Helper
export function getDefaultDiagnosticFlags(): Record<string, DiagnosticSeverityOverride> {
  const result: Record<string, DiagnosticSeverityOverride> = {};
  for (const flag of DIAGNOSTIC_FLAGS) {
    result[flag.code] = flag.defaultSeverity;
  }
  return result;
}
```

**Codes come from**: `TypeConstraintErrorKind` union at `src/compiler/frontend/analyze-type-constraints.ts` line 37-45.

---

## Work Item 2: Settings Token

### New file: `src/settings/tokens/compiler-flags-settings.ts`

**Pattern to follow**: `src/settings/tokens/debug-settings.ts` (lines 1-29)

```typescript
import { defineSettings } from '../defineSettings';
import { DIAGNOSTIC_FLAGS, getDefaultDiagnosticFlags } from '../../compiler/diagnostic-flags';
import type { DiagnosticSeverityOverride } from '../../compiler/diagnostic-flags';
import type { FieldUIHint } from '../types';

// Build fields dynamically from registry (single source of truth)
const fields: Record<string, FieldUIHint> = {};
for (const flag of DIAGNOSTIC_FLAGS) {
  fields[flag.code] = {
    label: flag.label,
    description: flag.description,
    control: 'select',
    options: [
      { label: 'Error', value: 'error' },
      { label: 'Warning', value: 'warn' },
      { label: 'Ignore', value: 'ignore' },
    ],
  };
}

export const compilerFlagsSettings = defineSettings<Record<string, DiagnosticSeverityOverride>>('compilerFlags', {
  defaults: getDefaultDiagnosticFlags(),
  ui: {
    label: 'Compiler Diagnostics',
    description: 'Configure severity for each compiler diagnostic code',
    order: 20,
    fields: fields as any,  // Dynamic fields; type assertion needed since keys are dynamic
  },
});
```

### Modify: `src/main.ts`

**Location**: Line 137, where `store.settings.register(appSettings)` is called.

Add adjacent line:
```typescript
import { compilerFlagsSettings } from './settings/tokens/compiler-flags-settings';
// ...
store.settings.register(compilerFlagsSettings);
```

---

## Work Item 3: CompileOptions Extension

### Modify: `src/compiler/compile.ts`

**Location**: Lines 76-80, `CompileOptions` interface.

```typescript
// Add import at top:
import type { DiagnosticSeverityOverride } from './diagnostic-flags';

// Extend interface:
export interface CompileOptions {
  readonly patchId?: string;
  readonly patchRevision?: number;
  readonly events: EventHub;
  readonly diagnosticFlags?: Record<string, DiagnosticSeverityOverride>;  // NEW
}
```

---

## Work Item 4: Flag-Aware Error Partitioning

### Modify: `src/compiler/compile.ts`

**Add helper function** (near `emitFailure`, after line 466):

```typescript
import { getDefaultDiagnosticFlags } from './diagnostic-flags';

interface PartitionedErrors {
  errors: CompileError[];
  warnings: CompileError[];
}

function partitionByFlags(
  pass1Errors: readonly { kind: string; blockIndex: number; portName: string; message: string; suggestions: readonly string[] }[],
  flags: Record<string, DiagnosticSeverityOverride> | undefined,
  normalized: NormalizedPatch,
): PartitionedErrors {
  const defaults = getDefaultDiagnosticFlags();
  const effectiveFlags = flags ?? defaults;
  const errors: CompileError[] = [];
  const warnings: CompileError[] = [];

  for (const e of pass1Errors) {
    const severity = effectiveFlags[e.kind] ?? defaults[e.kind] ?? 'error';
    const compileError: CompileError = {
      kind: e.kind,
      message: `${e.message}\nSuggestions:\n${e.suggestions.map((s: string) => `  - ${s}`).join('\n')}`,
      blockId: normalized.blocks[e.blockIndex]?.id,
      portId: e.portName,
    };

    if (severity === 'error') {
      errors.push(compileError);
    } else if (severity === 'warn') {
      warnings.push(compileError);
    }
    // 'ignore' -> drop silently
  }

  return { errors, warnings };
}
```

**Replace pass1 error handling** at lines 188-196:

Current code:
```typescript
if ('kind' in pass1Result && pass1Result.kind === 'error') {
  const compileErrors: CompileError[] = pass1Result.errors.map((e: ...) => ({...}));
  return emitFailure(options, startTime, compileId, compileErrors);
}
```

New code:
```typescript
if ('kind' in pass1Result && pass1Result.kind === 'error') {
  const { errors: fatalErrors, warnings: flagWarnings } = partitionByFlags(
    pass1Result.errors,
    options?.diagnosticFlags,
    normalized,
  );

  // Accumulate warnings for CompileEnd event (handled below alongside unreachableBlockWarnings)
  pass1Warnings = flagWarnings;

  if (fatalErrors.length > 0) {
    return emitFailure(options, startTime, compileId, fatalErrors);
  }
  // If all errors were downgraded to warn/ignore, continue compilation
}
```

**Declare `pass1Warnings`** at the top of the try block (near line 115):
```typescript
let pass1Warnings: CompileError[] = [];
```

**Emit pass1 warnings in success CompileEnd** at lines 390-391, modify to include pass1 warnings:
```typescript
// Convert pass1 warnings to diagnostic format
const pass1WarningDiagnostics = pass1Warnings.map(w => {
  const diag = convertCompileErrorToDiagnostic(w, options.patchRevision || 0, compileId);
  return { ...diag, severity: 'warn' as const };
});
const diagnostics = [successDiagnostic, ...unreachableBlockWarnings, ...pass1WarningDiagnostics];
```

**Key**: `convertCompileErrorToDiagnostic` is already imported at line 23 (as `convertCompileErrorsToDiagnostics`). Need to also import the singular form or use the array version.

Actually, looking at `diagnosticConversion.ts` line 152, `convertCompileErrorToDiagnostic` takes a `CompileError | LegacyCompileError`. The pass1 errors converted by `partitionByFlags` use the legacy format (`kind` + `blockId` + `portId`). The `isLegacyError` guard at line 38 handles this.

**Important**: The `CompileError` at line 52 of `compile.ts` (the local one with `kind` field) is different from `CompileError` in `types.ts` (which has `code` field). The partitioning helper produces the local `compile.ts` format. `convertCompileErrorToDiagnostic` handles both via the legacy bridge.

---

## Work Item 5: CompileOrchestrator Threading

### Modify: `src/services/CompileOrchestrator.ts`

**Location**: Lines 10 (imports) and 82 (compile call).

Add import:
```typescript
import { compilerFlagsSettings } from '../settings/tokens/compiler-flags-settings';
```

Modify compile call at line 82:
```typescript
const diagnosticFlags = store.settings.get(compilerFlagsSettings);
const result = compile(patch, {
  events: store.events,
  patchRevision: store.getPatchRevision(),
  patchId: 'patch-0',
  diagnosticFlags,
});
```

**Prerequisite**: The token must be registered before `.get()` is called. Registration happens in `src/main.ts` (work item 2), which runs before `compileAndSwap`.

---

## Work Item 6: Tests

### New file: `src/compiler/__tests__/diagnostic-flags.test.ts`

**Registry tests**:
- Import `getDefaultDiagnosticFlags`, `DIAGNOSTIC_FLAGS`
- Assert `DIAGNOSTIC_FLAGS.length === 8`
- Assert `getDefaultDiagnosticFlags()['ConflictingUnits'] === 'warn'`
- Assert all others are `'error'`

**Partitioning tests** (unit test the helper):
- Export `partitionByFlags` or test via `compile()` integration
- Preferred: export from `compile.ts` or extract to `diagnostic-flags.ts`

**Integration test** (compile a patch with ConflictingUnits):
- Need a patch fixture with two blocks connected by an edge where the source output has `unit: { kind: 'radians' }` and the target input has `unit: { kind: 'degrees' }` (or similar mismatch)
- Look at existing test fixtures in `src/compiler/__tests__/fixtures/` for patterns
- Verify: `compile(patch, { events, diagnosticFlags: undefined })` returns `kind: 'ok'` (ConflictingUnits is warn by default)
- Verify: `compile(patch, { events, diagnosticFlags: { ConflictingUnits: 'error' } })` returns `kind: 'error'`
- Verify: `compile(patch, { events, diagnosticFlags: { ConflictingUnits: 'ignore' } })` returns `kind: 'ok'`

**Existing test patterns to follow**: `src/compiler/__tests__/compile.test.ts`
