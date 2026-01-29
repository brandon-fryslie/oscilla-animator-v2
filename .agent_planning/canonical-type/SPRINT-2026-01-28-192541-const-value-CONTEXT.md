# Implementation Context: const-value

## Overview
Replace loose `value: number | string | boolean` with strongly-typed ConstValue discriminated union. This enforces Invariant I5 (const literal shape matches payload) at compile time and runtime.

---

## Files to Modify

1. **src/core/canonical-types.ts** (or src/compiler/ir/types.ts) — add ConstValue type
2. **src/compiler/ir/types.ts** — update SigExprConst and FieldExprConst
3. **All const construction sites** (~40 files, TypeScript will identify)
4. **src/compiler/passes-v2/axis-enforcement.ts** — add ConstValue validation
5. **src/compiler/passes-v2/__tests__/axis-enforcement.test.ts** — add tests
6. **src/core/__tests__/canonical-types.test.ts** — add constValueMatchesPayload tests

---

## Step 1: Define ConstValue Type

**File**: `src/core/canonical-types.ts` (recommended) OR `src/compiler/ir/types.ts`

**Location**: After CanonicalType definition, before helper functions

```typescript
/**
 * Strongly-typed constant value representation.
 * 
 * INVARIANT I5 (15-FiveAxesTypeSystem-Conclusion.md:95-99):
 * ConstValue.kind MUST match CanonicalType.payload.kind
 * 
 * Enforcement:
 * 1. Compile time: TypeScript prevents wrong value types
 * 2. Runtime: Axis enforcement validates kind matches payload
 * 
 * Tuple values are readonly to prevent mutation and maintain
 * CanonicalType immutability contract.
 * 
 * @see constValueMatchesPayload for validation helper
 */
export type ConstValue =
  | { readonly kind: 'float'; readonly value: number }
  | { readonly kind: 'int'; readonly value: number }
  | { readonly kind: 'bool'; readonly value: boolean }
  | { readonly kind: 'vec2'; readonly value: readonly [number, number] }
  | { readonly kind: 'vec3'; readonly value: readonly [number, number, number] }
  | { readonly kind: 'color'; readonly value: readonly [number, number, number, number] }
  | { readonly kind: 'cameraProjection'; readonly value: string };

/**
 * Validate that ConstValue.kind matches PayloadType.kind.
 * 
 * Used by axis enforcement pass to catch payload mismatches at runtime.
 * 
 * @returns true if kinds match, false otherwise
 * 
 * @example
 * const payload: PayloadType = { kind: 'float' };
 * const value: ConstValue = { kind: 'float', value: 42.0 };
 * constValueMatchesPayload(payload, value); // true
 * 
 * const wrongValue: ConstValue = { kind: 'vec2', value: [1, 2] };
 * constValueMatchesPayload(payload, wrongValue); // false
 */
export function constValueMatchesPayload(
  payload: PayloadType,
  constValue: ConstValue
): boolean {
  return payload.kind === constValue.kind;
}
```

**Import additions**:
```typescript
// If ConstValue is in canonical-types.ts
export type { ConstValue } from './canonical-types';
export { constValueMatchesPayload } from './canonical-types';

// PayloadType should already be defined/imported
import type { PayloadType } from './canonical-types';
```

---

## Step 2: Optional Helper Functions (Recommended)

**File**: Same file as ConstValue definition

**Location**: After constValueMatchesPayload

```typescript
/**
 * Helper constructors for common ConstValue types.
 * These make construction sites more concise.
 */

export function floatConst(value: number): ConstValue {
  return { kind: 'float', value };
}

export function intConst(value: number): ConstValue {
  return { kind: 'int', value };
}

export function boolConst(value: boolean): ConstValue {
  return { kind: 'bool', value };
}

export function vec2Const(x: number, y: number): ConstValue {
  return { kind: 'vec2', value: [x, y] as const };
}

export function vec3Const(x: number, y: number, z: number): ConstValue {
  return { kind: 'vec3', value: [x, y, z] as const };
}

export function colorConst(r: number, g: number, b: number, a: number): ConstValue {
  return { kind: 'color', value: [r, g, b, a] as const };
}

export function cameraProjectionConst(value: string): ConstValue {
  return { kind: 'cameraProjection', value };
}
```

---

## Step 3: Update Expression Interfaces

**File**: `src/compiler/ir/types.ts`

**Import addition** (if ConstValue is in canonical-types.ts):
```typescript
import type { CanonicalType, ConstValue } from '../../core/canonical-types';
```

**Location 1: Line ~98 (SigExprConst)**
```typescript
// BEFORE
export interface SigExprConst {
  readonly kind: 'const';
  readonly type: CanonicalType;
  readonly value: number | string | boolean;  // <-- REPLACE
}

// AFTER
export interface SigExprConst {
  readonly kind: 'const';
  readonly type: CanonicalType;
  readonly value: ConstValue;  // <-- NEW
}
```

