# Three-Stage Block Architecture Evaluation

**Date**: 2026-01-17
**Status**: Evaluation Complete - Ready for Implementation
**Scope**: Current state vs. requirements for Circle → Array → GridLayout three-stage architecture

---

## Executive Summary

The codebase has **partial but impure** support for the three-stage architecture. The key building blocks exist but are combined incorrectly in the current `CircleInstance` block, which conflates:

1. Primitive creation (Circle)
2. Array instantiation (count → many elements)  
3. Layout application (position computation)

**Finding**: We can implement the correct three-stage architecture with **minimal IR changes** because the underlying infrastructure is sound. The blocker is architectural, not infrastructural.

---

## Part 1: Current State of instance-blocks.ts

### What Exists Now

**CircleInstance** (lines 104-174)
- **Form**: primitive block
- **Inputs**: 
  - `count` (int, defaultValue: 100)
  - `layout` (int, optional) - receives metadata hack
- **Outputs**: 
  - `position`, `radius`, `index`, `t` as fields
- **Implementation pattern**: 
  - Calls `ctx.b.createInstance()` with layout spec
  - Uses `ctx.b.fieldIntrinsic()` to create field outputs
  - Allocates slots for each output
  - Returns discriminated union: `{ k: 'field', id, slot }`

**Metadata Hack** (lines 133-137)
```typescript
if (layoutInput && (layoutInput as any).metadata?.layoutSpec) {
  layout = (layoutInput as any).metadata.layoutSpec;
}
```

**Layout Blocks** (`GridLayout`, `LinearLayout`)
- Output signals with embedded metadata
- Lines 42-62, 84-98: `ctx.b.sigConst(0, ...)` then attach metadata
- Carry layout spec in metadata, not as actual IR

### What's Missing

1. **Separate primitive block** (Circle) - doesn't exist
2. **Separate array block** (Array) - doesn't exist  
3. **Layout as field operation** (GridLayout) - exists but backwards (layout feeds in, not out)
4. **No PrimitiveDecl IR type** - would represent single element
5. **No fieldArray or fieldLayout IR methods** - only fieldIntrinsic exists

---

## Part 2: IR Builder Methods Currently Available

### Signal Expressions ✅ Complete

From `IRBuilder.ts` (lines 36-52):
- `sigConst()` - constant signal
- `sigSlot()` - slot reference
- `sigTime()` - time-derived (tMs, phaseA, phaseB, dt, pulse, progress)
- `sigExternal()` - mouse input
- `sigMap()` - map function over signal
- `sigZip()` - zip multiple signals with function

**Assessment**: Sufficient for primitive creation

### Field Expressions - Partial ⚠️

From `IRBuilder.ts` (lines 58-94):
- `fieldConst()` - constant field ✅
- `fieldSource()` - **DEPRECATED**, old domain model
- **`fieldIntrinsic(instanceId, intrinsic, type)` ✅** - NEW, used by blocks
- `Broadcast()` - broadcast signal to field ✅
- `fieldMap()` - map function over field ✅
- `fieldZip()` - zip multiple fields ✅
- `fieldZipSig()` - zip field with signals ✅

**Assessment**: Missing `fieldArray()` and `fieldLayout()` methods needed for proper stage separation

### Instance Management - Present ✅

From `IRBuilder.ts` (lines 210-228):
```typescript
createInstance(
  domainType: DomainTypeId,
  count: number,
  layout: LayoutSpec,
  lifecycle?: 'static' | 'dynamic' | 'pooled'
): InstanceId

getInstances(): ReadonlyMap<InstanceId, InstanceDecl>
```

**Assessment**: Perfect for Array stage (creates field with count)

---

## Part 3: IR Expression Types Available

### SigExpr Types - Sufficient ✅

From `types.ts` (lines 74-81):
```typescript
export type SigExpr =
  | SigExprConst
  | SigExprSlot
  | SigExprTime
  | SigExprExternal
  | SigExprMap
  | SigExprZip
  | SigExprStateRead;
```

Can express any primitive computation

### FieldExpr Types - Partially Sufficient ⚠️

From `types.ts` (lines 131-138):
```typescript
export type FieldExpr =
  | FieldExprConst
  | FieldExprSource          // OLD domain model
  | FieldExprBroadcast
  | FieldExprMap
  | FieldExprZip
  | FieldExprZipSig
  | FieldExprMapIndexed;
```

**Missing discriminants for proper architecture**:
- No `FieldExprArray` - would represent Array stage output
- No `FieldExprLayout` - would represent Layout stage output
- `FieldExprSource` tied to old DomainId, not InstanceId

