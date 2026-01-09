# Oscilla v2 Architecture

> **Animations are not timelines. They are living systems observed over time.**

## Guiding Principles

1. **One Path** - No feature flags, no legacy fallbacks, no dual modes
2. **Explicit Everything** - Execution order, identity, state, transforms, time
3. **Schedule is Data** - The IR is inspectable, diffable, traceable
4. **Lazy by Default** - Fields evaluate at sinks, not eagerly
5. **Renderer is Dumb** - It draws commands, zero creative logic

## Type Hierarchy

| World | Description | Evaluation | Representation |
|-------|-------------|------------|----------------|
| **Scalar** | Compile-time constants | Once at compile | `number \| string \| boolean` |
| **Signal** | Time-indexed values | Once per frame | `SigExprId` |
| **Field** | Per-element lazy expressions | At render sinks | `FieldExprId` |
| **Event** | Discrete triggers | Edge detection | `EventExprId` |

```
Scalar → Signal → Field  (automatic promotion)
Field → Signal           (explicit reduction, requires combine fn)
```

## Directory Structure

```
src/
  types/           # Core type definitions (TypeDesc, worlds)
  graph/           # Patch graph representation
    Patch.ts       # Patch type (blocks, edges)
    normalize.ts   # Graph normalization
  compiler/        # Patch → IR compilation
    compile.ts     # Main entry point
    passes/        # Compilation passes
    ir/            # IR types and builder
    blocks/        # Block lowering functions
  runtime/         # IR → Frame execution
    executor.ts    # Schedule executor
    slots.ts       # ValueStore (slot-addressed)
  render/          # Frame → Pixels
    commands.ts    # Render command types
    canvas2d.ts    # Canvas2D renderer
```

## Compilation Pipeline

```
Patch → Normalize → TypeCheck → TimeResolve → DepGraph → Validate → Lower → Link → Schedule
```

Each pass:
- Takes immutable input
- Returns new immutable output (or throws with all errors)
- Has no side effects
- Is independently testable

## Key Types

### TypeDesc
```typescript
interface TypeDesc {
  world: 'scalar' | 'signal' | 'field' | 'event';
  domain: 'float' | 'int' | 'phase' | 'time' | 'color' | 'vec2' | 'string';
}
```

### Patch
```typescript
interface Patch {
  blocks: ReadonlyMap<BlockId, Block>;
  edges: readonly Edge[];
}

interface Block {
  id: BlockId;
  type: BlockType;
  params: Record<string, unknown>;
}

interface Edge {
  from: { blockId: BlockId; portId: PortId };
  to: { blockId: BlockId; portId: PortId };
}
```

### IR Nodes
```typescript
// Signal expressions
type SigExpr =
  | { kind: 'const'; value: number; type: TypeDesc }
  | { kind: 'slot'; slot: SlotId }
  | { kind: 'map'; input: SigExprId; fn: PureFn }
  | { kind: 'zip'; inputs: SigExprId[]; fn: PureFn };

// Field expressions
type FieldExpr =
  | { kind: 'const'; value: number; type: TypeDesc }
  | { kind: 'source'; sourceId: string }  // pos0, idRand, etc.
  | { kind: 'broadcast'; signal: SigExprId }
  | { kind: 'map'; input: FieldExprId; fn: PureFn }
  | { kind: 'zip'; inputs: FieldExprId[]; fn: PureFn }
  | { kind: 'zipSig'; field: FieldExprId; signals: SigExprId[]; fn: PureFn };
```

### Schedule
```typescript
interface Schedule {
  timeModel: TimeModel;
  steps: readonly Step[];
  slots: SlotTable;
  domains: DomainTable;
  renderTree: RenderTree;
}

type Step =
  | { kind: 'evalSig'; expr: SigExprId; target: SlotId }
  | { kind: 'materialize'; field: FieldExprId; domain: DomainId; target: SlotId }
  | { kind: 'render'; commands: RenderCommandId[] };
```

## Block Registration

ONE pattern. No exceptions.

```typescript
// In src/compiler/blocks/<category>/<BlockType>.ts

import { registerBlock, type BlockLower } from '../registry';

const lower: BlockLower = ({ ctx, inputsById, config }) => {
  // Access inputs by port ID
  const a = inputsById.a;
  const b = inputsById.b;

  // Emit IR
  const result = ctx.sigZip([a.id, b.id], OpCode.Add);

  // Return outputs by port ID
  return {
    out: { kind: 'sig', id: result, type: outputType }
  };
};

registerBlock({
  kind: 'AddSignal',
  inputs: [
    { portId: 'a', type: 'Signal:float' },
    { portId: 'b', type: 'Signal:float' },
  ],
  outputs: [
    { portId: 'out', type: 'Signal:float' },
  ],
  lower,
});
```

## Non-Negotiables

1. **No `Math.random()` at runtime** - All randomness seeded at compile
2. **Player time is unbounded** - Never wrap `t`, cycles are derived
3. **Fields are lazy** - Evaluate only at render sinks
4. **World/domain mismatches are compile errors**
5. **Exactly one TimeRoot per patch**
6. **Slot-addressed execution** - No string lookups in hot paths
7. **Schedule is inspectable data** - Debug by examining IR

## Testing Philosophy

Tests verify **behavior**, not **patterns**.

```typescript
// GOOD: Tests behavior
test('adding two signals produces their sum', () => {
  const patch = buildPatch([
    block('const', { value: 3 }),
    block('const', { value: 4 }),
    block('add'),
    wire('const1.out', 'add.a'),
    wire('const2.out', 'add.b'),
  ]);
  const result = compileAndEval(patch, { t: 0 });
  expect(result.get('add.out')).toBe(7);
});

// BAD: Tests implementation pattern
test('add block uses sigZip with Add opcode', () => {
  // Don't test internal IR structure
});
```

## Migration Strategy

Port from v1 by:
1. Reading the v1 implementation to understand behavior
2. Implementing fresh against this architecture
3. Writing behavior tests (not pattern tests)
4. Never copying code patterns from v1
