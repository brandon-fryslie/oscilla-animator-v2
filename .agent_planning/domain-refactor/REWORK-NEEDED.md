# Domain Refactor - Rework Required

**Created**: 2026-01-17
**Status**: Pre-implementation review required
**Related**: PLAN-20260117.md, DOD-20260117.md, CONTEXT.md

---

## Executive Summary

**STOP**: Before implementing the domain refactor plan, we need to address foundational architectural issues discovered during design review.

**Key Discovery**: The three-stage architecture (Primitive → Array → Layout) described in `WHAT-IS-A-DOMAIN.md` is **incompatible** with some existing implementation work. We need to redo certain completed work to align with the correct model.

**Impact**:
- Some already-implemented code must be revised or deleted
- Additional architectural issues discovered that should be fixed alongside domain refactor
- Plan sprints remain valid but some implementation details need revision

---

## What Changed: Primitive → Array → Layout Model

### The New Understanding (from CONTEXT.md)

The correct domain model has **THREE orthogonal stages**:

```
Stage 1: PRIMITIVE          Stage 2: ARRAY           Stage 3: LAYOUT
(What kind of thing)        (How many)               (Where positioned)
────────────────────        ─────────────────        ────────────────
[Circle]                →   [Array]              →   [Grid Layout]
  radius: 0.02                count: 100                rows: 10
  ↓                           maxCount: 200             cols: 10
Signal<circle>                ↓                         ↓
(ONE circle)                  Field<circle>             Field<vec2>
                              (MANY circles)            (positions)
```

**Key principles**:
1. **Primitives create ONE element** of a domain type (Signal<T>)
2. **Array transforms cardinality** (Signal<T> → Field<T, instance>)
3. **Layout operates on fields** to compute positions (Field → Field<vec2>)
4. **Position is just another field** (not special, can be replaced/transformed)
5. **Layout is an operation**, not configuration of instance

### What This Means for Existing Work

#### ✅ Keep (Aligned with New Model)

**Layout blocks as operations** (`src/blocks/instance-blocks.ts` lines 23-97):
- GridLayout, LinearLayout blocks exist
- They are operations (take inputs, produce outputs)
- HOWEVER: Implementation needs revision (see below)

**Domain registry concept** (`src/core/domain-registry.ts`):
- Domain types as classification
- Intrinsic properties per domain
- Domain hierarchy (circle <: shape)

#### ❌ Revise (Misaligned with New Model)

**Layout blocks outputting signals with metadata** (`instance-blocks.ts:50-59`):
```typescript
// CURRENT (WRONG):
const layoutSignal = ctx.b.sigConst(0, signalType('int'));  // Placeholder
return {
  outputsById: {
    layout: { k: 'sig', id: layoutSignal, slot, metadata: { layoutSpec: layout } },
  },
};
```

**Problem**:
- Layout is carried as metadata on a dummy signal
- Downstream blocks extract metadata via type casting
- No first-class IR representation for layouts
- Violates "Position is just another field" principle

**CORRECT MODEL**:
```typescript
// Layout blocks should output Field<vec2> (position field)
// They take Field<any> as input (the elements to position)
// Example:
[Array] ──elements──▶ [Grid Layout] ──position──▶ [Render]
Field<circle>         rows: 10
                      cols: 10
                      ↓
                      Field<vec2>
```

**CircleInstance block conflates stages** (`instance-blocks.ts:100+`):
- Current design: CircleInstance takes layout as input
- Correct model: Separate Circle (primitive) from Array (cardinality) from Layout (position)
- Need THREE blocks instead of ONE conflated block

---

## Rework Tasks

### Task 1: Rewrite Layout Blocks (MAJOR)

**File**: `src/blocks/instance-blocks.ts` (GridLayout, LinearLayout, etc.)

**Current state**: Layout blocks output int signals with LayoutSpec metadata

**Required change**: Layout blocks should be **field operations**:

