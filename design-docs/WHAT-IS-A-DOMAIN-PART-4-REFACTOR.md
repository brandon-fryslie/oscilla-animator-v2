# Part 4: Domain Refactor — Touchpoints and Required Changes

**Continuation of:** `WHAT-IS-A-DOMAIN.md`

This document catalogs the codebase changes required to implement the correct domain model. The goal is a **clean cutover** — no bridging, no dual code paths, no special cases. All work is blocked until this is complete.

---

## Executive Summary

The current codebase has a fundamental conflation: `DomainId` and `DomainDef` mix **domain type** (what kind of thing) with **instantiation** (how many, what layout). This must be separated into:

1. **DomainType** — Classification (shape, circle, control, event)
2. **InstanceDecl** — Configuration (count, layout, lifecycle)
3. **InstanceId** — Reference to a specific instantiation

Every file that touches domain concepts needs updating. The changes fall into categories:

| Category | Scope | Effort |
|----------|-------|--------|
| Type System Core | 3 files | Major rewrite |
| IR Types | 4 files | Major rewrite |
| IRBuilder | 2 files | Significant changes |
| Block Library | 11 files | Pattern-based updates |
| Compiler Passes | 6+ files | Moderate changes |
| Runtime | 4 files | Moderate changes |
| Tests | 8+ files | Rewrite to match new model |

---

## Category 1: Type System Core

### File: `src/core/canonical-types.ts`

**Current problem:** `DomainRef` just wraps a string ID. It doesn't distinguish domain TYPE from instance ID.

**Required changes:**

```typescript
// DELETE these (incorrect model):
export type DomainId = string;
export interface DomainRef {
  readonly kind: 'domain';
  readonly id: DomainId;
}
export function domainRef(id: DomainId): DomainRef;

// DELETE DomainShape, DomainDecl (conflate type with instantiation):
export type DomainShape = ...;
export interface DomainDecl { ... }
export function domainDeclFixedCount(...): DomainDecl;
export function domainDeclGrid2d(...): DomainDecl;
// etc.

// ADD: Domain Type System
export type DomainTypeId = string & { readonly __brand: 'DomainTypeId' };

export interface DomainType {
  readonly id: DomainTypeId;
  readonly parent: DomainTypeId | null;  // For subtyping (circle extends shape)
  readonly intrinsics: readonly IntrinsicSpec[];
}

export interface IntrinsicSpec {
  readonly name: string;
  readonly type: PayloadType;
  readonly computation: 'inherent' | 'derived';
}

// ADD: Instance System
export type InstanceId = string & { readonly __brand: 'InstanceId' };

export interface InstanceRef {
  readonly kind: 'instance';
  readonly domainType: DomainTypeId;
  readonly instanceId: InstanceId;
}

// UPDATE: Cardinality to use InstanceRef
export type Cardinality =
  | { readonly kind: 'zero' }
  | { readonly kind: 'one' }
  | { readonly kind: 'many'; readonly instance: InstanceRef };  // Changed from 'domain'
```

**Also update:** All helper functions that create cardinality values.

### File: `src/core/__tests__/canonical-types.test.ts`

**Current state:** Tests for the old DomainDecl, DomainShape functions.

**Required changes:** Delete all tests for removed types. Add tests for:
- DomainType hierarchy (isSubdomain checks)
- InstanceRef creation
- Cardinality with instance references
- Extent unification with instance-aware cardinality

### File: `src/types/index.ts`

**Current state:** Re-exports domain types, may have additional domain-related types.

**Required changes:** Update re-exports to match new type system. Remove any lingering old domain types.

---

## Category 2: IR Types

### File: `src/compiler/ir/Indices.ts`

**Current problem:** Has `DomainId` as a branded string, but it's used for both domain type AND instance.

**Required changes:**

```typescript
// RENAME/SPLIT:
// Old: export type DomainId = string & { readonly __brand: 'DomainId' };
// Old: export function domainId(s: string): DomainId;

// New:
export type DomainTypeId = string & { readonly __brand: 'DomainTypeId' };
export type InstanceId = string & { readonly __brand: 'InstanceId' };

export function domainTypeId(s: string): DomainTypeId { return s as DomainTypeId; }
export function instanceId(s: string): InstanceId { return s as InstanceId; }
```

### File: `src/compiler/ir/types.ts`

**Current problem:** `DomainDef` mixes domain type with count/params. `FieldExprSource` references domain as if it were an instance.

**Required changes:**

