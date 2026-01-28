# Implementation Context: unit-system

**Sprint**: unit-system - Unit Type System Foundation
**Generated**: 2026-01-22-120534
**Confidence**: HIGH

## Overview

This sprint replaces the current optional `unit?: NumericUnit` annotation in CanonicalType with a mandatory Unit discriminated union as specified in 0-Units-and-Adapters.md. This is the foundation for the adapter system and enables compile-time prevention of semantic type errors (connecting phase values to radian inputs, etc.).

## Key Files to Modify

### 1. Core Type System

**File**: `src/core/canonical-types.ts` (629 lines)

**Current State**:
- Lines 23-39: NumericUnit as string union
- Line 352: CanonicalType has `readonly unit?: NumericUnit` (optional)
- Lines 571-628: Helper functions accept optional unit parameter

**Required Changes**:

```typescript
// REMOVE (lines 23-39)
export type NumericUnit = 'phase' | 'radians' | 'normalized' | 'scalar' | ...

// ADD - Unit Discriminated Union
export type Unit =
  | { readonly kind: 'none' }         // bool, shape
  | { readonly kind: 'scalar' }       // dimensionless numeric
  | { readonly kind: 'norm01' }       // [0,1] clamped
  | { readonly kind: 'phase01' }      // [0,1) cyclic
  | { readonly kind: 'radians' }      // angle in radians
  | { readonly kind: 'degrees' }      // angle in degrees
  | { readonly kind: 'ms' }           // milliseconds
  | { readonly kind: 'seconds' }      // seconds
  | { readonly kind: 'count' }        // integer count
  | { readonly kind: 'ndc2' }         // vec2 [0,1]^2
  | { readonly kind: 'ndc3' }         // vec3 [0,1]^3
  | { readonly kind: 'world2' }       // vec2 world-space
  | { readonly kind: 'world3' }       // vec3 world-space
  | { readonly kind: 'rgba01' };      // color [0,1]^4

// Helper constructors
export function unitNone(): Unit { return { kind: 'none' }; }
export function unitScalar(): Unit { return { kind: 'scalar' }; }
export function unitNorm01(): Unit { return { kind: 'norm01' }; }
export function unitPhase01(): Unit { return { kind: 'phase01' }; }
export function unitRadians(): Unit { return { kind: 'radians' }; }
export function unitDegrees(): Unit { return { kind: 'degrees' }; }
export function unitMs(): Unit { return { kind: 'ms' }; }
export function unitSeconds(): Unit { return { kind: 'seconds' }; }
export function unitCount(): Unit { return { kind: 'count' }; }
export function unitNdc2(): Unit { return { kind: 'ndc2' }; }
export function unitNdc3(): Unit { return { kind: 'ndc3' }; }
export function unitWorld2(): Unit { return { kind: 'world2' }; }
export function unitWorld3(): Unit { return { kind: 'world3' }; }
export function unitRgba01(): Unit { return { kind: 'rgba01' }; }

// MODIFY CanonicalType (line 352)
export interface CanonicalType {
  readonly payload: PayloadType;
  readonly extent: Extent;
  readonly unit: Unit;  // MANDATORY, not optional
}

// ADD - Payload-Unit Validation
const ALLOWED_UNITS: Record<PayloadType, readonly Unit['kind'][]> = {
  float: ['scalar', 'norm01', 'phase01', 'radians', 'degrees', 'ms', 'seconds'],
  int: ['count', 'ms'],
  vec2: ['ndc2', 'world2'],
  vec3: ['ndc3', 'world3'],
  color: ['rgba01'],
  bool: ['none'],
  shape: ['none'],
  // Remove 'phase' and 'unit' from this table
};

export function isValidPayloadUnitCombination(payload: PayloadType, unit: Unit): boolean {
  const allowed = ALLOWED_UNITS[payload];
  if (!allowed) return false;
  return allowed.includes(unit.kind);
}

// MODIFY canonicalType() constructor (lines 358-371)
export function canonicalType(
  payload: PayloadType,
  unit: Unit,  // REQUIRED parameter
  extentOverrides?: Partial<Extent>
): CanonicalType {
  if (!isValidPayloadUnitCombination(payload, unit)) {
    const allowed = ALLOWED_UNITS[payload]?.join(', ') ?? 'none';
    throw new Error(`Invalid combination: ${payload}:${unit.kind}. ${payload} allows: ${allowed}`);
  }
  return {
    payload,
    unit,
    extent: extentOverrides ? extent(extentOverrides) : extentDefault(),
  };
}

// MODIFY all helpers (lines 571-628)
export function signalTypeSignal(payload: PayloadType, unit: Unit): CanonicalType {
  return canonicalType(payload, unit, {
    cardinality: axisInstantiated(cardinalityOne()),
    temporality: axisInstantiated(temporalityContinuous()),
  });
}

export function signalTypeField(payload: PayloadType, instance: InstanceRef | string, unit: Unit): CanonicalType {
  const instanceRefValue = typeof instance === 'string'
    ? instanceRef('default', instance)
    : instance;
  return canonicalType(payload, unit, {
    cardinality: axisInstantiated(cardinalityMany(instanceRefValue)),
    temporality: axisInstantiated(temporalityContinuous()),
  });
}

// Similar for signalTypeStatic, signalTypeTrigger, signalTypePerLaneEvent

// ADD - Unit Comparison
export function unitsEqual(a: Unit, b: Unit): boolean {
  return a.kind === b.kind;
}
```