**Location 2: Line ~225-230 (FieldExprConst)**
```typescript
// BEFORE
export interface FieldExprConst {
  readonly kind: 'const';
  readonly type: CanonicalType;
  readonly value: number | string | boolean;  // <-- REPLACE
}

// AFTER
export interface FieldExprConst {
  readonly kind: 'const';
  readonly type: CanonicalType;
  readonly value: ConstValue;  // <-- NEW
}
```

---

## Step 4: Find and Update Construction Sites

**After Step 3, TypeScript will error at all construction sites.**

**Search commands:**
```bash
# Find SigExprConst construction
grep -rn "kind: 'const'" src/ | grep -i sig

# Find FieldExprConst construction
grep -rn "kind: 'const'" src/ | grep -i field

# Find generic const construction
grep -rn "readonly value:" src/compiler/ir/
```

**TypeScript will identify all sites:**
```bash
npm run typecheck 2>&1 | grep -E "SigExprConst|FieldExprConst|value"
```

**Common patterns:**

### Pattern 1: Numeric constant (float)
```typescript
// BEFORE
const expr: SigExprConst = {
  kind: 'const',
  type: floatType,
  value: 42.0  // Raw number
};

// AFTER
import { floatConst } from '../../core/canonical-types';
const expr: SigExprConst = {
  kind: 'const',
  type: floatType,
  value: floatConst(42.0)  // Wrapped
};

// OR inline:
const expr: SigExprConst = {
  kind: 'const',
  type: floatType,
  value: { kind: 'float', value: 42.0 }
};
```

### Pattern 2: Boolean constant
```typescript
// BEFORE
const expr: SigExprConst = {
  kind: 'const',
  type: boolType,
  value: true  // Raw boolean
};

// AFTER
import { boolConst } from '../../core/canonical-types';
const expr: SigExprConst = {
  kind: 'const',
  type: boolType,
  value: boolConst(true)
};
```

### Pattern 3: Vec2 constant
```typescript
// BEFORE
const expr: SigExprConst = {
  kind: 'const',
  type: vec2Type,
  value: [1.0, 2.0]  // Raw array (WRONG TYPE)
};

// AFTER
import { vec2Const } from '../../core/canonical-types';
const expr: SigExprConst = {
  kind: 'const',
  type: vec2Type,
  value: vec2Const(1.0, 2.0)
};

// OR inline:
const expr: SigExprConst = {
  kind: 'const',
  type: vec2Type,
  value: { kind: 'vec2', value: [1.0, 2.0] as const }
};
```

### Pattern 4: Dynamic value (inspect payload.kind)
```typescript
// BEFORE
function createConst(type: CanonicalType, rawValue: any): SigExprConst {
  return {
    kind: 'const',
    type,
    value: rawValue  // Unsafe
  };
}

// AFTER
function createConst(type: CanonicalType, rawValue: any): SigExprConst {
  const constValue = convertToConstValue(type.payload, rawValue);
  return {
    kind: 'const',
    type,
    value: constValue
  };
}

function convertToConstValue(payload: PayloadType, rawValue: any): ConstValue {
  switch (payload.kind) {
    case 'float':
      return { kind: 'float', value: Number(rawValue) };
    case 'int':
      return { kind: 'int', value: Math.floor(Number(rawValue)) };
    case 'bool':
      return { kind: 'bool', value: Boolean(rawValue) };
    case 'vec2':
      const [x, y] = rawValue;
      return { kind: 'vec2', value: [x, y] as const };
    case 'vec3':
      const [x3, y3, z] = rawValue;
      return { kind: 'vec3', value: [x3, y3, z] as const };
    case 'color':
      const [r, g, b, a] = rawValue;
      return { kind: 'color', value: [r, g, b, a] as const };
    case 'cameraProjection':
      return { kind: 'cameraProjection', value: String(rawValue) };
    default:
      throw new Error(`Unknown payload kind: ${(payload as any).kind}`);
  }
}
```

**Estimate**: 40+ construction sites in:
- `src/compiler/ir-builder/` (IR construction)
- `src/compiler/passes-v2/` (normalization, optimization)
- `src/__tests__/` (test fixtures)
- `src/runtime/` (if runtime creates const expressions)

---

## Step 5: Integrate with Axis Enforcement

**File**: `src/compiler/passes-v2/axis-enforcement.ts`

**Import addition**:
```typescript
import { constValueMatchesPayload } from '../../core/canonical-types';
```

**Location**: In validateAxes function, add new check after existing checks