```typescript
// DELETE DomainDef (incorrect conflation):
export interface DomainDef {
  readonly id: DomainId;
  readonly kind: 'grid' | 'n' | 'path';  // This is layout, not domain
  readonly count: number;                 // This is instantiation
  readonly elementIds: readonly string[];
  readonly params: Readonly<Record<string, unknown>>;
}

// ADD: Separate Instance Declaration
export interface InstanceDecl {
  readonly id: InstanceId;
  readonly domainType: DomainTypeId;
  readonly count: number | 'dynamic';
  readonly layout: LayoutSpec;
  readonly lifecycle: 'static' | 'dynamic' | 'pooled';
}

export type LayoutSpec =
  | { kind: 'unordered' }
  | { kind: 'grid'; rows: number; cols: number }
  | { kind: 'circular'; radius: number }
  | { kind: 'linear'; spacing: number }
  | { kind: 'random'; bounds: { x: number; y: number; w: number; h: number }; seed: number }
  | { kind: 'along-path'; pathInstanceId: InstanceId }
  | { kind: 'custom'; positionField: FieldExprId };

// UPDATE FieldExprSource:
export interface FieldExprSource {
  readonly kind: 'source';
  readonly instanceId: InstanceId;        // Which instance (not domain!)
  readonly intrinsic: string;             // 'position', 'index', 'radius', etc.
  readonly type: SignalType;
}

// UPDATE all FieldExpr variants that have domain?: DomainId
// Change to: instanceId?: InstanceId

// UPDATE IRProgram:
export interface IRProgram {
  readonly timeModel: TimeModel;
  readonly signals: ReadonlyMap<SigExprId, SigExpr>;
  readonly fields: ReadonlyMap<FieldExprId, FieldExpr>;
  readonly events: ReadonlyMap<EventExprId, EventExpr>;
  readonly instances: ReadonlyMap<InstanceId, InstanceDecl>;  // Renamed from domains
  readonly steps: readonly Step[];
  readonly slotCount: number;
  readonly stateSlotCount?: number;
}

// UPDATE StepMaterialize and StepRender:
export interface StepMaterialize {
  readonly kind: 'materialize';
  readonly field: FieldExprId;
  readonly instanceId: InstanceId;  // Changed from domain
  readonly target: ValueSlot;
}

export interface StepRender {
  readonly kind: 'render';
  readonly instanceId: InstanceId;  // Changed from domain
  readonly position: FieldExprId;
  readonly color: FieldExprId;
  readonly size?: ...;
  readonly shape?: ...;
}
```

### File: `src/compiler/ir/IRBuilder.ts` (interface)

**Current problem:** Methods use `DomainId` for what should be instances.

**Required changes:**

```typescript
// RENAME createDomain → createInstance
// Old: createDomain(kind: 'grid' | 'n' | 'path', count: number, params?: Record<string, unknown>): DomainId;
// New:
createInstance(
  domainType: DomainTypeId,
  count: number | 'dynamic',
  layout: LayoutSpec,
  lifecycle?: 'static' | 'dynamic' | 'pooled'
): InstanceId;

// RENAME getDomains → getInstances
// Old: getDomains(): ReadonlyMap<DomainId, DomainDef>;
// New:
getInstances(): ReadonlyMap<InstanceId, InstanceDecl>;

// UPDATE fieldSource:
// Old: fieldSource(domain: DomainId, sourceId: 'pos0' | 'idRand' | 'index' | 'normalizedIndex', type: SignalType): FieldExprId;
// New:
fieldIntrinsic(instanceId: InstanceId, intrinsic: string, type: SignalType): FieldExprId;

// DELETE defineDomain (replaced by createInstance)
```

### File: `src/compiler/ir/IRBuilderImpl.ts` (implementation)

**Required changes:** Implement all interface changes. Key updates:

```typescript
// RENAME domainDefs → instances
private instances = new Map<InstanceId, InstanceDecl>();

// UPDATE createInstance implementation
createInstance(
  domainType: DomainTypeId,
  count: number | 'dynamic',
  layout: LayoutSpec,
  lifecycle: 'static' | 'dynamic' | 'pooled' = 'static'
): InstanceId {
  const id = instanceId(`inst_${this.instanceCounter++}`);
  this.instances.set(id, { id, domainType, count, layout, lifecycle });
  return id;
}

// UPDATE fieldIntrinsic (was fieldSource)
fieldIntrinsic(instanceId: InstanceId, intrinsic: string, type: SignalType): FieldExprId {
  const id = fieldExprId(this.fieldExprs.length);
  this.fieldExprs.push({ kind: 'source', instanceId, intrinsic, type });
  return id;
}
```