```typescript
// NEW MODEL:
registerBlock({
  type: 'GridLayout',
  label: 'Grid Layout',
  category: 'layout',
  inputs: [
    { id: 'elements', label: 'Elements', type: signalTypeField('any') },  // Field input
    { id: 'rows', label: 'Rows', type: signalType('int') },
    { id: 'cols', label: 'Columns', type: signalType('int') },
    { id: 'spacing', label: 'Spacing', type: signalType('float') },
  ],
  outputs: [
    { id: 'position', label: 'Position', type: signalTypeField('vec2') },  // Field output
  ],
  lower: ({ ctx, inputsById }) => {
    const elementsField = inputsById.elements;
    const instanceId = extractInstanceFromField(elementsField);

    const rows = inputsById.rows;
    const cols = inputsById.cols;
    const spacing = inputsById.spacing;

    // Create FieldExprLayout (NEW IR node type)
    const positionField = ctx.b.fieldLayout(
      instanceId,
      'grid',
      [rows.id, cols.id, spacing.id]
    );

    return {
      outputsById: {
        position: { k: 'field', id: positionField },
      },
    };
  },
});
```

**Deliverable**:
- Layouts take Field input, output Field<vec2>
- No metadata hacks
- FieldExprLayout IR node (new type from PLAN)

---

### Task 2: Split CircleInstance into Primitive + Array (CRITICAL)

**File**: `src/blocks/instance-blocks.ts` (CircleInstance block)

**Current state**: CircleInstance conflates primitive creation, array instantiation, and layout

**Required change**: Split into THREE separate blocks:

#### 2a. Circle Primitive Block

```typescript
registerBlock({
  type: 'Circle',
  label: 'Circle',
  category: 'primitive',
  inputs: [
    { id: 'radius', label: 'Radius', type: signalType('float'), defaultValue: 0.02 },
  ],
  outputs: [
    { id: 'circle', label: 'Circle', type: signalType('circle') },  // Signal<circle> (ONE)
  ],
  lower: ({ ctx, inputsById }) => {
    const radiusId = inputsById.radius.id;

    // Create PrimitiveDecl (NEW IR node from PLAN)
    const primitiveId = ctx.b.createPrimitive(
      DOMAIN_CIRCLE,
      { radius: radiusId }
    );

    // Primitive blocks output Signal<circle> (cardinality: one)
    const circleSignal = ctx.b.sigPrimitive(primitiveId, DOMAIN_CIRCLE);

    return {
      outputsById: {
        circle: { k: 'sig', id: circleSignal },
      },
    };
  },
});
```

#### 2b. Array Block (Domain-Agnostic)

```typescript
registerBlock({
  type: 'Array',
  label: 'Array',
  category: 'instance',
  inputs: [
    { id: 'element', label: 'Element', type: signalType('any') },  // Signal<T> (ONE)
    { id: 'count', label: 'Count', type: signalType('int') },
    { id: 'maxCount', label: 'Max Count', type: signalType('int') },
  ],
  outputs: [
    { id: 'elements', label: 'Elements', type: signalTypeField('same-as-input') },  // Field<T> (MANY)
    { id: 'index', label: 'Index', type: signalTypeField('int') },
    { id: 't', label: 't [0,1]', type: signalTypeField('float') },
    { id: 'active', label: 'Active', type: signalTypeField('bool') },
  ],
  lower: ({ ctx, inputsById }) => {
    const elementSignal = inputsById.element;
    const countId = inputsById.count.id;
    const maxCountId = inputsById.maxCount.id;

    // Extract primitive from signal
    const primitiveId = extractPrimitiveFromSignal(elementSignal);
    const domainType = getDomainTypeFromPrimitive(primitiveId);

    // Create InstanceDecl (pool-based)
    const instanceId = ctx.b.createInstance(
      primitiveId,
      maxCountId,  // Pool size
      countId      // Dynamic count signal
    );

    // Create FieldExprArray
    const elementsField = ctx.b.fieldArray(instanceId, domainType);
    const indexField = ctx.b.fieldIntrinsic(instanceId, 'index', signalType('int'));
    const tField = ctx.b.fieldIntrinsic(instanceId, 't', signalType('float'));
    const activeField = ctx.b.fieldIntrinsic(instanceId, 'active', signalType('bool'));

    return {
      outputsById: {
        elements: { k: 'field', id: elementsField, instanceId },
        index: { k: 'field', id: indexField, instanceId },
        t: { k: 'field', id: tField, instanceId },
        active: { k: 'field', id: activeField, instanceId },
      },
    };
  },
});
```

#### 2c. User Flow

```
User adds:
1. [Circle] block (radius: 0.02)
2. [Array] block (connect Circle → element, count: 100, maxCount: 200)
3. [Grid Layout] block (connect Array.elements → elements, rows: 10, cols: 10)
4. [Render] block (connect Grid.position → position, connect Circle.radius → size)

Result:
100 circles in 10×10 grid, pool-allocated with space for 200
```

