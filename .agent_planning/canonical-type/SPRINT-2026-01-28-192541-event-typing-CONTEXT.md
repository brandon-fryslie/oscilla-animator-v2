# Implementation Context: event-typing

## Overview
Add type: CanonicalType to all EventExpr variants with hard invariant enforcement (payload=bool, unit=none, temporality=discrete), and fix string → InstanceId leakage in 6 Step types.

---

## C-1: Add type: CanonicalType to EventExpr

### Files to Modify

1. **src/compiler/ir/types.ts** (add type field to 5 interfaces)
2. **src/core/canonical-types.ts** (add eventType helper)
3. **All EventExpr construction sites** (~30 files, TypeScript will identify them)
4. **src/core/__tests__/canonical-types.test.ts** (add invariant tests)

---

### Step 1: Add Helper Function

**File**: `src/core/canonical-types.ts`

**Location**: Insert after existing helper functions (e.g., after unifyTypes, before end of file)

```typescript
/**
 * Create a CanonicalType for event expressions.
 * HARD INVARIANTS (enforced by axis validation):
 * - payload.kind === 'bool' (events are fired/not-fired)
 * - unit.kind === 'none' (events are dimensionless)
 * - extent.temporality === 'discrete' (events fire at instants)
 * 
 * @param cardinality - Can be 'one' or 'many(instance)' for per-instance events
 */
export function eventType(cardinality: CardinalityAxis): CanonicalType {
  return {
    payload: { kind: 'bool' },
    unit: { kind: 'none' },
    extent: {
      cardinality,
      temporality: { kind: 'inst', value: { kind: 'discrete' } },
      binding: { kind: 'inst', value: { kind: 'unbound' } },
      perspective: { kind: 'inst', value: { kind: 'default' } },
      branch: { kind: 'inst', value: { kind: 'main' } }
    }
  };
}
```

**Import additions** (if not already present):
```typescript
import { CanonicalType, CardinalityAxis } from './canonical-types';
```

---

### Step 2: Update EventExpr Interfaces

**File**: `src/compiler/ir/types.ts`

**Import addition** (add to existing imports at top of file):
```typescript
import type { CanonicalType } from '../../core/canonical-types';
```

**Location 1: Lines 330-333 (EventExprConst)**
```typescript
// BEFORE
export interface EventExprConst {
  readonly kind: 'const';
  readonly fired: boolean;
}

// AFTER
export interface EventExprConst {
  readonly kind: 'const';
  readonly type: CanonicalType;  // <-- ADD
  readonly fired: boolean;
}
```

**Location 2: Lines 335-338 (EventExprPulse)**
```typescript
// BEFORE
export interface EventExprPulse {
  readonly kind: 'pulse';
  readonly condition: SigExpr;
}

// AFTER
export interface EventExprPulse {
  readonly kind: 'pulse';
  readonly type: CanonicalType;  // <-- ADD
  readonly condition: SigExpr;
}
```

**Location 3: Lines 340-345 (EventExprWrap)**
```typescript
// BEFORE
export interface EventExprWrap {
  readonly kind: 'wrap';
  readonly wrappedSig: SigExpr;
  readonly state: StateSlotId;
  readonly initValue: number;
}

// AFTER
export interface EventExprWrap {
  readonly kind: 'wrap';
  readonly type: CanonicalType;  // <-- ADD
  readonly wrappedSig: SigExpr;
  readonly state: StateSlotId;
  readonly initValue: number;
}
```

**Location 4: Lines 347-350 (EventExprCombine)**
```typescript
// BEFORE
export interface EventExprCombine {
  readonly kind: 'combine';
  readonly inputs: readonly EventExpr[];
}

// AFTER
export interface EventExprCombine {
  readonly kind: 'combine';
  readonly type: CanonicalType;  // <-- ADD
  readonly inputs: readonly EventExpr[];
}
```

**Location 5: Lines 352-354 (EventExprNever)**
```typescript
// BEFORE
export interface EventExprNever {
  readonly kind: 'never';
}

// AFTER
export interface EventExprNever {
  readonly kind: 'never';
  readonly type: CanonicalType;  // <-- ADD
}
```

---

### Step 3: Find and Update Construction Sites

**Search command:**
```bash
# Find all EventExpr construction sites
grep -rn "kind: 'const'\|kind: 'pulse'\|kind: 'wrap'\|kind: 'combine'\|kind: 'never'" src/ | grep -E "Event|event"
```