---

## Category 3: Block Library

### Pattern: Hardcoded `domainId('default')`

**Files affected:**
- `src/blocks/identity-blocks.ts`
- `src/blocks/geometry-blocks.ts`
- `src/blocks/field-operations-blocks.ts`

**Current pattern (WRONG):**
```typescript
const domain = domainId('default');
const indexField = ctx.b.fieldSource(domain, 'normalizedIndex', signalTypeField('float', 'default'));
```

**Correct pattern:**
```typescript
// Instance should come from context, not hardcoded
const instanceId = ctx.instance;  // Propagated through lowering context
if (!instanceId) {
  throw new Error('Block requires instance context');
}
const indexField = ctx.b.fieldIntrinsic(instanceId, 'normalizedIndex', signalTypeField('float', instanceId));
```

**Note:** This requires updating the lowering context to propagate instance information.

### Pattern: Domain blocks that create instances

**File:** `src/blocks/domain-blocks.ts`

**Current (WRONG):** `GridDomain` and `DomainN` blocks that conflate domain with instantiation.

**Correct replacement:** Instance blocks per domain type.

```typescript
// DELETE: GridDomain, DomainN

// ADD: Shape Instance block (example)
registerBlock({
  type: 'CircleInstance',
  label: 'Circles',
  category: 'instance',
  description: 'Creates a collection of circles',
  form: 'primitive',
  capability: 'instance',  // New capability type
  inputs: [
    { id: 'count', label: 'Count', type: signalType('int') },
    { id: 'layout', label: 'Layout', type: signalType('layout') },  // New layout type
  ],
  outputs: [
    { id: 'position', label: 'Position', type: signalTypeField('vec2', 'self') },
    { id: 'radius', label: 'Radius', type: signalTypeField('float', 'self') },
    { id: 'index', label: 'Index', type: signalTypeField('int', 'self') },
    { id: 't', label: 't [0,1]', type: signalTypeField('float', 'self') },
  ],
  lower: ({ ctx, inputsById, config }) => {
    const count = resolveCount(inputsById.count, config);
    const layout = resolveLayout(inputsById.layout, config);

    // Create instance
    const instId = ctx.b.createInstance(
      domainTypeId('circle'),
      count,
      layout
    );

    // Output intrinsics as field expressions
    const posField = ctx.b.fieldIntrinsic(instId, 'position', signalTypeField('vec2', instId));
    const radiusField = ctx.b.fieldIntrinsic(instId, 'radius', signalTypeField('float', instId));
    const indexField = ctx.b.fieldIntrinsic(instId, 'index', signalTypeField('int', instId));
    const tField = ctx.b.fieldIntrinsic(instId, 'normalizedIndex', signalTypeField('float', instId));

    return {
      instanceId: instId,  // Propagate to downstream blocks
      outputsById: {
        position: { k: 'field', id: posField, slot: ctx.b.allocSlot() },
        radius: { k: 'field', id: radiusField, slot: ctx.b.allocSlot() },
        index: { k: 'field', id: indexField, slot: ctx.b.allocSlot() },
        t: { k: 'field', id: tField, slot: ctx.b.allocSlot() },
      },
    };
  },
});

// ADD: Layout blocks
registerBlock({
  type: 'GridLayout',
  label: 'Grid',
  category: 'layout',
  description: 'Arranges elements in a grid',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'rows', label: 'Rows', type: signalType('int') },
    { id: 'cols', label: 'Cols', type: signalType('int') },
    { id: 'spacing', label: 'Spacing', type: signalType('float') },
  ],
  outputs: [
    { id: 'layout', label: 'Layout', type: signalType('layout') },
  ],
  lower: ({ ctx, inputsById, config }) => {
    const rows = resolveInt(inputsById.rows, config, 'rows', 10);
    const cols = resolveInt(inputsById.cols, config, 'cols', 10);
    const spacing = resolveFloat(inputsById.spacing, config, 'spacing', 1.0);

    // Layout is a compile-time construct, not a runtime signal
    const layoutSpec: LayoutSpec = { kind: 'grid', rows, cols, spacing };

    return {
      layoutSpec,  // Special return for layout blocks
      outputsById: {},
    };
  },
});
```

### Pattern: Render blocks with domain input

**File:** `src/blocks/render-blocks.ts`