```typescript
export function validateAxes(patch: TypedPatch): AxisInvalidDiagnostic[] {
  const diagnostics: AxisInvalidDiagnostic[] = [];

  // ... existing EventExpr, SigExpr, FieldExpr checks ...

  // NEW: Check ConstValue matches payload
  const constExprs = [
    ...findAllConstSigExpr(patch),
    ...findAllConstFieldExpr(patch)
  ];

  for (const expr of constExprs) {
    if (expr.kind === 'const') {
      const payload = expr.type.payload;
      const value = expr.value;
      
      if (!constValueMatchesPayload(payload, value)) {
        diagnostics.push({
          kind: 'AxisInvalid',
          location: getExprLocation(expr),
          reason: 'Const value kind must match payload kind (Invariant I5)',
          expressionKind: 'SigExprConst' or 'FieldExprConst',  // Derive from expr
          violation: `value.kind=${value.kind}, payload.kind=${payload.kind}`
        });
      }
    }
  }

  return diagnostics;
}

// Helper functions
function findAllConstSigExpr(patch: TypedPatch): SigExprConst[] {
  return patch.signals.filter(
    (expr): expr is SigExprConst => expr.kind === 'const'
  );
}

function findAllConstFieldExpr(patch: TypedPatch): FieldExprConst[] {
  return patch.fields.filter(
    (expr): expr is FieldExprConst => expr.kind === 'const'
  );
}
```

---

## Step 6: Add Tests

### File 1: Axis Enforcement Tests

**File**: `src/compiler/passes-v2/__tests__/axis-enforcement.test.ts`

**Location**: Add new describe block after existing tests

```typescript
describe('Axis Enforcement: ConstValue Payload Matching', () => {
  test('Float const with float payload passes', () => {
    const expr: SigExprConst = {
      kind: 'const',
      type: {
        payload: { kind: 'float' },
        unit: { kind: 'none' },
        extent: defaultExtent()  // Helper for standard extent
      },
      value: { kind: 'float', value: 42.0 }
    };
    const patch: TypedPatch = { events: [], signals: [expr], fields: [] };

    const diagnostics = validateAxes(patch);
    expect(diagnostics).toHaveLength(0);
  });

  test('Bool const with bool payload passes', () => {
    const expr: SigExprConst = {
      kind: 'const',
      type: {
        payload: { kind: 'bool' },
        unit: { kind: 'none' },
        extent: defaultExtent()
      },
      value: { kind: 'bool', value: true }
    };
    const patch: TypedPatch = { events: [], signals: [expr], fields: [] };

    const diagnostics = validateAxes(patch);
    expect(diagnostics).toHaveLength(0);
  });

  test('Vec2 const with vec2 payload passes', () => {
    const expr: SigExprConst = {
      kind: 'const',
      type: {
        payload: { kind: 'vec2' },
        unit: { kind: 'none' },
        extent: defaultExtent()
      },
      value: { kind: 'vec2', value: [1.0, 2.0] as const }
    };
    const patch: TypedPatch = { events: [], signals: [expr], fields: [] };

    const diagnostics = validateAxes(patch);
    expect(diagnostics).toHaveLength(0);
  });

  test('Float const with vec2 payload fails', () => {
    const expr: SigExprConst = {
      kind: 'const',
      type: {
        payload: { kind: 'vec2' },  // Expects vec2
        unit: { kind: 'none' },
        extent: defaultExtent()
      },
      value: { kind: 'float', value: 42.0 }  // MISMATCH
    };
    const patch: TypedPatch = { events: [], signals: [expr], fields: [] };

    const diagnostics = validateAxes(patch);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].kind).toBe('AxisInvalid');
    expect(diagnostics[0].reason).toContain('Const value kind must match payload kind');
    expect(diagnostics[0].violation).toBe('value.kind=float, payload.kind=vec2');
  });

  test('Vec2 const with float payload fails', () => {
    const expr: SigExprConst = {
      kind: 'const',
      type: {
        payload: { kind: 'float' },  // Expects float
        unit: { kind: 'none' },
        extent: defaultExtent()
      },
      value: { kind: 'vec2', value: [1.0, 2.0] as const }  // MISMATCH
    };
    const patch: TypedPatch = { events: [], signals: [expr], fields: [] };

    const diagnostics = validateAxes(patch);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].kind).toBe('AxisInvalid');
    expect(diagnostics[0].violation).toBe('value.kind=vec2, payload.kind=float');
  });

  test('Int const with bool payload fails', () => {
    const expr: SigExprConst = {
      kind: 'const',
      type: {
        payload: { kind: 'bool' },
        unit: { kind: 'none' },
        extent: defaultExtent()
      },
      value: { kind: 'int', value: 1 }  // MISMATCH
    };
    const patch: TypedPatch = { events: [], signals: [expr], fields: [] };

    const diagnostics = validateAxes(patch);
    expect(diagnostics).toHaveLength(1);
  });

  // Add tests for: vec3, color, cameraProjection
});

// Helper for default extent
function defaultExtent(): Extent {
  return {
    cardinality: { kind: 'inst', value: { kind: 'one' } },
    temporality: { kind: 'inst', value: { kind: 'continuous' } },
    binding: { kind: 'inst', value: { kind: 'unbound' } },
    perspective: { kind: 'inst', value: { kind: 'default' } },
    branch: { kind: 'inst', value: { kind: 'main' } }
  };
}
```