**Migration Impact**: Every call to `canonicalType()` and helpers must be updated to pass a Unit.

---

### 2. Block Definitions - Time Blocks

**File**: `src/blocks/time-blocks.ts`

**Current State**: Uses 'phase' and 'int'/'float' with optional unit strings

**Required Changes**:

```typescript
import { unitMs, unitPhase01 } from '../core/canonical-types';

// TimeRoot outputs
outputs: {
  tMs: {
    label: 'Time (ms)',
    type: signalTypeSignal('int', unitMs())  // was: signalTypeSignal('int', 'ms')
  },
  phaseA: {
    label: 'Phase A',
    type: signalTypeSignal('float', unitPhase01())  // was: signalTypeSignal('phase', 'phase')
  },
  phaseB: {
    label: 'Phase B',
    type: signalTypeSignal('float', unitPhase01())
  },
  dt: {
    label: 'Delta Time (ms)',
    type: signalTypeSignal('float', unitMs())
  },
}
```

---

### 3. Block Definitions - Signal Blocks

**File**: `src/blocks/signal-blocks.ts`

**Current State**: Uses 'phase' payload type

**Required Changes**:

```typescript
import { unitPhase01, unitScalar, unitNorm01 } from '../core/canonical-types';

// Oscillator blocks
outputs: {
  phase: {
    label: 'Phase',
    type: signalTypeSignal('float', unitPhase01())  // was: 'phase'
  },
  sine: {
    label: 'Sine',
    type: signalTypeSignal('float', unitScalar())
  }
}

// Sin/Cos/Tan blocks
inputs: {
  phase: {
    label: 'Phase',
    type: signalTypeSignal('float', unitPhase01())
  }
}
outputs: {
  value: {
    label: 'Value',
    type: signalTypeSignal('float', unitScalar())
  }
}
```

---

### 4. Block Definitions - Field Blocks

**File**: `src/blocks/field-blocks.ts` and `src/blocks/field-operations-blocks.ts`

**Current State**: Uses 'unit' payload type for normalized values

**Required Changes**:

```typescript
import { unitNorm01, unitRadians, unitWorld2 } from '../core/canonical-types';

// FieldPolarLayout
inputs: {
  angle: {
    label: 'Angle',
    type: signalTypeField('float', 'instance', unitRadians())  // expects radians, not phase01
  }
}

// GridLayout outputs
outputs: {
  position: {
    label: 'Position',
    type: signalTypeField('vec2', 'instance', unitWorld2())
  }
}
```

---

### 5. Intrinsic Properties

**File**: `src/compiler/ir/IRBuilderImpl.ts` (or wherever intrinsics are defined)

**Current State**: Intrinsics use 'int' and 'unit'/'phase' payloads

**Required Changes**:

```typescript
import { unitCount, unitNorm01 } from '../../core/canonical-types';

// Field intrinsics
fieldIntrinsic(instanceId, 'index',
  signalTypeField('int', instanceId, unitCount()))  // was 'int' with '#'

fieldIntrinsic(instanceId, 'normalizedIndex',
  signalTypeField('float', instanceId, unitNorm01()))  // was 'unit' with 'normalized'

fieldIntrinsic(instanceId, 'randomId',
  signalTypeField('float', instanceId, unitNorm01()))
```

---

### 6. Adapter Registry (Light Touch)