**Current (WRONG):**
```typescript
inputs: [
  { id: 'domain', label: 'Domain', type: signalType('float') },  // What even is this?
  { id: 'pos', label: 'Position', type: signalTypeField('vec2', 'default') },
  ...
]
```

**Correct:**
```typescript
inputs: [
  // No domain input - instance is inferred from field inputs
  { id: 'pos', label: 'Position', type: signalTypeField('vec2', 'any') },
  { id: 'color', label: 'Color', type: signalTypeField('color', 'same-as:pos') },
  { id: 'size', label: 'Size', type: signalTypeField('float', 'same-as:pos') },
],
lower: ({ ctx, inputsById }) => {
  const pos = inputsById.pos;
  if (!pos || pos.k !== 'field') {
    throw new Error('Render requires field input');
  }

  // Instance is extracted from the field's type
  const instanceId = extractInstanceFromField(pos);

  // Emit render step with instance reference
  ctx.b.emitStep({
    kind: 'render',
    instanceId,
    position: pos.id,
    color: inputsById.color?.id,
    size: inputsById.size?.id,
  });

  return { outputsById: {} };
},
```

### Files requiring pattern updates:

| File | Pattern Issues |
|------|----------------|
| `src/blocks/identity-blocks.ts` | Hardcoded `domainId('default')` |
| `src/blocks/geometry-blocks.ts` | Hardcoded `domainId('default')`, Circle block mixes layout with domain |
| `src/blocks/field-operations-blocks.ts` | Uses `fieldSource` with domain |
| `src/blocks/render-blocks.ts` | Domain as input, unclear semantics |
| `src/blocks/domain-blocks.ts` | **DELETE ENTIRELY** — GridDomain/DomainN embody wrong model |
| `src/blocks/field-blocks.ts` | May need instance propagation |
| `src/blocks/signal-blocks.ts` | Should be domain-agnostic (signals, not fields) |
| `src/blocks/time-blocks.ts` | Should be domain-agnostic |
| `src/blocks/color-blocks.ts` | May need instance propagation for field operations |
| `src/blocks/math-blocks.ts` | May need instance propagation for field operations |

---

## Category 4: Compiler Passes

### File: `src/compiler/passes-v2/pass7-schedule.ts`

**Current:** References `DomainId`, `DomainDef`, iterates `domains` map.

**Required changes:**
- Change all `DomainId` → `InstanceId`
- Change all `DomainDef` → `InstanceDecl`
- Update `ScheduleIR.domains` → `ScheduleIR.instances`
- Update step construction to use `instanceId`

### File: `src/compiler/compile.ts`

**Current:** May reference domain types.

**Required changes:** Update to use instance-based model.

### File: `src/compiler/index.ts`

**Required changes:** Update exports.

### File: `src/compiler/passes-v2/pass6-block-lowering.ts`

**Required changes:** Update lowering context to propagate instance information.

### File: `src/compiler/ir/lowerTypes.ts`

**Required changes:** Update any domain references.

### File: `src/compiler/__tests__/domain-unification.test.ts`

**Current:** Tests domain unification (the type-checking of domain compatibility).

**Required changes:** This concept is still needed, but for INSTANCES:
- Two fields must be over the same instance to zip
- Rename to `instance-unification.test.ts`
- Update to test instance compatibility, not domain compatibility

---

## Category 5: Runtime

### File: `src/runtime/Materializer.ts`

**Current:** Uses `DomainId`, `DomainDef`, `domains` map.

**Required changes:**
```typescript
// Update function signature:
// Old: materialize(fieldId, domainId, fields, signals, domains, state, pool)
// New:
materialize(
  fieldId: FieldExprId,
  instanceId: InstanceId,
  fields: readonly FieldExpr[],
  signals: readonly SigExpr[],
  instances: ReadonlyMap<InstanceId, InstanceDecl>,
  state: RuntimeState,
  pool: BufferPool
): ArrayBufferView

// Update domain lookup:
// Old: const domain = domains.get(domainId);
// New:
const instance = instances.get(instanceId);
if (!instance) throw new Error(`Instance ${instanceId} not found`);
const count = typeof instance.count === 'number' ? instance.count : state.dynamicCounts.get(instanceId);
```

### File: `src/runtime/RuntimeState.ts`

**Required changes:** Update any domain references to instance references.

### File: `src/runtime/ScheduleExecutor.ts` (if exists)

**Required changes:** Update step execution to use instance model.

### File: `src/runtime/BufferPool.ts`

**Likely OK** — buffer allocation is domain-agnostic.

---

## Category 6: Tests

