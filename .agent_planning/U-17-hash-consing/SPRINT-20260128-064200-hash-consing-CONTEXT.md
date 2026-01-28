# Implementation Context: hash-consing - Expression Deduplication
Generated: 2026-01-28-064200
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260128-064200-hash-consing-PLAN.md
Source: EVALUATION-2026-01-28-064128.md

## Purpose
This file provides exact implementation details for an agent with ONLY this file to successfully implement hash-consing. No background context or architecture overviews—just concrete code locations, patterns, and examples.

---

## File Locations

### Primary Implementation File
**Path**: `src/compiler/ir/IRBuilderImpl.ts`
- **Lines 1-50**: Imports and class declaration with private fields
- **Lines 109-143**: Example builder methods showing current pattern
- **Total file size**: 917 lines
- **Action**: Add cache maps, hash functions, modify ~20 builder methods

### Type Definitions
**Path**: `src/compiler/ir/types.ts`
- **Lines 84-142**: SigExpr union type (11 variants)
- **Lines 109-121**: FieldExpr union type (10 variants)
- **Lines 364-368**: PureFn type definition
- **Action**: Read-only reference (no changes needed)

### Test File (NEW)
**Path**: `src/compiler/ir/__tests__/hash-consing.test.ts`
- **Action**: Create new file with test suite

### Existing Test Reference
**Path**: `src/compiler/__tests__/instance-unification.test.ts`
- **Lines 62-63**: Example of IRBuilderImpl usage pattern
- **Action**: Ensure these tests still pass after changes

---

## Step 1: Add Cache Maps to IRBuilderImpl

**File**: `src/compiler/ir/IRBuilderImpl.ts`
**Location**: After existing private field declarations (around line 40)

### Exact Code to Add

```typescript
// Hash-consing caches for expression deduplication (I13)
private sigExprCache = new Map<string, SigExprId>();
private fieldExprCache = new Map<string, FieldExprId>();
private eventExprCache = new Map<string, EventExprId>();
```

**Why this location**: Group with other private fields like `sigExprs: SigExpr[]` and `fieldExprs: FieldExpr[]`.

**Adjacent pattern to follow** (existing code around line 35-40):
```typescript
private sigExprs: SigExpr[] = [];
private fieldExprs: FieldExpr[] = [];
private eventExprs: EventExpr[] = [];
// ADD YOUR CACHE MAPS HERE
```

---

## Step 2: Implement Hash Functions

**File**: `src/compiler/ir/IRBuilderImpl.ts`
**Location**: Add after class declaration, before export (around line 900)

### Exact Code to Add

```typescript
// Hash-consing utility functions (I13)
// JSON.stringify is sufficient because all expression fields are readonly primitives/arrays
// No circular references, no functions, deterministic order

function hashSigExpr(expr: SigExpr): string {
  return JSON.stringify(expr);
}

function hashFieldExpr(expr: FieldExpr): string {
  return JSON.stringify(expr);
}

function hashEventExpr(expr: EventExpr): string {
  return JSON.stringify(expr);
}
```

**Why this works** (from EVALUATION:289-309):
- All expression types have readonly fields
- No functions or circular references in expression structures
- JSON.stringify produces deterministic output for readonly objects
- Field order is deterministic (readonly class properties)
- Fast enough for compilation (not runtime hot path)

**Import requirements**: None (JSON.stringify is global)

---

## Step 3: Modify SigExpr Builder Methods

**File**: `src/compiler/ir/IRBuilderImpl.ts`
**Methods to modify**: Lines 109-143 and similar patterns throughout the file

### Pattern: Before and After

#### BEFORE (Current Code - Line 109):
```typescript
sigConst(value: number | string | boolean, type: SignalType): SigExprId {
  const id = sigExprId(this.sigExprs.length);
  this.sigExprs.push({ kind: 'const', value, type });
  return id;
}
```

