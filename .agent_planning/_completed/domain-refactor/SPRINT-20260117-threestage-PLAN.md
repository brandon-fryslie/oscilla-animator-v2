# Sprint: Three-Stage Block Architecture

**Generated**: 2026-01-17
**Confidence**: HIGH
**Status**: ✅ COMPLETED
**Completion Date**: 2026-01-17

## Sprint Goal

Implement the correct three-stage block architecture:
1. **Circle** (primitive) → Signal<circle>
2. **Array** (cardinality) → Field<T>
3. **GridLayout** (operation) → Field<vec2>

---

## Scope

### P0: IR Builder Methods (Foundation) ✅

**Files**: `src/compiler/ir/types.ts`, `src/compiler/ir/IRBuilder.ts`, `src/compiler/ir/IRBuilderImpl.ts`

**Add FieldExpr discriminants**:
```typescript
// types.ts - add to FieldExpr union
export interface FieldExprArray {
  readonly kind: 'array';
  readonly instanceId: InstanceId;
  readonly type: SignalType;
}

export interface FieldExprLayout {
  readonly kind: 'layout';
  readonly input: FieldExprId;
  readonly layoutSpec: LayoutSpec;
  readonly type: SignalType;
}
```

**Add IRBuilder methods**:
```typescript
// IRBuilder.ts
fieldArray(instanceId: InstanceId, type: SignalType): FieldExprId;
fieldLayout(input: FieldExprId, layout: LayoutSpec, type: SignalType): FieldExprId;
```

**Acceptance Criteria**:
- [x] `FieldExprArray` and `FieldExprLayout` types exist
- [x] `fieldArray()` creates array field expression
- [x] `fieldLayout()` creates layout field expression
- [x] TypeScript compiles

**Commit**: cfe765c

### P1: Circle Primitive Block (Stage 1) ✅

**File**: `src/blocks/primitive-blocks.ts` (new file)

```typescript
registerBlock({
  type: 'Circle',
  label: 'Circle',
  category: 'primitive',
  description: 'Creates a circle primitive (ONE element)',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'radius', label: 'Radius', type: signalType('float'), defaultValue: 0.02 }
  ],
  outputs: [
    { id: 'circle', label: 'Circle', type: signalType('circle') }  // Signal, not Field!
  ],
  lower: ({ ctx, inputsById, config }) => {
    const radius = inputsById.radius?.id ?? ctx.b.sigConst(config?.radius ?? 0.02, signalType('float'));
    const slot = ctx.b.allocSlot();
    // Pass through radius as the "circle" signal (minimal for now)
    return {
      outputsById: {
        circle: { k: 'sig', id: radius, slot }
      }
    };
  }
});
```

**Acceptance Criteria**:
- [x] Circle block outputs Signal<circle>
- [x] Circle is NOT a field (cardinality = one)
- [x] Block registered and visible in library

**Commits**: 559ece9, e52b65f, 3d336a1

### P2: Array Block (Stage 2 - Cardinality Transform) ✅

**File**: `src/blocks/array-blocks.ts` (new file)

```typescript
registerBlock({
  type: 'Array',
  label: 'Array',
  category: 'instance',
  description: 'Creates multiple copies of an element (Signal<T> → Field<T>)',
  form: 'primitive',
  capability: 'identity',
  inputs: [
    { id: 'element', label: 'Element', type: signalType('any') },
    { id: 'count', label: 'Count', type: signalType('int'), defaultValue: 100 },
    { id: 'maxCount', label: 'Max Count', type: signalType('int'), optional: true }
  ],
  outputs: [
    { id: 'elements', label: 'Elements', type: signalTypeField('any', 'default') },
    { id: 'index', label: 'Index', type: signalTypeField('int', 'default') },
    { id: 't', label: 'T (0-1)', type: signalTypeField('float', 'default') },
    { id: 'active', label: 'Active', type: signalTypeField('bool', 'default') }
  ],
  lower: ({ ctx, inputsById, config }) => {
    const count = (config?.count as number) ?? 100;

    // Create instance
    const instanceId = ctx.b.createInstance(DOMAIN_CIRCLE, count, { kind: 'unordered' });

    // Create array field
    const elementsField = ctx.b.fieldArray(instanceId, signalTypeField('circle', 'default'));
    const indexField = ctx.b.fieldIntrinsic(instanceId, 'index', signalTypeField('int', 'default'));
    const tField = ctx.b.fieldIntrinsic(instanceId, 'normalizedIndex', signalTypeField('float', 'default'));
    const activeField = ctx.b.fieldIntrinsic(instanceId, 'active', signalTypeField('bool', 'default'));

    return {
      outputsById: {
        elements: { k: 'field', id: elementsField, slot: ctx.b.allocSlot() },
        index: { k: 'field', id: indexField, slot: ctx.b.allocSlot() },
        t: { k: 'field', id: tField, slot: ctx.b.allocSlot() },
        active: { k: 'field', id: activeField, slot: ctx.b.allocSlot() }
      }
    };
  }
});
```