All tests referencing the old domain model must be rewritten to test behavior, not implementation.

### Tests to DELETE (test implementation, not behavior):
- Any test that creates `DomainDef` directly
- Any test that calls `domainId()` with hardcoded strings
- Any test asserting on `domain` field presence in IR structures

### Tests to REWRITE:
| File | Changes Needed |
|------|----------------|
| `src/compiler/__tests__/domain-unification.test.ts` | Rename, test instance unification |
| `src/compiler/__tests__/steel-thread.test.ts` | Update to use instance blocks |
| `src/compiler/__tests__/compile.test.ts` | Update IR assertions |
| `src/runtime/__tests__/integration.test.ts` | Update to use instance model |
| `src/compiler/__tests__/slotMeta.test.ts` | May need updates if domain-related |
| `src/stores/__tests__/PatchStore.test.ts` | Update if tests domain blocks |

### Test behavior, not structure:
```typescript
// BAD (tests implementation):
expect(ir.domains.get(domainId('0'))).toEqual({
  kind: 'grid',
  count: 100,
  params: { rows: 10, cols: 10 },
});

// GOOD (tests behavior):
const result = executeFrame(program, { time: 0 });
expect(result.renderedCircles).toHaveLength(100);
expect(result.renderedCircles[0].position).toEqual({ x: 0, y: 0 });
expect(result.renderedCircles[99].position).toEqual({ x: 9, y: 9 });
```

---

## Category 7: Domain Registry (NEW)

A new module is needed to define the domain type hierarchy and intrinsics.

### New File: `src/core/domain-registry.ts`

```typescript
/**
 * Domain Registry
 *
 * Defines the domain type hierarchy and intrinsic properties.
 * This is compile-time configuration, not runtime state.
 */

import type { DomainTypeId, DomainType, IntrinsicSpec, PayloadType } from './canonical-types';

// Domain type constants
export const DOMAIN_SHAPE = 'shape' as DomainTypeId;
export const DOMAIN_CIRCLE = 'circle' as DomainTypeId;
export const DOMAIN_RECTANGLE = 'rectangle' as DomainTypeId;
export const DOMAIN_CONTROL = 'control' as DomainTypeId;
export const DOMAIN_EVENT = 'event' as DomainTypeId;

// Intrinsic definitions
const INTRINSICS = {
  position: { name: 'position', type: 'vec2' as PayloadType, computation: 'inherent' },
  bounds: { name: 'bounds', type: 'vec4' as PayloadType, computation: 'derived' },
  area: { name: 'area', type: 'float' as PayloadType, computation: 'derived' },
  index: { name: 'index', type: 'int' as PayloadType, computation: 'inherent' },
  normalizedIndex: { name: 'normalizedIndex', type: 'float' as PayloadType, computation: 'derived' },
  radius: { name: 'radius', type: 'float' as PayloadType, computation: 'inherent' },
  width: { name: 'width', type: 'float' as PayloadType, computation: 'inherent' },
  height: { name: 'height', type: 'float' as PayloadType, computation: 'inherent' },
} as const;

// Domain type definitions
const DOMAIN_TYPES: ReadonlyMap<DomainTypeId, DomainType> = new Map([
  [DOMAIN_SHAPE, {
    id: DOMAIN_SHAPE,
    parent: null,
    intrinsics: [INTRINSICS.position, INTRINSICS.bounds, INTRINSICS.area, INTRINSICS.index, INTRINSICS.normalizedIndex],
  }],
  [DOMAIN_CIRCLE, {
    id: DOMAIN_CIRCLE,
    parent: DOMAIN_SHAPE,
    intrinsics: [INTRINSICS.radius],  // Plus inherited from shape
  }],
  [DOMAIN_RECTANGLE, {
    id: DOMAIN_RECTANGLE,
    parent: DOMAIN_SHAPE,
    intrinsics: [INTRINSICS.width, INTRINSICS.height],
  }],
  [DOMAIN_CONTROL, {
    id: DOMAIN_CONTROL,
    parent: null,
    intrinsics: [
      { name: 'value', type: 'float', computation: 'inherent' },
      { name: 'min', type: 'float', computation: 'inherent' },
      { name: 'max', type: 'float', computation: 'inherent' },
    ],
  }],
  [DOMAIN_EVENT, {
    id: DOMAIN_EVENT,
    parent: null,
    intrinsics: [
      { name: 'time', type: 'float', computation: 'inherent' },
      { name: 'fired', type: 'bool', computation: 'inherent' },
    ],
  }],
]);

// Registry API
export function getDomainType(id: DomainTypeId): DomainType | undefined {
  return DOMAIN_TYPES.get(id);
}

export function isSubdomainOf(sub: DomainTypeId, parent: DomainTypeId): boolean {
  if (sub === parent) return true;
  const subType = DOMAIN_TYPES.get(sub);
  if (!subType || !subType.parent) return false;
  return isSubdomainOf(subType.parent, parent);
}

export function getIntrinsics(domainType: DomainTypeId): readonly IntrinsicSpec[] {
  const result: IntrinsicSpec[] = [];
  let current: DomainTypeId | null = domainType;

  while (current) {
    const type = DOMAIN_TYPES.get(current);
    if (!type) break;
    result.push(...type.intrinsics);
    current = type.parent;
  }

  return result;
}

export function hasIntrinsic(domainType: DomainTypeId, intrinsicName: string): boolean {
  return getIntrinsics(domainType).some(i => i.name === intrinsicName);
}
```

