# Implementation Context: foundation

## Overview
This sprint performs three mechanical refactors with zero semantic changes. All are local to type definitions and imports. TypeScript compiler + test suite provide complete validation.

---

## C-7: Delete FieldExprArray

### Files to Modify
1. **src/compiler/ir/types.ts**

### Exact Changes

**Location 1: Line 218 (FieldExpr union)**
```typescript
// BEFORE
export type FieldExpr =
  | FieldExprIntrinsic
  | FieldExprConst
  | FieldExprArray        // <-- DELETE this line
  | FieldExprMap
  | FieldExprZip
  | FieldExprZipSig
  | FieldExprReduce;

// AFTER
export type FieldExpr =
  | FieldExprIntrinsic
  | FieldExprConst
  | FieldExprMap
  | FieldExprZip
  | FieldExprZipSig
  | FieldExprReduce;
```

**Location 2: Lines 285-289 (interface definition)**
```typescript
// DELETE this entire block:
export interface FieldExprArray {
  readonly kind: 'array';
  readonly slot: SlotId;
  readonly channel: ChannelId;
}
```

### Verification
```bash
# After changes, this should return zero results in src/
grep -r "FieldExprArray" src/
```

---

## C-3: Rename reduce_field → reduceField

### Search Pattern
```bash
grep -rn "reduce_field" src/
```

### Files to Modify (estimated 17 occurrences)

**1. src/compiler/ir/types.ts:167**
```typescript
// BEFORE
export interface FieldExprReduce {
  readonly kind: 'reduce_field';
  // ...
}

// AFTER
export interface FieldExprReduce {
  readonly kind: 'reduceField';
  // ...
}
```

**2. Switch/case statements (wherever they pattern-match FieldExpr.kind)**
```typescript
// BEFORE
case 'reduce_field': {
  // ...
}

// AFTER
case 'reduceField': {
  // ...
}
```

**3. Type guards**
```typescript
// BEFORE
if (expr.kind === 'reduce_field') { ... }

// AFTER
if (expr.kind === 'reduceField') { ... }
```

**4. Test assertions**
```typescript
// BEFORE
expect(expr.kind).toBe('reduce_field');

// AFTER
expect(expr.kind).toBe('reduceField');
```

### Pattern to Follow
- All string literals: `'reduce_field'` → `'reduceField'`
- No function/variable names change (only the literal string)
- Consistent with other FieldExpr kinds: 'map', 'zip', 'zipSig', 'stateRead'

### Verification
```bash
# Should return 0 matches in src/
grep -r "reduce_field" src/
```

---

## C-2: Create core/ids.ts with Branded IDs

### Primary File to Modify

**src/core/ids.ts**

Add these types and factories (insert after existing axis var IDs, before BlockId section):

```typescript
// Insert at approximately line 14 (after axis var IDs, before BlockId)
export type InstanceId = Brand<string, 'InstanceId'>;
export type DomainTypeId = Brand<string, 'DomainTypeId'>;
```

```typescript
// Insert at approximately line 34 (in factory function section)
export const instanceId = (s: string) => s as InstanceId;
export const domainTypeId = (s: string) => s as DomainTypeId;
```

**Final structure (lines 14-36):**
```typescript
export type BranchVarId = Brand<string, 'BranchVarId'>;

export type InstanceId = Brand<string, 'InstanceId'>;        // <-- NEW
export type DomainTypeId = Brand<string, 'DomainTypeId'>;    // <-- NEW

export type BlockId = Brand<string, 'BlockId'>;
// ... rest of IDs

// Factory functions
export const cardinalityVarId = (s: string) => s as CardinalityVarId;
// ... other factories
export const branchVarId = (s: string) => s as BranchVarId;

export const instanceId = (s: string) => s as InstanceId;          // <-- NEW
export const domainTypeId = (s: string) => s as DomainTypeId;      // <-- NEW

export const blockId = (s: string) => s as BlockId;
// ... rest
```

### Files to Update Imports (~20 sites)

**Search command:**
```bash
grep -rn "from.*Indices.*InstanceId\|from.*Indices.*DomainTypeId" src/
```

**Pattern to find:**
```typescript
import { InstanceId, DomainTypeId } from '../compiler/ir/Indices';
import { InstanceId } from '../../compiler/ir/Indices';
```

**Pattern to replace with:**
```typescript
import { InstanceId, DomainTypeId } from '../core/ids';
import { InstanceId } from '../../core/ids';
```

### Key Files That MUST Import from core/ids.ts

1. **src/core/canonical-types.ts**
```typescript
// Add to existing import from './ids'
import {
  CardinalityVarId,
  TemporalityVarId,
  BindingVarId,
  PerspectiveVarId,
  BranchVarId,
  InstanceId,        // <-- ADD
  DomainTypeId       // <-- ADD
} from './ids';
```

2. **src/compiler/ir/types.ts**
```typescript
// Change existing import
import { InstanceId, DomainTypeId } from '../../core/ids';  // <-- NEW PATH
```

3. **src/compiler/ir/Indices.ts (OPTIONAL compatibility re-export)**
```typescript
// Keep old import path working during migration
export { InstanceId, DomainTypeId } from '../../core/ids';
```

### Import Path Patterns by File Location

| File Location | Import Path |
|---------------|-------------|
| `src/core/*.ts` | `from './ids'` |
| `src/compiler/ir/*.ts` | `from '../../core/ids'` |
| `src/compiler/passes-v2/*.ts` | `from '../../../core/ids'` |
| `src/runtime/*.ts` | `from '../core/ids'` |

### Data Structures Using InstanceId/DomainTypeId

**InstanceRef interface (canonical-types.ts:79-82)**
```typescript
export interface InstanceRef {
  readonly instanceId: InstanceId;      // Already typed correctly
  readonly domainTypeId: DomainTypeId;  // Already typed correctly
}
```

**Step types (types.ts) — DO NOT CHANGE YET**
These will be fixed in C-6 (Sprint 2):
- Line 540: StepMaterialize
- Line 546: StepRender
- Line 587: StepContinuityMapBuild
- Line 598: StepContinuityApply
- Line 681: StateMappingField

### Verification
```bash
# All imports should resolve
npm run typecheck

# Verify core/ids.ts is the authority
grep -rn "Brand<string, 'InstanceId'>" src/
# Should ONLY match core/ids.ts

# Verify no Indices imports remain (except re-exports)
grep -rn "from.*Indices.*InstanceId" src/ | grep -v "export.*from.*core/ids"
# Should return 0 results
```

---

## Testing Strategy

### Unit Tests
Run existing canonical-types test suite:
```bash
npm test -- canonical-types.test.ts
```

### Type Checking
```bash
npm run typecheck
# OR
npx tsc --noEmit
```

### Integration Test
```bash
# Full test suite
npm test
```

---

## Rollback Plan
All changes are non-breaking:
1. C-7: Restore FieldExprArray to union + interface
2. C-3: Revert 'reduceField' → 'reduce_field'
3. C-2: Revert imports, remove InstanceId/DomainTypeId from core/ids.ts

Git provides automatic rollback.

---

## Adjacent Code Patterns

### Example: Existing branded ID usage
```typescript
// From src/core/ids.ts (current)
export type BlockId = Brand<string, 'BlockId'>;
export const blockId = (s: string) => s as BlockId;
```

### Example: Proper import pattern
```typescript
// From src/core/canonical-types.ts (current)
import {
  CardinalityVarId,
  TemporalityVarId,
  BindingVarId,
  PerspectiveVarId,
  BranchVarId
} from './ids';
```

Follow this exact pattern for InstanceId/DomainTypeId.
