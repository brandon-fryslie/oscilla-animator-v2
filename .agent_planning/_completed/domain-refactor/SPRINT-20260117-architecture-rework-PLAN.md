# Sprint: Architecture Rework - Three-Stage Model

**Generated**: 2026-01-17
**Confidence**: HIGH
**Status**: READY FOR IMPLEMENTATION

## Sprint Goal

Implement the correct three-stage architecture (Primitive → Array → Layout) and delete all legacy migration code.

---

## Scope

### P0: Delete Legacy Migration Code & Tests

The following are legacy shims that should never have existed this long:

**Delete from tests**:
- `src/core/__tests__/canonical-types.test.ts`: Delete `worldToAxes` test block (lines 394-434)
- `src/compiler/ir/__tests__/bridges.test.ts`: Delete tests using `domainRef`
- `src/ui/components/__tests__/BlockLibrary.test.tsx`: Fix or delete `getBlockCategories` tests

**Delete from exports** (`src/types/index.ts`):
- Remove `worldToAxes` export (function doesn't exist)
- Remove `domainRef` export (function doesn't exist)

**Acceptance Criteria**:
- [ ] No imports of `worldToAxes` anywhere
- [ ] No imports of `domainRef` anywhere
- [ ] All remaining tests pass
- [ ] `npm run typecheck` passes

### P1: Implement Three-Stage Blocks

**Files**: `src/blocks/primitive-blocks.ts` (new), `src/blocks/array-blocks.ts` (new), update `src/blocks/instance-blocks.ts`

**Stage 1 - Circle Primitive Block**:
```typescript
registerBlock({
  type: 'Circle',
  inputs: [{ id: 'radius', type: signalTypeSignal('float') }],
  outputs: [{ id: 'circle', type: signalTypeSignal('circle') }],
  lower: ({ ctx, inputsById }) => {
    // Creates ONE circle as Signal<circle>
    const primitiveId = ctx.b.createPrimitive('circle', {
      radius: inputsById.radius
    });
    return { circle: ctx.b.sigPrimitive(primitiveId) };
  }
});
```

**Stage 2 - Array Block** (cardinality transform):
```typescript
registerBlock({
  type: 'Array',
  inputs: [
    { id: 'element', type: signalTypeSignal('any') },
    { id: 'count', type: signalTypeSignal('int') },
    { id: 'maxCount', type: signalTypeSignal('int') }
  ],
  outputs: [
    { id: 'elements', type: /* Field<same-as-input> */ },
    { id: 'index', type: /* Field<int> */ },
    { id: 't', type: /* Field<float> */ },
    { id: 'active', type: /* Field<bool> */ }
  ],
  lower: ({ ctx, inputsById }) => {
    // Transform Signal<T> → Field<T>
    const instanceId = ctx.b.createInstance(/* from element */, count, maxCount);
    return {
      elements: ctx.b.fieldArray(instanceId),
      index: ctx.b.fieldIntrinsic(instanceId, 'index'),
      t: ctx.b.fieldIntrinsic(instanceId, 't'),
      active: ctx.b.fieldIntrinsic(instanceId, 'active')
    };
  }
});
```

**Stage 3 - GridLayout Block** (field operation):
```typescript
registerBlock({
  type: 'GridLayout',
  inputs: [
    { id: 'elements', type: /* Field<any> */ },
    { id: 'rows', type: signalTypeSignal('int') },
    { id: 'cols', type: signalTypeSignal('int') }
  ],
  outputs: [
    { id: 'position', type: /* Field<vec2> */ }
  ],
  lower: ({ ctx, inputsById }) => {
    // Field operation: outputs Field<vec2> DIRECTLY
    // NO metadata hack
    const instanceId = ctx.inferredInstance;
    return {
      position: ctx.b.fieldLayout(instanceId, 'grid', {
        rows: inputsById.rows,
        cols: inputsById.cols
      })
    };
  }
});
```

**Acceptance Criteria**:
- [ ] Circle block outputs Signal<circle>
- [ ] Array block transforms Signal → Field + intrinsics
- [ ] GridLayout outputs Field<vec2> directly (NO metadata hack)
- [ ] Chain works: Circle → Array → GridLayout → Render

### P2: Delete Conflated CircleInstance

**Files**: `src/blocks/instance-blocks.ts`

**Delete**:
- `CircleInstance` block (conflates primitive+array+layout)
- Layout metadata hack code
- `GridLayout` and `LinearLayout` blocks that output dummy signals

**Acceptance Criteria**:
- [ ] `CircleInstance` block gone
- [ ] No dummy signal + metadata pattern anywhere
- [ ] Old layout blocks replaced with proper field-outputting versions

### P3: Delete Old Domain Types

**Files**: `src/compiler/ir/types.ts`, `src/compiler/ir/IRBuilderImpl.ts`, `src/compiler/index.ts`

**Delete**:
- `DomainDef` interface
- `createDomain()` method
- `getDomains()` method
- `domains` map in IRBuilderImpl
- Old exports from `compiler/index.ts`

**Acceptance Criteria**:
- [ ] `grep -r "DomainDef" src/` returns nothing
- [ ] `grep -r "createDomain" src/` returns nothing
- [ ] All tests pass

---

## Order of Operations

1. **P0** - Delete legacy tests/exports (get to green baseline)
2. **P1** - Implement new three-stage blocks
3. **P2** - Delete conflated CircleInstance
4. **P3** - Delete old DomainDef types

---

## The Real 5-Axis API (use this, not bridges)

```typescript
// Creating types directly:
signalTypeSignal(payload)           // one + continuous
signalTypeField(payload, instance)  // many(instance) + continuous
signalTypeStatic(payload)           // zero + continuous
signalTypeTrigger(payload)          // one + discrete
signalTypePerLaneEvent(payload, instance)  // many(instance) + discrete

// Cardinality constructors:
cardinalityZero()
cardinalityOne()
cardinalityMany(instanceRef)  // Takes InstanceRef, NOT DomainRef
```

No bridges. No shims. Direct usage.