#### AFTER (With Hash-Consing):
```typescript
sigConst(value: number | string | boolean, type: SignalType): SigExprId {
  // Hash-consing (I13): check cache before creating new ID
  const expr = { kind: 'const', value, type } as const;
  const hash = hashSigExpr(expr);
  const existing = this.sigExprCache.get(hash);
  if (existing !== undefined) {
    return existing; // Reuse existing ID
  }
  
  // No cache hit: create new ID
  const id = sigExprId(this.sigExprs.length);
  this.sigExprs.push(expr);
  this.sigExprCache.set(hash, id);
  return id;
}
```

### Apply to These Methods (Search Pattern)

**Search for**: Methods matching `sig.*\(.*\): SigExprId {`

**Methods List** (approximate line numbers, verify with search):
1. `sigConst` (line ~109)
2. `sigSlot` (line ~115)
3. `sigTime` (line ~121)
4. `sigExternal` (line ~127)
5. `sigMap` (line ~133)
6. `sigZip` (line ~140)
7. `sigBinOp` (search for it)
8. `sigUnaryOp` (search for it)
9. `sigShapeRef` (search for it)
10. `sigCombine` (search for it)
11. `sigStateRead` (search for it)
12. `sigReduceField` (search for it)
13. `sigEventRead` (search for it)

### Complex Example: sigBinOp

```typescript
// BEFORE
sigBinOp(left: SigExprId, right: SigExprId, opcode: OpCode, type: SignalType): SigExprId {
  const id = sigExprId(this.sigExprs.length);
  this.sigExprs.push({
    kind: 'binOp',
    left,
    right,
    opcode,
    type
  });
  return id;
}

// AFTER
sigBinOp(left: SigExprId, right: SigExprId, opcode: OpCode, type: SignalType): SigExprId {
  const expr = {
    kind: 'binOp',
    left,
    right,
    opcode,
    type
  } as const;
  const hash = hashSigExpr(expr);
  const existing = this.sigExprCache.get(hash);
  if (existing !== undefined) {
    return existing;
  }
  
  const id = sigExprId(this.sigExprs.length);
  this.sigExprs.push(expr);
  this.sigExprCache.set(hash, id);
  return id;
}
```

---

## Step 4: Modify FieldExpr Builder Methods

**File**: `src/compiler/ir/IRBuilderImpl.ts`

### Same Pattern, Different Cache

**Search for**: Methods matching `field.*\(.*\): FieldExprId {`

**Methods List**:
1. `fieldConst`
2. `fieldIntrinsic`
3. `fieldBroadcast`
4. `fieldMap`
5. `fieldZip`
6. `fieldZipSig`
7. `fieldArray`
8. `fieldPlacement`
9. `fieldStateRead`
10. `fieldPathDerivative`

### Example: fieldConst

```typescript
// AFTER
fieldConst(value: any, type: FieldType): FieldExprId {
  const expr = { kind: 'const', value, type } as const;
  const hash = hashFieldExpr(expr);
  const existing = this.fieldExprCache.get(hash);
  if (existing !== undefined) {
    return existing;
  }
  
  const id = fieldExprId(this.fieldExprs.length);
  this.fieldExprs.push(expr);
  this.fieldExprCache.set(hash, id);
  return id;
}
```

### Example: fieldIntrinsic (with instanceId)

**Important**: instanceId MUST be included in hash (different instances = different expressions)

```typescript
// AFTER
fieldIntrinsic(instanceId: InstanceId, intrinsic: string, type: FieldType): FieldExprId {
  const expr = {
    kind: 'intrinsic',
    instanceId,
    intrinsic,
    type
  } as const;
  const hash = hashFieldExpr(expr);
  const existing = this.fieldExprCache.get(hash);
  if (existing !== undefined) {
    return existing;
  }
  
  const id = fieldExprId(this.fieldExprs.length);
  this.fieldExprs.push(expr);
  this.fieldExprCache.set(hash, id);
  return id;
}
```

### Example: fieldMap (with optional instanceId)

