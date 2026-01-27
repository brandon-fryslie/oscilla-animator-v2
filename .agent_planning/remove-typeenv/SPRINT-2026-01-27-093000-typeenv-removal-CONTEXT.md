# Implementation Context: typeenv-removal

**Sprint**: Remove TypeEnv Legacy Pattern
**Bead ID**: oscilla-animator-v2-6n6

## File Locations

### Primary Files
- `src/expr/typecheck.ts` - Type checker with deprecated pattern
- `src/expr/index.ts` - Public API (only caller of deprecated pattern)
- `src/expr/__tests__/typecheck.test.ts` - Tests to update

## Current Code Patterns

### src/expr/typecheck.ts

**Type Definitions (keep `TypeEnv`, it's used internally):**
```typescript
// Line 42 - KEEP (used by TypeCheckContext.inputs)
export type TypeEnv = ReadonlyMap<string, PayloadType>;

// Lines 60-65 - KEEP unchanged
export interface TypeCheckContext {
  readonly inputs: TypeEnv;
  readonly blockRefs?: BlockReferenceContext;
}
```

**Function Signatures (REMOVE overload):**
```typescript
// Line 118 - Modern signature (KEEP)
export function typecheck(node: ExprNode, ctx: TypeCheckContext): ExprNode;

// Lines 120-122 - Deprecated overload (REMOVE)
/**
 * @deprecated Legacy signature - use TypeCheckContext instead
 */
export function typecheck(node: ExprNode, env: TypeEnv): ExprNode;

// Line 123 - Implementation (SIMPLIFY)
export function typecheck(node: ExprNode, ctxOrEnv: TypeCheckContext | TypeEnv): ExprNode {
  // Lines 124-127 - Auto-conversion (REMOVE)
  const ctx: TypeCheckContext = isTypeEnv(ctxOrEnv)
    ? { inputs: ctxOrEnv }
    : ctxOrEnv;
  // ...
}
```

**Type Guard (REMOVE):**
```typescript
// Lines 159-161 - REMOVE entirely
function isTypeEnv(arg: TypeCheckContext | TypeEnv): arg is TypeEnv {
  return arg instanceof Map || (arg as TypeCheckContext).inputs === undefined;
}
```

### src/expr/index.ts

**Imports (REMOVE `TypeEnv`):**
```typescript
// Line 29 - CHANGE FROM:
import { typecheck, TypeError, type TypeEnv } from './typecheck';
// TO:
import { typecheck, TypeError } from './typecheck';
```

**extractPayloadTypes (CHANGE return type):**
```typescript
// Line 141 - CHANGE FROM:
function extractPayloadTypes(inputs: ReadonlyMap<string, SignalType>): TypeEnv {
// TO:
function extractPayloadTypes(inputs: ReadonlyMap<string, SignalType>): ReadonlyMap<string, PayloadType> {
```

**Call Site (CHANGE to TypeCheckContext):**
```typescript
// Lines 90-91 - CHANGE FROM:
const inputTypes = extractPayloadTypes(inputs);
const typedAst = typecheck(ast, inputTypes);
// TO:
const inputTypes = extractPayloadTypes(inputs);
const typedAst = typecheck(ast, { inputs: inputTypes });
```

**Re-export (REMOVE):**
```typescript
// Line 151 - REMOVE entirely
export type { TypeEnv } from './typecheck';
```

### src/expr/__tests__/typecheck.test.ts

**Test Pattern (UPDATE all):**
```typescript
// CHANGE FROM (multiple locations):
const env = new Map([['phase', FLOAT]]);
const typed = typecheck(ast, env);

// TO:
const env = new Map([['phase', FLOAT]]);
const typed = typecheck(ast, { inputs: env });
```

**Affected Lines:**
- 15-16, 22-23, 31-33, 38-39, 46-47, 53-54, 60-61, 69-72, 77-78, 85-89, 94-99, 106-108, 113-114, 119-120, 128-129, 134-135, 140-141, 150-151, 156-160, 165-167, 171-173, 181-183, 192-193

## Execution Commands

```bash
# Type check
npm run typecheck

# Run tests
npm run test

# Run specific test file
npx vitest run src/expr/__tests__/typecheck.test.ts

# Build
npm run build
```

## Expected Final State

After changes, grep for `TypeEnv` should show ONLY:
```
src/expr/typecheck.ts:42:export type TypeEnv = ReadonlyMap<string, PayloadType>;
src/expr/typecheck.ts:62:  readonly inputs: TypeEnv;
```

No other references should exist in production code.