### File 2: ConstValue Unit Tests

**File**: `src/core/__tests__/canonical-types.test.ts`

**Location**: Add new describe block after existing tests

```typescript
describe('constValueMatchesPayload', () => {
  test('float value matches float payload', () => {
    const payload: PayloadType = { kind: 'float' };
    const value: ConstValue = { kind: 'float', value: 42.0 };
    
    expect(constValueMatchesPayload(payload, value)).toBe(true);
  });

  test('float value does not match vec2 payload', () => {
    const payload: PayloadType = { kind: 'vec2' };
    const value: ConstValue = { kind: 'float', value: 42.0 };
    
    expect(constValueMatchesPayload(payload, value)).toBe(false);
  });

  test('bool value matches bool payload', () => {
    const payload: PayloadType = { kind: 'bool' };
    const value: ConstValue = { kind: 'bool', value: true };
    
    expect(constValueMatchesPayload(payload, value)).toBe(true);
  });

  test('vec2 value matches vec2 payload', () => {
    const payload: PayloadType = { kind: 'vec2' };
    const value: ConstValue = { kind: 'vec2', value: [1.0, 2.0] as const };
    
    expect(constValueMatchesPayload(payload, value)).toBe(true);
  });

  test('vec3 value matches vec3 payload', () => {
    const payload: PayloadType = { kind: 'vec3' };
    const value: ConstValue = { kind: 'vec3', value: [1.0, 2.0, 3.0] as const };
    
    expect(constValueMatchesPayload(payload, value)).toBe(true);
  });

  test('color value matches color payload', () => {
    const payload: PayloadType = { kind: 'color' };
    const value: ConstValue = { kind: 'color', value: [1.0, 0.5, 0.0, 1.0] as const };
    
    expect(constValueMatchesPayload(payload, value)).toBe(true);
  });

  test('cameraProjection value matches cameraProjection payload', () => {
    const payload: PayloadType = { kind: 'cameraProjection' };
    const value: ConstValue = { kind: 'cameraProjection', value: 'perspective' };
    
    expect(constValueMatchesPayload(payload, value)).toBe(true);
  });
});

describe('ConstValue immutability', () => {
  test('vec2 tuple is readonly', () => {
    const value: ConstValue = { kind: 'vec2', value: [1.0, 2.0] as const };
    
    // TypeScript should prevent mutation
    // Uncomment to verify:
    // @ts-expect-error — readonly tuple
    // value.value[0] = 99.0;
    
    expect(value.value).toEqual([1.0, 2.0]);
  });

  test('vec3 tuple is readonly', () => {
    const value: ConstValue = { kind: 'vec3', value: [1.0, 2.0, 3.0] as const };
    expect(value.value).toEqual([1.0, 2.0, 3.0]);
  });

  test('color tuple is readonly', () => {
    const value: ConstValue = { kind: 'color', value: [1.0, 0.5, 0.0, 1.0] as const };
    expect(value.value).toEqual([1.0, 0.5, 0.0, 1.0]);
  });
});
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
npm test -- axis-enforcement.test.ts
```

### Full Test Suite
```bash
npm test
# All tests should pass
```

### Grep Verification
```bash
# Should return 0 results for raw value assignments in const expressions
grep -rn "value: [0-9]" src/compiler/ir/ | grep -E "SigExprConst|FieldExprConst"
```

---

## Adjacent Code Patterns

### Existing discriminated unions (for reference)
```typescript
// From CanonicalType (existing pattern)
export type PayloadType =
  | { readonly kind: 'float' }
  | { readonly kind: 'int' }
  | { readonly kind: 'bool' }
  | { readonly kind: 'vec2' }
  | { readonly kind: 'vec3' }
  | { readonly kind: 'color' }
  | { readonly kind: 'cameraProjection' };
```

ConstValue follows this exact pattern with added value field.

### Existing const expression (for reference)
```typescript
// SigExpr (already has type field)
export interface SigExprConst {
  readonly kind: 'const';
  readonly type: CanonicalType;  // <-- Follow this pattern
  readonly value: ConstValue;    // <-- Add ConstValue
}
```

ConstValue completes the type safety for const expressions.