```typescript
// AFTER
fieldMap(
  input: FieldExprId,
  fn: PureFn,
  type: FieldType,
  instanceId?: InstanceId
): FieldExprId {
  const expr = {
    kind: 'map',
    input,
    fn,
    type,
    ...(instanceId !== undefined && { instanceId })
  } as const;
  const hash = hashFieldExpr(expr);
  const existing = this.fieldExprCache.get(hash);
  if (existing !== undefined) {
    return existing;
  }
  
  const id = fieldExprId(this.fieldExprs.length);
  this.fieldExprs.push(expr);
  this.fieldExprCache.set(hash, id);
  return id;
}
```

---

## Step 5: Modify EventExpr Builder Methods

**File**: `src/compiler/ir/IRBuilderImpl.ts`

### Same Pattern, eventExprCache

**Search for**: Methods matching `event.*\(.*\): EventExprId {`

Apply identical pattern using `hashEventExpr` and `this.eventExprCache`.

---

## Step 6: Create Test File

**File**: `src/compiler/ir/__tests__/hash-consing.test.ts` (NEW)

### Complete Test File

```typescript
import { describe, it, expect } from 'vitest';
import { IRBuilderImpl } from '../IRBuilderImpl';
import { signalTypeSignal, fieldTypeField } from '../types';
import { FLOAT } from '../../types/ScalarType';
import { OpCode } from '../../opcodes/OpCode';
import { instanceId } from '../identifiers';

describe('Hash-consing (I13)', () => {
  describe('SigExpr deduplication', () => {
    it('deduplicates identical sigConst', () => {
      const b = new IRBuilderImpl();
      const type = signalTypeSignal(FLOAT);
      
      const id1 = b.sigConst(1.0, type);
      const id2 = b.sigConst(1.0, type);
      
      expect(id1).toBe(id2); // MUST be same ID
    });

    it('distinguishes different sigConst values', () => {
      const b = new IRBuilderImpl();
      const type = signalTypeSignal(FLOAT);
      
      const id1 = b.sigConst(1.0, type);
      const id2 = b.sigConst(2.0, type);
      
      expect(id1).not.toBe(id2);
    });

    it('deduplicates identical sigTime', () => {
      const b = new IRBuilderImpl();
      const type = signalTypeSignal(FLOAT);
      
      const id1 = b.sigTime('tMs', type);
      const id2 = b.sigTime('tMs', type);
      
      expect(id1).toBe(id2);
    });

    it('deduplicates identical sigBinOp', () => {
      const b = new IRBuilderImpl();
      const type = signalTypeSignal(FLOAT);
      
      const a = b.sigConst(2.0, type);
      const b1 = b.sigConst(3.0, type);
      
      const sum1 = b.sigBinOp(a, b1, OpCode.Add, type);
      const sum2 = b.sigBinOp(a, b1, OpCode.Add, type);
      
      expect(sum1).toBe(sum2);
    });
  });

  describe('Compound expression deduplication', () => {
    it('deduplicates transitively', () => {
      const b = new IRBuilderImpl();
      const type = signalTypeSignal(FLOAT);
      
      // Constants deduplicate
      const a = b.sigConst(2.0, type);
      const b1 = b.sigConst(3.0, type);
      const b2 = b.sigConst(3.0, type);
      expect(b1).toBe(b2);
      
      // Operations using deduplicated inputs also deduplicate
      const sum1 = b.sigBinOp(a, b1, OpCode.Add, type);
      const sum2 = b.sigBinOp(a, b2, OpCode.Add, type);
      expect(sum1).toBe(sum2);
    });
  });

  describe('FieldExpr deduplication', () => {
    it('deduplicates identical fieldConst', () => {
      const b = new IRBuilderImpl();
      const type = fieldTypeField(FLOAT);
      
      const id1 = b.fieldConst(1.0, type);
      const id2 = b.fieldConst(1.0, type);
      
      expect(id1).toBe(id2);
    });

    it('deduplicates identical fieldBroadcast', () => {
      const b = new IRBuilderImpl();
      const sigType = signalTypeSignal(FLOAT);
      const fieldType = fieldTypeField(FLOAT);
      
      const sig = b.sigConst(1.0, sigType);
      const id1 = b.fieldBroadcast(sig, fieldType);
      const id2 = b.fieldBroadcast(sig, fieldType);
      
      expect(id1).toBe(id2);
    });

    it('deduplicates fieldIntrinsic with same instanceId', () => {
      const b = new IRBuilderImpl();
      const type = fieldTypeField(FLOAT);
      const inst = instanceId(1);
      
      const id1 = b.fieldIntrinsic(inst, 'index', type);
      const id2 = b.fieldIntrinsic(inst, 'index', type);
      
      expect(id1).toBe(id2);
    });

    it('distinguishes fieldIntrinsic with different instanceIds', () => {
      const b = new IRBuilderImpl();
      const type = fieldTypeField(FLOAT);
      const inst1 = instanceId(1);
      const inst2 = instanceId(2);
      
      const id1 = b.fieldIntrinsic(inst1, 'index', type);
      const id2 = b.fieldIntrinsic(inst2, 'index', type);
      
      expect(id1).not.toBe(id2);
    });
  });

  describe('Edge cases', () => {
    it('handles array order correctly (different order = different expr)', () => {
      const b = new IRBuilderImpl();
      const type = signalTypeSignal(FLOAT);
      
      const a = b.sigConst(1.0, type);
      const b1 = b.sigConst(2.0, type);
      
      const zip1 = b.sigZip([a, b1], { kind: 'opcode', opcode: OpCode.Add }, type);
      const zip2 = b.sigZip([b1, a], { kind: 'opcode', opcode: OpCode.Add }, type);
      
      expect(zip1).not.toBe(zip2); // Order matters
    });

    it('handles PureFn correctly', () => {
      const b = new IRBuilderImpl();
      const type = signalTypeSignal(FLOAT);
      
      const input = b.sigConst(1.0, type);
      const fn = { kind: 'opcode', opcode: OpCode.Sin } as const;
      
      const id1 = b.sigMap(input, fn, type);
      const id2 = b.sigMap(input, fn, type);
      
      expect(id1).toBe(id2);
    });

    it('handles float precision consistently', () => {
      const b = new IRBuilderImpl();
      const type = signalTypeSignal(FLOAT);
      
      const id1 = b.sigConst(1.0, type);
      const id2 = b.sigConst(1.00, type);
      
      expect(id1).toBe(id2); // JS number normalization
    });
  });
});
```

