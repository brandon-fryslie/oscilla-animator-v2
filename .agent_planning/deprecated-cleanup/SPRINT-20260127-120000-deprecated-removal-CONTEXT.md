# Implementation Context: deprecated-removal Sprint

**Generated:** 2026-01-27T12:00:00
**Sprint:** Remove All Deprecated Types and Functions

## File Reference

### Primary Files to Modify

| File | Changes | Lines |
|------|---------|-------|
| src/core/canonical-types.ts | Remove NumericUnit, PAYLOAD_STRIDE | ~150-152, 278-292 |
| src/types/index.ts | Remove PAYLOAD_STRIDE export | ~29 |
| src/compiler/ir/IRBuilderImpl.ts | Remove getStateSlots() | ~844-863 |
| src/compiler/ir/IRBuilder.ts | Remove getStateSlots() interface | interface decl |
| src/compiler/types.ts | Remove deprecated fields | ~62-68 |
| src/compiler/diagnosticConversion.ts | Use code instead of kind | ~109, 115, 119 |
| src/compiler/passes-v2/pass7-schedule.ts | Use getStateMappings() | ~27 |
| src/runtime/RuntimeState.ts | Remove createRuntimeState() | ~590-612 |
| src/runtime/index.ts | Remove createRuntimeState export | export line |
| src/expr/typecheck.ts | Remove TypeEnv, isTypeEnv, overload | ~42, 122, 157-160 |

### Test Files to Modify

| File | Changes |
|------|---------|
| src/blocks/__tests__/event-blocks.test.ts | Update ~8 createRuntimeState calls |
| src/blocks/__tests__/stateful-primitives.test.ts | Update ~10 createRuntimeState calls |

## Code Patterns

### Pattern: Replacing createRuntimeState()

**Before:**
```typescript
const state = createRuntimeState(slotCount, stateSlotCount, eventSlotCount, eventExprCount);
```

**After:**
```typescript
const session = createSessionState();
const program = createProgramState(slotCount, stateSlotCount, eventSlotCount, eventExprCount);
const state: RuntimeState = {
  ...session,
  ...program,
};
```

Or use helper if one exists: `createRuntimeStateFromSession()` for production code.

### Pattern: Replacing error.kind with error.code

**Before:**
```typescript
ERROR_KIND_TO_CODE[error.kind]
formatTitle(error.kind)
generateDiagnosticId(error.kind, ...)
```

**After:**
```typescript
error.code  // Already contains the code
formatTitle(error.code)
generateDiagnosticId(error.code, ...)
```

### Pattern: Replacing getStateSlots()

**Before:**
```typescript
const stateSlots = builder.getStateSlots();
// Returns: { initialValue: number }[]
```

**After:**
```typescript
const stateMappings = builder.getStateMappings();
// Returns: StateMapping[]
// Need to adapt usage to new format or convert inline
```

## Type Definitions to Remove

```typescript
// canonical-types.ts - REMOVE
export type NumericUnit = Unit['kind'];
export const PAYLOAD_STRIDE: Record<PayloadKind, number> = { ... };

// typecheck.ts - REMOVE
export type TypeEnv = ReadonlyMap<string, PayloadType>;
function isTypeEnv(arg: TypeCheckContext | TypeEnv): arg is TypeEnv { ... }

// types.ts - REMOVE from CompileError
readonly kind?: string;
readonly location?: CompileErrorWhere;
readonly severity?: 'error' | 'warning' | 'info';
```

## Beads Reference

| Bead ID | Title | Status |
|---------|-------|--------|
| oscilla-animator-v2-tk2.1 | Remove NumericUnit | open |
| oscilla-animator-v2-tk2.2 | Remove getStateSlots() | open |
| oscilla-animator-v2-tk2.3 | Remove CompileError legacy fields | open |
| oscilla-animator-v2-tk2.4 | Remove createRuntimeState() | open |
| oscilla-animator-v2-6n6 | Remove TypeEnv | open |
| (NEW) | Remove PAYLOAD_STRIDE | to be created |

## Related Specs

- No spec changes needed - all removals are implementation cleanup
- Canonical types are defined by spec; these deprecated items are legacy bridges

## Testing Strategy

1. Run `npm run test` after each file modification
2. Run `npm run typecheck` to catch any missed references
3. Final `npm run build` to verify production build
4. Grep for `@deprecated` to confirm none remain