**File**: `src/graph/adapters.ts`

**Current State**: Uses string-based type signatures

**Required Changes**: Minimal - adapters will be added in Sprint 2. For now, just update TypeSignature to be aware of Unit:

```typescript
export interface TypeSignature {
  readonly payload: PayloadType | 'any';
  readonly unit: Unit | 'any';  // ADD this
  readonly cardinality: 'zero' | 'one' | 'many' | 'any';
  readonly temporality: 'continuous' | 'discrete' | 'any';
}

export function extractSignature(type: CanonicalType): TypeSignature {
  // ... existing cardinality/temporality extraction
  return {
    payload: type.payload,
    unit: type.unit,  // ADD this
    cardinality: cardinality.kind,
    temporality: temporality.kind,
  };
}

function typesAreCompatible(from: TypeSignature, to: TypeSignature): boolean {
  return (
    from.payload === to.payload &&
    unitsEqual(from.unit as Unit, to.unit as Unit) &&  // ADD unit check
    from.cardinality === to.cardinality &&
    from.temporality === to.temporality
  );
}
```

---

### 7. Compiler Type Checking

**File**: `src/compiler/passes-v2/pass2-types.ts` (or equivalent)

**Current State**: Type checks payload and extent only

**Required Changes**:

```typescript
import { unitsEqual } from '../../core/canonical-types';

// In edge type validation:
if (sourceType.payload !== targetType.payload) {
  emitError('PAYLOAD_MISMATCH', ...);
}

if (!unitsEqual(sourceType.unit, targetType.unit)) {
  emitError('UNIT_MISMATCH',
    `Cannot connect ${sourceType.payload}:${sourceType.unit.kind} to ${targetType.payload}:${targetType.unit.kind}`);
}

// ... existing extent validation
```

---

### 8. Tests to Update

**Files**: Multiple test files

**Pattern**:

```typescript
// Before
signalTypeSignal('phase')
signalTypeSignal('float', 'phase')

// After
signalTypeSignal('float', unitPhase01())
```

**Key test files**:
- `src/core/__tests__/canonical-types.test.ts` - Add Unit validation tests
- `src/compiler/__tests__/compile.test.ts` - Update type expectations
- `src/blocks/__tests__/*.test.ts` - Update block instantiation
- `src/runtime/__tests__/*.test.ts` - Update signal/field creation

**New tests needed**:
- Unit validation: isValidPayloadUnitCombination() for all payload types
- Unit comparison: unitsEqual() for same/different kinds
- Type compatibility: unit mismatches caught by compiler
- Error messages: invalid payload-unit combinations produce helpful errors

---

### 9. Documentation

**File**: `src/core/UNIT-MIGRATION-GUIDE.md`

**Current State**: Documents optional NumericUnit annotations

**Required Changes**:
- Replace NumericUnit section with Unit discriminated union
- Add table of 14 unit kinds
- Document payload-unit validation table from spec §A4
- Provide migration examples for every common pattern
- Add "Why Units Are Mandatory" section explaining safety benefits

---

## Migration Strategy

### Phase 1: Add New Types (No Breaking Changes)
1. Add Unit discriminated union alongside NumericUnit
2. Add helper constructors
3. Add validation function
4. Add unitsEqual()

### Phase 2: Dual Support (Transition Period)
1. Make CanonicalType.unit accept `Unit | NumericUnit` temporarily
2. Update canonicalType() to accept both forms
3. Migrate one file at a time, starting with core types

### Phase 3: Complete Migration
1. Remove NumericUnit type
2. Make CanonicalType.unit mandatory Unit
3. Update all remaining usages
4. Run full test suite

### Phase 4: Verification
1. Search codebase for 'phase' and 'unit' PayloadTypes - should be zero
2. Verify all numeric ports have units
3. Run type checker and tests
4. Update documentation

---

## Common Patterns Reference

### Time Values
```typescript
// Milliseconds (integer)
signalTypeSignal('int', unitMs())

// Milliseconds (float for dt)
signalTypeSignal('float', unitMs())

// Seconds (user-facing, future)
signalTypeSignal('float', unitSeconds())
```

### Phase and Angles
```typescript
// Phase [0,1) for oscillators
signalTypeSignal('float', unitPhase01())

// Radians for field geometry
signalTypeField('float', instanceId, unitRadians())

// Degrees (user input, future)
signalTypeSignal('float', unitDegrees())
```