### Import Locations

**IRBuilderImpl**: `src/compiler/ir/IRBuilderImpl.ts`
**Types**: `src/compiler/ir/types.ts` (signalTypeSignal, fieldTypeField)
**FLOAT**: `src/compiler/types/ScalarType.ts`
**OpCode**: `src/compiler/opcodes/OpCode.ts`
**instanceId**: `src/compiler/ir/identifiers.ts`

### Test Framework

**Framework**: Vitest (import from 'vitest')
**Pattern**: `describe`, `it`, `expect`
**Existing pattern**: See `src/compiler/__tests__/instance-unification.test.ts` for reference

---

## Step 7: Run Tests

### Command
```bash
npm test src/compiler/ir/__tests__/hash-consing.test.ts
```

### Expected Output
All tests should pass. If any fail:
- Check that hash function is applied consistently
- Verify cache is being checked before allocation
- Ensure expression objects include all fields (especially optional ones)

### Regression Check
```bash
npm test src/compiler/
```

All existing tests should continue to pass. Hash-consing is optimization only—no behavior changes.

---

## Verification Checklist

After implementation, verify:

1. **Code Completeness**:
   - [ ] Cache maps added to IRBuilderImpl
   - [ ] Hash functions implemented (3 functions)
   - [ ] All ~20 builder methods modified consistently
   - [ ] Test file created with all scenarios