### InstanceDecl - Well-Designed ✅

From `types.ts` (visible in `IRBuilderImpl`):
```typescript
export interface InstanceDecl {
  readonly id: InstanceId;
  readonly domainType: DomainTypeId;
  readonly count: number | 'dynamic';
  readonly layout: LayoutSpec;
  readonly lifecycle: 'static' | 'dynamic' | 'pooled';
}
```

Perfect for Array stage

### LayoutSpec - Comprehensive ✅

From current code:
```typescript
type LayoutSpec = 
  | { kind: 'grid', rows, cols }
  | { kind: 'linear', spacing }
  | { kind: 'unordered' }
  | { kind: 'circular' }
  | { kind: 'random' }
  | { kind: 'along-path' }
  | { kind: 'custom' }
```

Supports all layout types needed

---

## Part 4: Existing Blocks That Depend on This Architecture

### Blocks Using `createInstance()` (Stage 2 equivalent)

**instance-blocks.ts**:
- `CircleInstance` (lines 104-174) - calls `createInstance()` with DOMAIN_CIRCLE

### Blocks Using `fieldIntrinsic()` (Array outputs)

**field-operations-blocks.ts** (18+ blocks):
- `FieldFromDomainId` - gets normalizedIndex intrinsic
- `FieldAdd`, `FieldMultiply`, `FieldScale` - field arithmetic
- `FieldSin`, `FieldCos`, `FieldMod` - field math
- `FieldPolarToCartesian`, `FieldCartesianToPolar` - coordinate conversions
- `FieldPulse`, `FieldGoldenAngle`, `FieldAngularOffset` - animated fields
- `FieldRadiusSqrt`, `FieldJitter2D` - field transformations
- `FieldHueFromPhase` - color field generation

All use pattern:
```typescript
const instance = ctx.inferredInstance ?? ctx.instance;
const field = ctx.b.fieldIntrinsic(instance, 'name', type);
```

**identity-blocks.ts**:
- `RandomId`, `IdFromDomainId`, `IndexFromDomainId` - identity fields

**geometry-blocks.ts**:
- Similar pattern with fieldIntrinsic

### Blocks Using Fields (Stage 3 outputs - Render layer)

**render-blocks.ts**:
- `RenderCircle` (lines 20-62) - takes pos, color, size as fields
- `RenderRect` (lines 68-113) - takes pos, color, width, height as fields
- `RenderInstances2D` (lines 119-158) - takes pos, color, size as fields

All validate:
```typescript
if (!pos || pos.k !== 'field') {
  throw new Error('RenderXXX pos input must be a field');
}
const instance = ctx.inferredInstance;
if (!instance) {
  throw new Error('RenderXXX requires field inputs with instance context');
}
```

---

## Part 5: What's Needed for Three-Stage Implementation

### Minimum IR Changes Required

#### 1. New FieldExpr Discriminants (types.ts)

```typescript
// Add to FieldExpr union:
export interface FieldExprArray {
  readonly kind: 'array';
  readonly instanceId: InstanceId;
  readonly primitiveId?: string;  // Reference to primitive that was instantiated
}

export interface FieldExprLayout {
  readonly kind: 'layout';
  readonly input: FieldExprId;
  readonly layout: LayoutSpec;
}
```

**Impact**: Low - additive, doesn't change existing types

#### 2. New IRBuilder Methods (IRBuilder.ts + IRBuilderImpl.ts)

```typescript
// Array stage output (creates Field<T> from Signal<T>)
fieldArray(
  instanceId: InstanceId,
  elementSignal?: SigExprId,  // The primitive signal being instantiated
  type: SignalType
): FieldExprId;

// Layout stage (creates Field<vec2> from Field<any>)
fieldLayout(
  input: FieldExprId,
  layout: LayoutSpec,
  type: SignalType
): FieldExprId;

// Optional: Get intrinsic field for current instance
fieldIntrinsic(
  instanceId: InstanceId,
  intrinsic: string,
  type: SignalType
): FieldExprId;  // Already exists ✅
```

**Implementation**: ~40 lines in IRBuilderImpl, following existing patterns

#### 3. Optional: PrimitiveDecl IR Type

```typescript
export type PrimitiveId = string & { readonly __brand: 'PrimitiveId' };

export interface PrimitiveDecl {
  readonly id: PrimitiveId;
  readonly domainType: DomainTypeId;
  readonly params: Record<string, SigExprId>;
}
```

**Rationale**: Explicitly document "one element" representation
**Note**: Can defer - Circle block can just return SigExprId directly

---