### Normalized Values
```typescript
// Clamped [0,1] for easing, opacity
signalTypeSignal('float', unitNorm01())

// Field normalized index
signalTypeField('float', instanceId, unitNorm01())
```

### Counts and Indices
```typescript
// Integer count
signalTypeSignal('int', unitCount())

// Field index
signalTypeField('int', instanceId, unitCount())
```

### Dimensionless
```typescript
// Generic float arithmetic
signalTypeSignal('float', unitScalar())

// No unit (bool, shape)
signalTypeSignal('bool', unitNone())
signalTypeSignal('shape', unitNone())
```

### Spatial
```typescript
// 2D NDC [0,1]^2
signalTypeField('vec2', instanceId, unitNdc2())

// 2D world-space
signalTypeField('vec2', instanceId, unitWorld2())

// 3D variants (future)
signalTypeField('vec3', instanceId, unitNdc3())
signalTypeField('vec3', instanceId, unitWorld3())
```

### Colors
```typescript
// RGBA [0,1]^4
signalTypeSignal('color', unitRgba01())
signalTypeField('color', instanceId, unitRgba01())
```

---

## Spec Compliance Checklist

From 0-Units-and-Adapters.md:

- [ ] §A1: Every CanonicalType has (payload, unit, extent) - no optionals
- [ ] §A2: No 'phase' or 'unit' PayloadTypes exist
- [ ] §A3: Unit is closed discriminated union with exact 14 kinds
- [ ] §A4: Payload-unit validation enforces allowed combinations table
- [ ] §A5: Type compatibility requires unit deep-equality
- [ ] §A6: Units are semantic, not representational (phase01 != scalar even though both float32)

---

## Error Messages to Implement

1. **Invalid Payload-Unit Combination**:
```
Error: Invalid combination: color:phase01.
Color values support: rgba01
```

2. **Unit Mismatch in Connection**:
```
Error: Cannot connect float:phase01 to float:radians.
Consider adding a PhaseToRadians adapter block.
```

3. **Missing Unit Parameter**:
```
Error: canonicalType() requires unit parameter.
Example: canonicalType('float', unitPhase01())
```

---

## Implementation Order

1. **canonical-types.ts**: Add Unit type and helpers (~50 lines)
2. **canonical-types.ts**: Add validation function (~30 lines)
3. **canonical-types.ts**: Update CanonicalType interface (1 line change)
4. **canonical-types.ts**: Update canonicalType() constructor (~10 lines)
5. **canonical-types.ts**: Update all helper functions (~40 lines)
6. **canonical-types.ts**: Add unitsEqual() (~5 lines)
7. **time-blocks.ts**: Migrate TimeRoot (1 block, ~10 port changes)
8. **signal-blocks.ts**: Migrate oscillator and trig blocks (~5 blocks)
9. **field-blocks.ts**: Migrate field blocks (~10 blocks)
10. **instance-blocks.ts**: Migrate intrinsic properties (~5 locations)
11. **compiler pass**: Add unit validation to type checker (~20 lines)
12. **adapters.ts**: Update TypeSignature (light touch, ~15 lines)
13. **tests**: Update test expectations (~50 files, mechanical changes)
14. **UNIT-MIGRATION-GUIDE.md**: Full rewrite (~300 lines)

Estimated total: ~500 lines new/modified across ~70 files.

---

## Known Gotchas

1. **Phase vs Phase01**: The spec says `phase01` not `phase`. Don't confuse with old PayloadType 'phase'.

2. **Unit vs Norm01**: Old PayloadType 'unit' maps to `float:norm01` not `float:unit`.

3. **Validation at Construction**: Validation must happen in canonicalType(), not lazily, to catch errors early.

4. **No Unit Inference**: Units are never inferred. Every CanonicalType must explicitly state its unit.

5. **Bool and Shape**: Always use unitNone() for bool and shape - they don't carry units.

6. **Intrinsics**: Watch for hardcoded intrinsic types in IRBuilder - they need unit updates too.

7. **Test Fixtures**: Many tests create minimal SignalTypes - they'll all need units now.

---

## Success Metrics

- Zero compilation errors after migration
- 815+ tests pass (same or better than current)
- Zero grep hits for `payload: 'phase'` or `payload: 'unit'`
- All numeric ports have appropriate units
- Type compatibility checks enforce unit matching
- Clear error messages guide users on unit mismatches