2. **Functional Correctness**:
   - [ ] Identical expressions return same ID
   - [ ] Different expressions return different IDs
   - [ ] Compound expressions deduplicate transitively
   - [ ] Optional fields handled correctly

3. **No Regressions**:
   - [ ] All existing tests pass
   - [ ] No TypeScript errors
   - [ ] No runtime errors in existing code paths

4. **Edge Cases**:
   - [ ] Array order preserved
   - [ ] instanceId correctly distinguished
   - [ ] PureFn variants hash correctly
   - [ ] Float precision handled

---

## Common Pitfalls

### Pitfall 1: Forgetting to Cache After Creation
**Wrong**:
```typescript
const id = sigExprId(this.sigExprs.length);
this.sigExprs.push(expr);
return id;
// Missing: this.sigExprCache.set(hash, id);
```

**Right**:
```typescript
const id = sigExprId(this.sigExprs.length);
this.sigExprs.push(expr);
this.sigExprCache.set(hash, id);  // MUST cache
return id;
```

### Pitfall 2: Hashing Before Including All Fields
**Wrong**:
```typescript
const hash = hashSigExpr({ kind: 'const', value });  // Missing type!
```

**Right**:
```typescript
const expr = { kind: 'const', value, type };
const hash = hashSigExpr(expr);
```

### Pitfall 3: Using Wrong Cache
**Wrong**:
```typescript
fieldConst(...) {
  const hash = hashFieldExpr(expr);
  const existing = this.sigExprCache.get(hash);  // Wrong cache!
}
```

**Right**:
```typescript
fieldConst(...) {
  const hash = hashFieldExpr(expr);
  const existing = this.fieldExprCache.get(hash);  // Correct cache
}
```

### Pitfall 4: Omitting Optional Fields from Hash
**Wrong**:
```typescript
const expr = { kind: 'map', input, fn, type };  // instanceId omitted!
```

**Right**:
```typescript
const expr = {
  kind: 'map',
  input,
  fn,
  type,
  ...(instanceId !== undefined && { instanceId })
};
```

---

## Performance Notes

**Hash Lookup Overhead**: O(1) amortized, negligible for compilation
**Memory Usage**: Map overhead is small (<1KB for typical patches)
**Expected Deduplication**: 30-50% reduction in expression count
**Bottleneck**: Not expected. JSON.stringify is fast for small objects.

If profiling shows hash lookup is slow (unlikely):
- Consider custom hash with explicit field concatenation
- Do NOT optimize prematurely

---

## Debugging Tips

### If Deduplication Doesn't Work

1. **Add logging to verify cache hits**:
   ```typescript
   const existing = this.sigExprCache.get(hash);
   if (existing !== undefined) {
     console.log('CACHE HIT:', hash);
     return existing;
   }
   console.log('CACHE MISS:', hash);
   ```

2. **Inspect hash strings**:
   ```typescript
   console.log('Hash:', hash);
   // Should be identical for identical expressions
   ```

3. **Check expression object**:
   ```typescript
   console.log('Expr:', JSON.stringify(expr, null, 2));
   // Verify all fields are included
   ```

### If Tests Fail

1. Verify imports are correct
2. Check that expression object matches type definition exactly
3. Ensure cache map is initialized (not undefined)
4. Verify hash function is being called

---

## Final Implementation Order

1. Add cache maps to IRBuilderImpl (Step 1)
2. Add hash functions (Step 2)
3. Modify 1-2 simple methods (sigConst, fieldConst) as proof of concept
4. Run basic test to verify pattern works
5. Modify remaining methods systematically
6. Create comprehensive test file
7. Run full test suite
8. Verify no regressions

**Estimated Time**: 2-4 hours for experienced TypeScript developer

---

## Success Criteria

✅ All tests pass
✅ No regressions in existing tests
✅ Identical expressions share ExprIds
✅ Different expressions have different ExprIds
✅ Code is consistent across all builder methods
✅ Performance is neutral or better

**Ready for merge when all criteria met.**