## Part 6: Block Implementation Gap Analysis

### Stage 1: Primitive Block Needed ❌

**Name**: `Circle` (or generic `Primitive<T>`)

```typescript
registerBlock({
  type: 'Circle',
  inputs: [
    { id: 'radius', type: signalType('float'), defaultValue: 0.02 }
  ],
  outputs: [
    { id: 'circle', type: signalType('circle') }  // ← SigExpr, not Field!
  ],
  lower: ({ ctx, inputsById }) => {
    const radius = inputsById.radius;
    // Outputs ONE signal (not Field!)
    return {
      outputsById: {
        circle: { k: 'sig', id: radius.id, slot: ctx.b.allocSlot() }
      }
    };
  }
});
```

**Current Gap**: No such block exists; CircleInstance conflates this with Array

### Stage 2: Array Block Needed ❌

**Name**: `Array`

```typescript
registerBlock({
  type: 'Array',
  inputs: [
    { id: 'element', type: signalType('any') },  // ← Any domain
    { id: 'count', type: signalType('int'), defaultValue: 100 },
    { id: 'maxCount', type: signalType('int'), optional: true }
  ],
  outputs: [
    { id: 'elements', type: signalTypeField('same-as-input') },  // ← Same type!
    { id: 'index', type: signalTypeField('int') },
    { id: 't', type: signalTypeField('float') },
    { id: 'active', type: signalTypeField('bool') }
  ],
  lower: ({ ctx, inputsById }) => {
    const element = inputsById.element;
    const count = inputsById.count?.id ?? ctx.b.sigConst(100, ...);
    
    // Create instance from element's domain type
    const instanceId = ctx.b.createInstance(
      DOMAIN_CIRCLE,  // Would need to infer from element type
      100,
      { kind: 'unordered' }
    );
    
    // Use ctx.b.fieldArray() to create Field<circle>
    const elementsField = ctx.b.fieldArray(instanceId, element.id, ...);
    
    return { outputsById: { 
      elements: { k: 'field', id: elementsField, ... },
      index: { k: 'field', id: ctx.b.fieldIntrinsic(...), ... },
      ...
    }};
  }
});
```

**Current Gap**: Functionality spread across CircleInstance + implicit

### Stage 3: Layout as Field Operation ✅ (Partially)

**Current Code** (instance-blocks.ts):
- Layout blocks output signal with metadata (WRONG)

**Needed Fix**:
- Accept Field<T> as input
- Compute positions
- Output Field<vec2>

```typescript
registerBlock({
  type: 'GridLayout',
  inputs: [
    { id: 'elements', type: signalTypeField('any') },  // ← Field input!
    { id: 'rows', type: signalType('int') },
    { id: 'cols', type: signalType('int') }
  ],
  outputs: [
    { id: 'position', type: signalTypeField('vec2') }  // ← Field output!
  ],
  lower: ({ ctx, inputsById }) => {
    const elements = inputsById.elements;
    
    if (elements.k !== 'field') {
      throw new Error('GridLayout requires Field input');
    }
    
    const layout: LayoutSpec = { kind: 'grid', rows, cols };
    
    // Use ctx.b.fieldLayout() to compute positions
    const positionField = ctx.b.fieldLayout(elements.id, layout, ...);
    
    return {
      outputsById: {
        position: { k: 'field', id: positionField, ... }
      }
    };
  }
});
```

**Current Gap**: Layout blocks output signals, not fields; no field input

---

## Part 7: Existing Field Operation Blocks (Compatible)

All 18+ field operation blocks in `field-operations-blocks.ts` already follow the correct pattern:

```typescript
const instance = ctx.inferredInstance ?? ctx.instance;
const result = ctx.b.fieldXxx(...);
```

**Assessment**: These blocks will work correctly once Array block properly sets `inferredInstance`

**No changes needed** for compatibility

---

## Part 8: Render Blocks (Already Compatible)

`render-blocks.ts` blocks already validate field inputs and extract instance:

```typescript
if (!pos || pos.k !== 'field') {
  throw new Error('RenderCircle pos input must be a field');
}
const instance = ctx.inferredInstance;
if (!instance) {
  throw new Error('RenderCircle requires field inputs with instance context');
}
```

**Assessment**: These will work correctly once layout blocks output proper fields

**No changes needed** for compatibility

---

## Part 9: Compiler Support

### pass7-schedule.ts Status

Uses `InstanceDecl` correctly - iterates over instances and schedules execution

**Assessment**: No changes needed ✅

### Materializer (Runtime)

Instance-aware runtime support exists

**Assessment**: No changes needed ✅

---