**Deliverable**:
- Circle primitive block (creates Signal<circle>)
- Array block (transforms Signal<T> → Field<T>)
- Delete CircleInstance block (wrong model)

---

### Task 3: Add FieldExprLayout IR Type (REQUIRED)

**File**: `src/compiler/ir/types.ts`

**Current state**: No IR representation for layout operations

**Required change**: Add FieldExprLayout as new FieldExpr variant (from PLAN):

```typescript
export interface FieldExprLayout {
  readonly kind: 'layout';
  readonly instanceId: InstanceId;
  readonly layout: 'grid' | 'spiral' | 'random' | 'along-path';
  readonly params: readonly SigExprId[];  // rows, cols, spacing, etc.
  readonly type: SignalType;  // Always vec2 (position)
}

// Add to FieldExpr union:
export type FieldExpr =
  | FieldExprConst
  | FieldExprSource
  | FieldExprBroadcast
  | FieldExprMap
  | FieldExprZip
  | FieldExprZipSig
  | FieldExprMapIndexed
  | FieldExprLayout;  // NEW
```

**Deliverable**: IR type exists, TypeScript compiles

---

### Task 4: Add IRBuilder Methods for Primitives/Array/Layout (REQUIRED)

**File**: `src/compiler/ir/IRBuilder.ts` and `IRBuilderImpl.ts`

**Current state**: No methods for three-stage model

**Required additions** (from PLAN Sprint 2):

```typescript
interface IRBuilder {
  // Primitives
  createPrimitive(domainType: DomainTypeId, params: Record<string, SigExprId>): PrimitiveId;

  // Instances (pool-based)
  createInstance(primitiveId: PrimitiveId, maxCount: SigExprId, countExpr?: SigExprId): InstanceId;

  // Fields
  fieldArray(instanceId: InstanceId, domainType: DomainTypeId): FieldExprId;
  fieldLayout(instanceId: InstanceId, layout: LayoutKind, params: SigExprId[]): FieldExprId;
  fieldIntrinsic(instanceId: InstanceId, intrinsic: string, type: SignalType): FieldExprId;

  // Signal from primitive
  sigPrimitive(primitiveId: PrimitiveId, domainType: DomainTypeId): SigExprId;
}
```

**Deliverable**: Methods exist, compilation uses them

---

## Additional Architectural Issues to Fix

During design review, **6 additional architectural issues** were discovered. These should be addressed alongside the domain refactor to avoid future rework:

### Issue #1: Block.domainId Conflates Type and Instance (CRITICAL)

**File**: `src/graph/Patch.ts` line 23

**Problem**: `Block.domainId` tries to be both:
- Domain type classification (DOMAIN_CIRCLE)
- Instance reference (specific instantiation with count/layout)

**Fix**: Split into TWO fields:
```typescript
export interface Block {
  readonly id: BlockId;
  readonly type: BlockType;
  readonly params: Readonly<Record<string, unknown>>;
  readonly displayName: string | null;
  readonly domainType: DomainTypeId | null;   // NEW: Classification
  readonly instanceId: InstanceId | null;     // NEW: Instantiation
  readonly role: BlockRole;
}
```

**Rationale**: Same separation as domain refactor (type vs instance)

---

### Issue #2: LayoutSpec in Metadata (MAJOR)

**File**: `src/blocks/instance-blocks.ts`

**Problem**: Already covered in Task 1 above

**Fix**: Task 1 resolves this

---

### Issue #3: label vs displayName Confusion (MAJOR)

**File**: `src/graph/Patch.ts` lines 18-21

**Problem**: Two similar fields, unclear semantics

**Fix Decision Required**:
- If displayName is UI-only: Move to editor state, remove from Block
- If displayName is semantic: Make non-nullable, remove label
- If both needed: Document clear distinction (e.g., label = type hint, displayName = user override)

**Recommendation**: Defer to separate editor UX design task

---

### Issue #4: BlockRole.domain Unclear Semantics (MAJOR)

**File**: `src/types/index.ts` line 261

**Problem**: `domain` role has empty metadata, unclear purpose

**Fix**:
- If domain blocks should exist: Define what they do, populate DomainMeta
- If domain is compile-time only: Remove domain role, use 'user' role for instance blocks