**Typical locations** (estimate 30+ sites):
- `src/compiler/ir-builder/` — IR builder creates EventExpr nodes
- `src/compiler/passes-v2/` — Normalization/transform passes
- `src/__tests__/` — Test fixtures
- `src/runtime/` — If any runtime code creates events

**Pattern for each construction site:**

```typescript
// BEFORE (will cause TypeScript error after Step 2)
const expr: EventExprConst = {
  kind: 'const',
  fired: true
};

// AFTER (add type field)
import { eventType } from '../../core/canonical-types';
import { cardinalityOne } from '../../core/canonical-types'; // or create inline

const expr: EventExprConst = {
  kind: 'const',
  type: eventType({ kind: 'inst', value: { kind: 'one' } }),  // <-- ADD
  fired: true
};
```

**Helper for common cardinalities:**
```typescript
// For cardinality=one (most common)
const cardOne: CardinalityAxis = { kind: 'inst', value: { kind: 'one' } };

// For per-instance events (cardinality=many)
import { instanceId, domainTypeId } from '../../core/ids';
const cardMany: CardinalityAxis = {
  kind: 'inst',
  value: {
    kind: 'many',
    instance: {
      instanceId: instanceId('inst_123'),
      domainTypeId: domainTypeId('domain_foo')
    }
  }
};
```

**Strategy**: After Step 2, run TypeScript compiler. It will identify ALL construction sites that need updating:
```bash
npm run typecheck 2>&1 | grep EventExpr
```

---

### Step 4: Add Invariant Tests

**File**: `src/core/__tests__/canonical-types.test.ts`

**Location**: Add new describe block at end of file (before final closing brace)

```typescript
describe('EventExpr Type Invariants', () => {
  test('eventType helper creates valid event type', () => {
    const cardOne: CardinalityAxis = {
      kind: 'inst',
      value: { kind: 'one' }
    };
    const type = eventType(cardOne);

    expect(type.payload.kind).toBe('bool');
    expect(type.unit.kind).toBe('none');
    expect(type.extent.temporality).toEqual({
      kind: 'inst',
      value: { kind: 'discrete' }
    });
  });

  test('EventExprConst satisfies invariants', () => {
    const cardOne: CardinalityAxis = {
      kind: 'inst',
      value: { kind: 'one' }
    };
    const expr: EventExprConst = {
      kind: 'const',
      type: eventType(cardOne),
      fired: true
    };

    expect(expr.type.payload.kind).toBe('bool');
    expect(expr.type.unit.kind).toBe('none');
    expect(expr.type.extent.temporality.kind).toBe('inst');
    if (expr.type.extent.temporality.kind === 'inst') {
      expect(expr.type.extent.temporality.value.kind).toBe('discrete');
    }
  });

  test('Per-instance events use cardinality=many', () => {
    import { instanceId, domainTypeId } from '../../core/ids';
    const cardMany: CardinalityAxis = {
      kind: 'inst',
      value: {
        kind: 'many',
        instance: {
          instanceId: instanceId('inst_test'),
          domainTypeId: domainTypeId('domain_test')
        }
      }
    };
    const type = eventType(cardMany);

    expect(type.extent.cardinality.kind).toBe('inst');
    if (type.extent.cardinality.kind === 'inst') {
      expect(type.extent.cardinality.value.kind).toBe('many');
    }
  });

  // Add similar tests for EventExprPulse, EventExprWrap, EventExprCombine, EventExprNever
});
```

**Import additions** (add to top of test file):
```typescript
import { eventType } from '../canonical-types';
import type { EventExprConst, EventExprPulse, EventExprWrap, EventExprCombine, EventExprNever } from '../../compiler/ir/types';
```

---

## C-6: Fix string → InstanceId Leakage

### Files to Modify

1. **src/compiler/ir/types.ts** (6 interface changes)
2. **All construction sites for these Step types** (TypeScript will identify)

---

### Step 1: Update Type Definitions

**File**: `src/compiler/ir/types.ts`

**Import addition** (add to existing imports, if not already present from C-1):
```typescript
import { InstanceId } from '../../core/ids';
```

**Location 1: Line 435 (InstanceDecl)**
```typescript
// BEFORE
export interface InstanceDecl {
  readonly id: string; // InstanceId
  // ...
}

// AFTER
export interface InstanceDecl {
  readonly id: InstanceId;  // <-- CHANGE
  // ...
}
```

**Location 2: Line 540 (StepMaterialize)**
```typescript
// BEFORE
export interface StepMaterialize {
  readonly kind: 'materialize';
  readonly instanceId: string;
  // ...
}

// AFTER
export interface StepMaterialize {
  readonly kind: 'materialize';
  readonly instanceId: InstanceId;  // <-- CHANGE
  // ...
}
```

