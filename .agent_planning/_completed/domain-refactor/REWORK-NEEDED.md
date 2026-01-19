# Domain Refactor - Rework Required After Sprint 8

**Created**: 2026-01-17
**Status**: Sprint 8 (Cleanup) in progress
**Problem**: Implementation doesn't match the correct three-stage architecture

---

## The Issue

During the domain refactor (Sprints 2-7), we implemented an architecture that **does not match** the correct three-stage model established in our design conversations and documented in `CONTEXT.md`.

### What We Built (Sprints 2-7)

```
[GridLayout] ──layout──▶ [CircleInstance] ──position,radius,index,t──▶ [Render]
                             count: 100
```

**CircleInstance** conflates:
- Primitive creation (Circle)
- Array instantiation (count → many elements)
- Layout application (position computation)

**Layout blocks** output dummy signals with metadata hacks.

### What We Should Have Built (from CONTEXT.md)

```
[Circle] ──circle──▶ [Array] ──elements──▶ [Grid Layout] ──position──▶ [Render]
  radius: 0.02        count: 100            rows: 10
                      maxCount: 200         cols: 10
  Signal<circle>      Field<circle>         Field<vec2>
  (ONE)               (MANY)                (positions)
```

**Three separate stages**:
1. **Primitive** (Circle): Creates ONE element as Signal<circle>
2. **Array**: Cardinality transform Signal<T> → Field<T, instance>
3. **Layout**: Operation that takes Field and outputs Field<vec2>

---

## Decision Needed

### Option A: Complete Sprint 8, Defer Rework

Finish current cleanup (delete old DomainDef, GridDomain, DomainN references), then create a **new sprint** to refactor toward the three-stage model.

**Pros**: Get to a stable state, existing tests pass
**Cons**: Have to redo block architecture later

### Option B: Rework Now Before Completing Sprint 8

Stop Sprint 8, rewrite instance-blocks.ts and related code to match the three-stage model, then finish cleanup.

**Pros**: One-time correct implementation
**Cons**: More work now, could delay completion

---

## What Needs to Change (When Rework Happens)

### 1. Split CircleInstance into Three Blocks

**Delete**: `CircleInstance` block

**Create**:

```typescript
// Stage 1: Circle Primitive
registerBlock({
  type: 'Circle',
  inputs: [{ id: 'radius', type: signalType('float') }],
  outputs: [{ id: 'circle', type: signalType('circle') }],  // Signal<circle> (ONE)
});

// Stage 2: Array (domain-agnostic)
registerBlock({
  type: 'Array',
  inputs: [
    { id: 'element', type: signalType('any') },  // Signal<T>
    { id: 'count', type: signalType('int') },
    { id: 'maxCount', type: signalType('int') },
  ],
  outputs: [
    { id: 'elements', type: signalTypeField('same-as-input') },  // Field<T>
    { id: 'index', type: signalTypeField('int') },
    { id: 't', type: signalTypeField('float') },
    { id: 'active', type: signalTypeField('bool') },
  ],
});

// Stage 3: Grid Layout (field operation)
registerBlock({
  type: 'GridLayout',
  inputs: [
    { id: 'elements', type: signalTypeField('any') },  // Field<T> input
    { id: 'rows', type: signalType('int') },
    { id: 'cols', type: signalType('int') },
  ],
  outputs: [
    { id: 'position', type: signalTypeField('vec2') },  // Field<vec2> output
  ],
});
```

### 2. Add Missing IR Types

- `PrimitiveDecl`: Declaration of a single element
- `FieldExprArray`: Created by Array block
- `FieldExprLayout`: Created by layout blocks

### 3. Add IRBuilder Methods

- `createPrimitive(domainType, params)` → `PrimitiveId`
- `sigPrimitive(primitiveId)` → `SigExprId`
- `fieldArray(instanceId, domainType)` → `FieldExprId`
- `fieldLayout(instanceId, layoutKind, params)` → `FieldExprId`

### 4. Remove Layout Metadata Hack

Current hack in `instance-blocks.ts`:
```typescript
// WRONG: Layout carried as metadata on dummy signal
const layoutSignal = ctx.b.sigConst(0, signalType('int'));
return { layout: { k: 'sig', id: layoutSignal, metadata: { layoutSpec: layout } } };
```

Correct: Layout blocks are field operations that output `Field<vec2>`.

---

## Remaining Old Code to Delete (Sprint 8 Current Work)

These still need cleanup regardless of rework decision:

- [ ] `DomainDef` in `src/compiler/ir/types.ts`
- [ ] `DomainDef` usage in `IRBuilderImpl.ts`
- [ ] `GridDomain` references in tests
- [ ] `DomainN` references in `main.ts` and tests
- [ ] Old domain exports from `src/compiler/index.ts`

---

## Recommendation

**Complete Sprint 8 first** (delete old types), then create a new task/sprint for the three-stage architecture rework. This gives us:

1. Clean break from old DomainDef model
2. Tests passing on new InstanceDecl model
3. Clear separation between "remove old" and "add correct new"

The current implementation (CircleInstance with layout input) is **functional** even if architecturally impure. We can refine it to the three-stage model in a follow-up.

---

## Reference

See `CONTEXT.md` in this directory for the full correct architecture explanation.