---

## Execution Order

The refactor should proceed in this order to minimize broken intermediate states:

1. **Add new types alongside old** (temporarily)
   - Add `DomainTypeId`, `InstanceId`, `InstanceRef`, `InstanceDecl`
   - Add domain registry module
   - Keep old types temporarily

2. **Update IR types**
   - Update `IRBuilder` interface
   - Update `IRBuilderImpl`
   - Update IR type definitions

3. **Update block library**
   - Create new instance blocks
   - Create layout blocks
   - Update existing blocks to use new model
   - Delete `domain-blocks.ts`

4. **Update compiler passes**
   - Update pass7-schedule
   - Update other passes as needed

5. **Update runtime**
   - Update Materializer
   - Update RuntimeState
   - Update execution

6. **Delete old types**
   - Remove old `DomainId`, `DomainRef`, `DomainDef`
   - Remove all deprecated functions

7. **Update tests**
   - Delete tests for removed types
   - Add tests for new behavior
   - Ensure all tests pass

---

## Tricky Parts

### 1. Lowering Context and Instance Propagation

Currently, blocks don't receive instance information in their lowering context. This needs to change:

```typescript
interface LoweringContext {
  b: IRBuilder;
  // ADD:
  instance?: InstanceId;  // Current instance context (if any)
  inferredInstance?: InstanceId;  // Inferred from connected inputs
}
```

Blocks that operate on fields need to:
1. Check if they have an instance context
2. If not, infer it from their field inputs
3. Propagate instance to outputs

### 2. signalTypeField() Usage

Currently `signalTypeField('float', 'default')` creates a type with domain = 'default'. This needs to change:

```typescript
// OLD: Domain ID embedded in type
signalTypeField('float', 'default')

// NEW: Instance reference is NOT part of the type directly
// Instead, the type says "this is a field" and instance is tracked separately
signalTypeField('float')  // Just says "this is a field type"

// Instance association happens at the expression level, not type level
```

This is a subtle but important change. The TYPE says "this is a field (many cardinality)". The EXPRESSION says "this field is over instance X".

### 3. Layout Computation

Layout blocks output `LayoutSpec`, which is a compile-time construct, not a runtime signal. This needs special handling in the lowering pipeline.

### 4. Dynamic Count

If count is connected to a signal (animated), the instance has `count: 'dynamic'`. The runtime needs to:
- Evaluate the count signal each frame
- Resize buffers appropriately
- Handle element creation/destruction

This is complex and may be deferred to a later phase.

---

## UI Considerations

This document focuses on core type system and IR changes. UI changes are covered separately but include:

- Wire colors per domain type
- Block palette filtering by domain compatibility
- Conversion suggestions on domain mismatch
- Collapsible intrinsic sections on instance blocks

See `DOMAIN-UI-CONCEPTS.md` for detailed UI discussion.

---

## Success Criteria

The refactor is complete when:

1. `DomainId` (old) no longer exists in the codebase
2. `DomainDef` (old) no longer exists in the codebase
3. `GridDomain` and `DomainN` blocks are deleted
4. All blocks that work with fields use instance-based model
5. All tests pass
6. The steel-thread example compiles and runs with new model
7. No "domain" in the codebase refers to the old conflated concept

---

## References

- `WHAT-IS-A-DOMAIN.md` — Conceptual foundation
- Part 3 in that document — Detailed end-state specification
- `src/core/canonical-types.ts` — Current type system (to be updated)
- `src/compiler/ir/types.ts` — Current IR types (to be updated)