**Location 3: Line 546 (StepRender)**
```typescript
// BEFORE
export interface StepRender {
  readonly kind: 'render';
  readonly instanceId: string;
  // ...
}

// AFTER
export interface StepRender {
  readonly kind: 'render';
  readonly instanceId: InstanceId;  // <-- CHANGE
  // ...
}
```

**Location 4: Line 587 (StepContinuityMapBuild)**
```typescript
// BEFORE
export interface StepContinuityMapBuild {
  readonly kind: 'continuity-map-build';
  readonly instanceId: string;
  // ...
}

// AFTER
export interface StepContinuityMapBuild {
  readonly kind: 'continuity-map-build';
  readonly instanceId: InstanceId;  // <-- CHANGE
  // ...
}
```

**Location 5: Line 598 (StepContinuityApply)**
```typescript
// BEFORE
export interface StepContinuityApply {
  readonly kind: 'continuity-apply';
  readonly instanceId: string;
  // ...
}

// AFTER
export interface StepContinuityApply {
  readonly kind: 'continuity-apply';
  readonly instanceId: InstanceId;  // <-- CHANGE
  // ...
}
```

**Location 6: Line 681 (StateMappingField)**
```typescript
// BEFORE
export interface StateMappingField {
  readonly instanceId: string;
  // ...
}

// AFTER
export interface StateMappingField {
  readonly instanceId: InstanceId;  // <-- CHANGE
  // ...
}
```

---

### Step 2: Find and Update Construction Sites

**Search command:**
```bash
# Find construction sites for these Step types
grep -rn "kind: 'materialize'\|kind: 'render'\|kind: 'continuity-map-build'\|kind: 'continuity-apply'" src/
grep -rn "StateMappingField" src/
grep -rn "InstanceDecl" src/ | grep -v "interface\|import"
```

**Pattern for each construction site:**

```typescript
// BEFORE (will cause TypeScript error after Step 1)
const step: StepMaterialize = {
  kind: 'materialize',
  instanceId: 'inst_123',  // <-- type error
  // ...
};

// AFTER (use instanceId factory)
import { instanceId } from '../../core/ids';

const step: StepMaterialize = {
  kind: 'materialize',
  instanceId: instanceId('inst_123'),  // <-- properly branded
  // ...
};
```

**Strategy**: After Step 1, run TypeScript compiler to identify ALL sites:
```bash
npm run typecheck 2>&1 | grep -E "instanceId|InstanceDecl"
```

**Common patterns**:
```typescript
// Existing code with instanceId from elsewhere
const inst = someInstance.id;  // Already InstanceId type
const step: StepMaterialize = {
  kind: 'materialize',
  instanceId: inst,  // No change needed if already typed
  // ...
};

// String literal needs wrapping
const step: StepMaterialize = {
  kind: 'materialize',
  instanceId: instanceId('literal_value'),  // Wrap with factory
  // ...
};

// Variables need conversion
const idString = 'inst_foo';
const step: StepMaterialize = {
  kind: 'materialize',
  instanceId: instanceId(idString),  // Convert
  // ...
};
```

---

## Verification

### TypeScript Compilation
```bash
npm run typecheck
# Should have ZERO errors
```

### Unit Tests
```bash
npm test -- canonical-types.test.ts
# All EventExpr invariant tests should pass
```

### Full Test Suite
```bash
npm test
# All tests should pass
```

### Grep Verification
```bash
# Should return 0 results for EventExpr without type field
grep -A 3 "interface EventExpr" src/compiler/ir/types.ts | grep -v "type: CanonicalType"

# Should return 0 results for instanceId: string in Step types
grep -n "instanceId: string" src/compiler/ir/types.ts
```

---

## Adjacent Code Patterns

### Existing CanonicalType usage in types.ts
```typescript
// From SigExpr (already has type field)
export interface SigExprConst {
  readonly kind: 'const';
  readonly type: CanonicalType;  // <-- EventExpr should match this pattern
  readonly value: number | string | boolean;
}
```

### Existing branded ID usage
```typescript
// From FieldExprIntrinsic (already uses InstanceId correctly)
export interface FieldExprIntrinsic {
  readonly kind: 'intrinsic';
  readonly instanceId: InstanceId;  // <-- Step types should match this pattern
  // ...
}
```

Follow these exact patterns for EventExpr and Step types.