**Acceptance Criteria**:
- [x] Array block transforms Signal → Field
- [x] Outputs: elements, index, t, active fields
- [x] Instance is created with correct count
- [x] Sets instance context for downstream blocks

**Commits**: 559ece9, e52b65f

### P3: Rewrite GridLayout Block (Stage 3 - Field Operation) ✅

**File**: `src/blocks/instance-blocks.ts` (update existing)

**Delete**: Current GridLayout that outputs dummy signal with metadata

**Replace with**:
```typescript
registerBlock({
  type: 'GridLayout',
  label: 'Grid Layout',
  category: 'layout',
  description: 'Arranges elements in a grid pattern',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'elements', label: 'Elements', type: signalTypeField('any', 'default') },  // Field input!
    { id: 'rows', label: 'Rows', type: signalType('int'), defaultValue: 10 },
    { id: 'cols', label: 'Columns', type: signalType('int'), defaultValue: 10 }
  ],
  outputs: [
    { id: 'position', label: 'Position', type: signalTypeField('vec2', 'default') }  // Field output!
  ],
  lower: ({ ctx, inputsById, config }) => {
    const elements = inputsById.elements;

    if (!elements || elements.k !== 'field') {
      throw new Error('GridLayout requires a field input (from Array block)');
    }

    const rows = (config?.rows as number) ?? 10;
    const cols = (config?.cols as number) ?? 10;
    const layout: LayoutSpec = { kind: 'grid', rows, cols };

    // Create layout field
    const positionField = ctx.b.fieldLayout(elements.id, layout, signalTypeField('vec2', 'default'));

    return {
      outputsById: {
        position: { k: 'field', id: positionField, slot: ctx.b.allocSlot() }
      }
    };
  }
});
```

**Acceptance Criteria**:
- [x] GridLayout takes Field input (not signal)
- [x] GridLayout outputs Field<vec2> directly (not metadata hack)
- [x] No dummy signal with embedded layout spec
- [x] Instance context propagates correctly

**Commits**: c03c871

### P4: Update Other Layout Blocks ✅

**File**: `src/blocks/instance-blocks.ts`

**Fix LinearLayout** to match GridLayout pattern

**Add CircularLayout** (optional):
```typescript
registerBlock({
  type: 'CircularLayout',
  inputs: [{ id: 'elements', ... }, { id: 'radius', ... }],
  outputs: [{ id: 'position', type: signalTypeField('vec2', ...) }],
  lower: ...
});
```

**Acceptance Criteria**:
- [x] LinearLayout outputs Field<vec2>
- [x] All layout blocks follow same pattern

**Commits**: c03c871

### P5: Delete Conflated CircleInstance Block ⚠️ PARTIAL

**File**: `src/blocks/instance-blocks.ts`

**Delete**: CircleInstance block (lines 104-174)

**Rationale**: Replaced by Circle + Array + GridLayout chain

**Acceptance Criteria**:
- [x] CircleInstance block marked DEPRECATED
- [ ] CircleInstance block removed (deferred - still in use by some patches)
- [x] No metadata hack remains in new blocks
- [ ] Tests updated to use new blocks (partial - steel thread updated)