**Recommendation**: Remove domain role once instance blocks replace it

---

### Issue #5: Polymorphic Type Inference (MINOR)

**File**: `src/blocks/field-blocks.ts`

**Problem**: Type resolution implicit

**Fix**: Document normalizer contract, add type guards

**Recommendation**: Defer to type system improvement task

---

### Issue #6: Inferred Instance Context (MINOR)

**File**: `src/blocks/render-blocks.ts`

**Problem**: Instance context implicit in render blocks

**Fix**: Already addressed in domain refactor (render blocks infer instance from field inputs)

**Recommendation**: Task already in PLAN Sprint 5

---

## Verification Checklist

Before proceeding with domain refactor implementation:

- [ ] **Review CONTEXT.md**: Ensure understanding of three-stage model
- [ ] **Update PLAN-20260117.md**:
  - [ ] Sprint 3: Revise to create Primitive blocks, Array block (not CircleInstance)
  - [ ] Sprint 4: Add task to rewrite layout blocks as field operations
  - [ ] Add FieldExprLayout IR type to Sprint 2
  - [ ] Add IRBuilder primitive/array/layout methods to Sprint 2
- [ ] **Update DOD-20260117.md**:
  - [ ] Add acceptance criteria for Primitive blocks
  - [ ] Add acceptance criteria for Array block
  - [ ] Add acceptance criteria for Layout blocks as operations
  - [ ] Add verification: "Layout blocks take Field input, output Field<vec2>"
- [ ] **Review design docs**:
  - [ ] `WHAT-IS-A-DOMAIN.md` sections 3.6-3.9 are correct (Primitive → Array → Layout)
  - [ ] `WHAT-IS-A-DOMAIN-PART-4-REFACTOR.md` has correct architecture
- [ ] **Decide on Issues #1, #3, #4**: Should they be fixed now or deferred?

---

## Recommended Action Plan

### Option A: Fix Everything Now (Comprehensive)

**Pros**: Clean slate, no future rework
**Cons**: Larger scope, more risk
**Estimated effort**: +6-8 hours (33% increase)

**Includes**:
- Domain refactor (all 8 sprints from PLAN)
- Issue #1: Split Block.domainId → domainType + instanceId
- Issue #3: Resolve label/displayName confusion
- Issue #4: Remove or clarify domain role
- Issues #5, #6: Document and accept as-is

### Option B: Fix Domain Only (Focused)

**Pros**: Smaller scope, lower risk
**Cons**: Future rework for other issues
**Estimated effort**: ~21-30 hours (from PLAN)

**Includes**:
- Domain refactor (all 8 sprints from PLAN)
- Rework tasks 1-4 from this document
- Issues #1, #3, #4 deferred to separate tickets

### Recommendation

**Option B (Focused)** is recommended:

1. Domain refactor is well-specified and critical path
2. Other issues are real but not blocking
3. Splitting work reduces risk of cascading changes
4. Can revisit other issues after domain model stabilizes

**Next steps**:
1. User approves this rework document
2. Update PLAN/DOD to include Tasks 1-4
3. Create separate tickets for Issues #1, #3, #4 (deferred)
4. Proceed with revised domain refactor plan

---

## Impact on Timeline

**Original estimate**: 21-30 hours (from PLAN)
**Rework additions**: +3-4 hours
- Task 1 (rewrite layout blocks): 1-2 hours
- Task 2 (split CircleInstance): 1-2 hours
- Tasks 3-4 (IR types): 1 hour (already in PLAN Sprint 2)

**New estimate**: 24-34 hours

**Confidence**: 80% (down from 85% due to added complexity)

---

## Conclusion

The domain refactor design is **fundamentally correct** (three-stage model), but some implementation details need revision before proceeding:

**Must fix before implementation**:
1. ✅ Layout blocks as field operations (not metadata hacks)
2. ✅ Split CircleInstance into Primitive + Array + Layout
3. ✅ Add FieldExprLayout IR type
4. ✅ Add IRBuilder methods for three-stage model

**Should fix eventually** (deferred):
5. ⏸ Block.domainId conflation
6. ⏸ label/displayName confusion
7. ⏸ BlockRole.domain semantics

**The core architectural insight stands**: Domain is classification, separate from instantiation (count, layout). The three-stage model (Primitive → Array → Layout) is the correct solution.

---

**Status**: Awaiting user review and approval of rework plan
