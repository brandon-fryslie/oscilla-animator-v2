# Sprint: Three-Stage Block Architecture

**Generated**: 2026-01-17
**Confidence**: HIGH
**Status**: READY FOR IMPLEMENTATION

## Sprint Goal

Implement the correct three-stage block architecture:
1. **Circle** (primitive) → Signal<circle>
2. **Array** (cardinality) → Field<T>
3. **GridLayout** (operation) → Field<vec2>

---

## Scope

### P0: IR Builder Methods (Foundation)

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
- [ ] `FieldExprArray` and `FieldExprLayout` types exist
- [ ] `fieldArray()` creates array field expression
- [ ] `fieldLayout()` creates layout field expression
- [ ] TypeScript compiles

### P1: Circle Primitive Block (Stage 1)

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
- [ ] Circle block outputs Signal<circle>
- [ ] Circle is NOT a field (cardinality = one)
- [ ] Block registered and visible in library

### P2: Array Block (Stage 2 - Cardinality Transform)

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
- [ ] Array block transforms Signal → Field
- [ ] Outputs: elements, index, t, active fields
- [ ] Instance is created with correct count
- [ ] Sets instance context for downstream blocks

### P3: Rewrite GridLayout Block (Stage 3 - Field Operation)

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
- [ ] GridLayout takes Field input (not signal)
- [ ] GridLayout outputs Field<vec2> directly (not metadata hack)
- [ ] No dummy signal with embedded layout spec
- [ ] Instance context propagates correctly

### P4: Update Other Layout Blocks

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
- [ ] LinearLayout outputs Field<vec2>
- [ ] All layout blocks follow same pattern

### P5: Delete Conflated CircleInstance Block

**File**: `src/blocks/instance-blocks.ts`

**Delete**: CircleInstance block (lines 104-174)

**Rationale**: Replaced by Circle + Array + GridLayout chain

**Acceptance Criteria**:
- [ ] CircleInstance block removed
- [ ] No metadata hack remains
- [ ] Tests updated to use new blocks

### P6: Update Steel Thread Test

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
- [ ] Steel thread test uses three-stage blocks
- [ ] Test compiles and executes
- [ ] Rendered output unchanged

---

## Order of Operations

1. **P0** - IR builder methods (foundation for everything else)
2. **P1** - Circle primitive block
3. **P2** - Array block
4. **P3** - Rewrite GridLayout as field operation
5. **P4** - Fix LinearLayout, add other layouts
6. **P5** - Delete CircleInstance
7. **P6** - Update tests

---

## Dependencies

| Component | Depends On |
|-----------|------------|
| Array block | fieldArray() method |
| GridLayout rewrite | fieldLayout() method |
| Delete CircleInstance | All new blocks working |
| Tests | All blocks implemented |

---

## Compatibility

**No changes needed** for:
- ✅ Field operation blocks (18+ blocks already compatible)
- ✅ Render blocks (already validate field inputs)
- ✅ Compiler passes (already instance-aware)
- ✅ Runtime (already instance-aware)

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| fieldLayout() implementation complex | Low | Follow existing fieldMap() pattern |
| Instance context propagation | Medium | Already fixed in pass6-block-lowering |
| Breaking existing patches | Low | Delete CircleInstance last |