**Status**: CircleInstance marked as DEPRECATED with clear comment explaining replacement. Not deleted to avoid breaking existing patches. Block remains functional but is clearly marked for future removal.

### P6: Update Steel Thread Test ✅

**File**: `src/compiler/__tests__/steel-thread.test.ts`

**Change**:
```typescript
// OLD:
const instance = b.addBlock('CircleInstance', { count: 100, layoutKind: 'unordered' });

// NEW:
const circle = b.addBlock('Circle', { radius: 0.02 });
const array = b.addBlock('Array', { count: 100 });
const layout = b.addBlock('GridLayout', { rows: 10, cols: 10 });
b.wire(circle, 'circle', array, 'element');
b.wire(array, 'elements', layout, 'elements');
```

**Acceptance Criteria**:
- [x] Steel thread test uses three-stage blocks
- [x] Test compiles and executes
- [x] Rendered output unchanged

**Commits**: e87f4a7, 610140a

### Additional Work Completed

**Compiler Fixes**:
- [x] Instance context propagation through field operation blocks (3f748e7)
- [x] Position range assertions fixed in steel thread test (610140a)

**Naming Clarity**:
- [x] Circle/CirclePrimitive renamed for clarity (3d336a1)

**Demo Updates**:
- [x] main.ts demo patches updated to use three-stage architecture (f0b604d)

---

## Order of Operations

1. ✅ **P0** - IR builder methods (foundation for everything else)
2. ✅ **P1** - Circle primitive block
3. ✅ **P2** - Array block
4. ✅ **P3** - Rewrite GridLayout as field operation
5. ✅ **P4** - Fix LinearLayout, add other layouts
6. ⚠️ **P5** - Mark CircleInstance as DEPRECATED (deletion deferred)
7. ✅ **P6** - Update tests

---

## Dependencies

| Component | Depends On | Status |
|-----------|------------|--------|
| Array block | fieldArray() method | ✅ Complete |
| GridLayout rewrite | fieldLayout() method | ✅ Complete |
| Delete CircleInstance | All new blocks working | ⚠️ Marked DEPRECATED |
| Tests | All blocks implemented | ✅ Complete |

---

## Compatibility

**No changes needed** for:
- ✅ Field operation blocks (18+ blocks already compatible)
- ✅ Render blocks (already validate field inputs)
- ✅ Compiler passes (already instance-aware)
- ✅ Runtime (already instance-aware)

---

## Risk Assessment

| Risk | Likelihood | Mitigation | Status |
|------|------------|------------|--------|
| fieldLayout() implementation complex | Low | Follow existing fieldMap() pattern | ✅ Resolved |
| Instance context propagation | Medium | Already fixed in pass6-block-lowering | ✅ Resolved (3f748e7) |
| Breaking existing patches | Low | Delete CircleInstance last | ✅ Mitigated (marked DEPRECATED) |

---

## Commits

1. `cfe765c` - feat(ir): Add fieldArray() and fieldLayout() builder methods (P0)
2. `559ece9` - feat(blocks): Add Circle and Array blocks (P1-P2)
3. `e52b65f` - feat(blocks): Add Circle and Array blocks (P1-P2)
4. `3d9cf2a` - feat(ir): Clean up deprecated domain system (P0)
5. `c03c871` - feat(blocks): Rewrite GridLayout and LinearLayout blocks (P3-P4)
6. `e87f4a7` - feat(blocks): Update blocks with default sources and fix test (P6)
7. `3f748e7` - fix(compiler): Propagate instance context through field operation blocks
8. `610140a` - test(steel-thread): Fix position range assertions
9. `3d336a1` - refactor(blocks): Rename Circle/CirclePrimitive for clarity
10. `f0b604d` - fix(main): Update demo patches to use three-stage architecture

---

## Test Results

```
Test Files  1 failed | 15 passed | 5 skipped (21)
     Tests  2 failed | 250 passed | 34 skipped (286)
```

**Failed tests**: 2 Hash Block tests (pre-existing, unrelated to this sprint)
- Hash Block: different seeds produce different results
- Hash Block: output is always in [0, 1) range

All three-stage architecture tests passing.