## Part 10: Domain Registry

From `domain-registry.ts`:

- `DOMAIN_CIRCLE`, `DOMAIN_RECTANGLE`, etc. defined ✅
- Intrinsics defined (position, radius, index, normalizedIndex, etc.) ✅
- Type hierarchy in place ✅

**Assessment**: Complete for Stage 1 primitive types

---

## Part 11: Type System Status

### SignalType Support ✅

- 'float', 'int', 'vec2', 'vec3', 'color', 'bool', 'circle', etc.
- Field variant: `signalTypeField('float', 'default')`

### Instance Context Propagation ⚠️

**Current pattern**:
```typescript
const instance = ctx.inferredInstance ?? ctx.instance;
```

**Problem**: `inferredInstance` must be populated by Array block
**Status**: Pattern exists, just needs Array block to set it correctly

---

## Summary: What Must Be Built vs. What Exists

| Component | Current State | Needed Action |
|-----------|---------------|---------------|
| **SigExpr types** | ✅ Complete | None |
| **FieldExpr types** | ⚠️ Partial | Add FieldExprArray, FieldExprLayout |
| **FieldIntrinsic** | ✅ Works | None |
| **FieldArray method** | ❌ Missing | Implement in IRBuilder |
| **FieldLayout method** | ❌ Missing | Implement in IRBuilder |
| **Instance model** | ✅ Complete | None |
| **Domain types** | ✅ Complete | None |
| **Circle block** | ❌ Missing | Implement |
| **Array block** | ❌ Missing | Implement |
| **GridLayout (fixed)** | ⚠️ Exists wrong | Rewrite to use fieldLayout |
| **Field ops blocks** | ✅ Compatible | None needed |
| **Render blocks** | ✅ Compatible | None needed |
| **Compiler support** | ✅ Complete | None |
| **Domain registry** | ✅ Complete | None |

---

## Implementation Roadmap

### Phase 1: IR Changes (2-3 hours)

1. Add `FieldExprArray` to FieldExpr union
2. Add `FieldExprLayout` to FieldExpr union  
3. Implement `fieldArray()` in IRBuilder + IRBuilderImpl
4. Implement `fieldLayout()` in IRBuilder + IRBuilderImpl

**Files**: `types.ts`, `IRBuilder.ts`, `IRBuilderImpl.ts`

### Phase 2: Block Implementation (4-6 hours)

1. Create `Circle` primitive block
2. Create `Array` block with proper domain inference
3. Rewrite `GridLayout` to be field operation
4. Delete `CircleInstance` conflated block

**Files**: `instance-blocks.ts`

### Phase 3: Layout Blocks (2 hours)

1. Fix `LinearLayout` to match GridLayout pattern
2. Add `CircularLayout` field operation
3. Add `RandomLayout` field operation
4. Remove layout metadata hack

**Files**: `instance-blocks.ts`

### Phase 4: Testing & Validation (3-4 hours)

1. Write tests for Circle block
2. Write tests for Array block with various domains
3. Write tests for GridLayout field operation
4. Update existing render block tests
5. Verify field operation blocks still work

**Files**: `blocks/__tests__/`

---

## Risk Assessment

### Low Risk
- ✅ Field operation blocks already compatible
- ✅ Render blocks already compatible
- ✅ Domain registry complete
- ✅ Instance model proven

### Medium Risk
- ⚠️ Instance context propagation (inferredInstance flow)
- ⚠️ Type inference in Array block (domain agnostic)

### Mitigation
- Test instance context propagation early
- Type inference can start simple (explicit domain input) then improve

---

## Critical Questions Resolved

**Q**: Can we implement this without major IR changes?
**A**: ✅ Yes - IR already supports it, just needs discriminants and builder methods

**Q**: Will existing field operation blocks need rewriting?
**A**: ✅ No - they already follow the correct pattern

**Q**: Will render blocks need changes?
**A**: ✅ No - they already validate field inputs correctly

**Q**: What about layout metadata hack?
**A**: ✅ Will be removed - layout becomes proper field operation

---

## Conclusion

The codebase has **excellent foundation** for the three-stage architecture. The main gaps are:

1. **Three separate blocks** (Circle, Array, GridLayout) instead of one conflated block
2. **Two IR builder methods** (fieldArray, fieldLayout) following existing patterns
3. **Two FieldExpr discriminants** for proper AST representation
4. **One rewrite** in layout blocks to output fields instead of signals with metadata

All other components are already aligned with the correct architecture. The implementation is **straightforward and low-risk**.

Estimated total effort: **11-16 hours** for complete implementation, testing, and validation.

