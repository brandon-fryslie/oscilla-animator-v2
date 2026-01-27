# Implementation Context: feedback-lowering

Generated: 2026-01-27-141055
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-2026-01-27-141055-feedback-lowering-PLAN.md

---

## File: src/blocks/registry.ts

### Location: BlockDefinition interface (around line 300-350)

Current signature:
```typescript
export interface BlockDefinition {
  readonly type: string;
  readonly label?: string;
  readonly category?: string;
  readonly description?: string;
  readonly form?: 'primitive' | 'composite';
  readonly capability?: 'pure' | 'state' | 'event';
  readonly isStateful?: boolean;  // <-- Already exists
  // ... other fields
  readonly lower: (args: LowerArgs) => LowerResult;
}
```

Add after `lower`:
```typescript
  /** Optional: Generate outputs without requiring inputs (for stateful blocks in cycles) */
  readonly lowerOutputsOnly?: (args: { ctx: LowerCtx; config: Record<string, unknown> }) => {
    outputsById: Record<string, ValueRefPacked>;
    stateSlot?: StateSlotId;
  };
```

### Location: LowerArgs interface (around line 280)

Current:
```typescript
export interface LowerArgs {
  ctx: LowerCtx;
  inputs: ValueRefPacked[];
  inputsById: Record<string, ValueRefPacked>;
  config: Record<string, unknown>;
}
```

Add optional field for second pass:
```typescript
export interface LowerArgs {
  ctx: LowerCtx;
  inputs: ValueRefPacked[];
  inputsById: Record<string, ValueRefPacked>;
  config: Record<string, unknown>;
  /** Outputs from lowerOutputsOnly (if called in first pass of two-pass lowering) */
  existingOutputs?: {
    outputsById: Record<string, ValueRefPacked>;
    stateSlot?: StateSlotId;
  };
}
```

### Add helper function (after getBlockDefinition):

```typescript
export function hasLowerOutputsOnly(blockDef: BlockDefinition): boolean {
  return typeof blockDef.lowerOutputsOnly === 'function';
}
```

---

## File: src/blocks/signal-blocks.ts

### Location: UnitDelay block definition (lines 356-402)

Current lower function:
```typescript
lower: ({ ctx, inputsById, config }) => {
  const input = inputsById.in;
  if (!input || input.k !== 'sig') {
    throw new Error('UnitDelay requires signal input');
  }

  const initialValue = (config?.initialValue as number) ?? 0;
  const outType = ctx.outTypes[0];

  // Create state for delayed value
  const stateId = stableStateId(ctx.instanceId, 'delay');
  const stateSlot = ctx.b.allocStateSlot(stateId, { initialValue });

  // Read previous state (this is the output - delayed by 1 frame)
  const outputId = ctx.b.sigStateRead(stateSlot, signalType(FLOAT));

  // Write current input to state for next frame
  ctx.b.stepStateWrite(stateSlot, input.id);

  const slot = ctx.b.allocSlot();

  return {
    outputsById: {
      out: { k: 'sig', id: outputId, slot, type: outType, stride: strideOf(outType.payload) },
    },
  };
}
```

Add lowerOutputsOnly BEFORE lower:
```typescript
lowerOutputsOnly: ({ ctx, config }) => {
  const initialValue = (config?.initialValue as number) ?? 0;
  const outType = ctx.outTypes[0];

  // Create state for delayed value
  const stateId = stableStateId(ctx.instanceId, 'delay');
  const stateSlot = ctx.b.allocStateSlot(stateId, { initialValue });

  // Read previous state (this is the output - delayed by 1 frame)
  const outputId = ctx.b.sigStateRead(stateSlot, signalType(FLOAT));

  const slot = ctx.b.allocSlot();

  return {
    outputsById: {
      out: { k: 'sig', id: outputId, slot, type: outType, stride: strideOf(outType.payload) },
    },
    stateSlot,
  };
},

lower: ({ ctx, inputsById, config, existingOutputs }) => {
  // If we have existing outputs from first pass, use those
  if (existingOutputs) {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') {
      throw new Error('UnitDelay requires signal input');
    }
    // Write current input to state for next frame
    ctx.b.stepStateWrite(existingOutputs.stateSlot!, input.id);
    return { outputsById: existingOutputs.outputsById };
  }

  // Normal single-pass lowering (non-cycle case)
  const input = inputsById.in;
  if (!input || input.k !== 'sig') {
    throw new Error('UnitDelay requires signal input');
  }

  const initialValue = (config?.initialValue as number) ?? 0;
  const outType = ctx.outTypes[0];

  const stateId = stableStateId(ctx.instanceId, 'delay');
  const stateSlot = ctx.b.allocStateSlot(stateId, { initialValue });
  const outputId = ctx.b.sigStateRead(stateSlot, signalType(FLOAT));
  ctx.b.stepStateWrite(stateSlot, input.id);

  const slot = ctx.b.allocSlot();

  return {
    outputsById: {
      out: { k: 'sig', id: outputId, slot, type: outType, stride: strideOf(outType.payload) },
    },
  };
}
```

---

## File: src/compiler/passes-v2/pass6-block-lowering.ts

### Location: pass6BlockLowering function (lines 508-604)

Current SCC iteration (lines 535-594):
```typescript
const orderedSccs = [...validated.sccs].reverse();
for (const scc of orderedSccs) {
  for (const node of scc.nodes) {
    // ... lower each block
  }
}
```

Replace with two-pass logic:

```typescript
const orderedSccs = [...validated.sccs].reverse();
for (const scc of orderedSccs) {
  // Check if this is a non-trivial SCC (cycle)
  const isNonTrivialSCC = scc.nodes.length > 1 ||
    (scc.nodes.length === 1 && hasSelfLoop(validated.graph, scc.nodes[0]));

  if (isNonTrivialSCC && scc.hasStateBoundary) {
    // Two-pass lowering for cycles with stateful blocks
    lowerSCCTwoPass(
      scc,
      blocks,
      edges,
      builder,
      errors,
      blockOutputs,
      blockIdToIndex,
      instanceContextByBlock,
      validated.portTypes
    );
  } else {
    // Single-pass lowering (existing behavior)
    for (const node of scc.nodes) {
      if (node.kind !== "BlockEval") continue;
      // ... existing lowering code
    }
  }
}
```

### Add new function before pass6BlockLowering:

```typescript
/**
 * Two-pass lowering for non-trivial SCCs (feedback loops).
 *
 * Pass 1: Call lowerOutputsOnly for stateful blocks to generate outputs
 *         without requiring inputs (breaks cycle dependency)
 * Pass 2: Call lower for all blocks with inputs now available
 */
function lowerSCCTwoPass(
  scc: SCC,
  blocks: readonly Block[],
  edges: readonly NormalizedEdge[],
  builder: IRBuilder,
  errors: CompileError[],
  blockOutputs: Map<BlockIndex, Map<string, ValueRefPacked>>,
  blockIdToIndex: Map<string, BlockIndex>,
  instanceContextByBlock: Map<BlockIndex, InstanceId>,
  portTypes: ReadonlyMap<PortKey, SignalType>
): void {
  // Track which blocks were lowered in pass 1
  const partialResults = new Map<BlockIndex, {
    outputsById: Record<string, ValueRefPacked>;
    stateSlot?: StateSlotId;
  }>();

  // Pass 1: Generate outputs for stateful blocks
  for (const node of scc.nodes) {
    if (node.kind !== "BlockEval") continue;

    const blockIndex = node.blockIndex;
    const block = blocks[blockIndex];
    const blockDef = getBlockDefinition(block.type);

    if (blockDef?.isStateful && hasLowerOutputsOnly(blockDef)) {
      builder.setCurrentBlockId(block.id);

      const ctx = buildLowerCtx(block, blockIndex, builder, portTypes);
      const result = blockDef.lowerOutputsOnly!({ ctx, config: block.params });

      partialResults.set(blockIndex, result);

      // Make outputs available for pass 2
      const outputMap = new Map<string, ValueRefPacked>();
      for (const [portId, ref] of Object.entries(result.outputsById)) {
        outputMap.set(portId, ref);
        // Register slots
        if (ref.k === 'sig' && ref.stride === 1) {
          builder.registerSigSlot(ref.id, ref.slot);
        }
        builder.registerSlotType(ref.slot, ref.type);
      }
      blockOutputs.set(blockIndex, outputMap);
    }
  }

  // Pass 2: Full lowering for all blocks
  for (const node of scc.nodes) {
    if (node.kind !== "BlockEval") continue;

    const blockIndex = node.blockIndex;
    const block = blocks[blockIndex];

    builder.setCurrentBlockId(block.id);

    const existingOutputs = partialResults.get(blockIndex);

    // Lower this block instance
    const outputRefs = lowerBlockInstance(
      block,
      blockIndex,
      builder,
      errors,
      edges,
      blocks,
      blockOutputs,
      blockIdToIndex,
      instanceContextByBlock,
      portTypes,
      existingOutputs  // Pass existing outputs if from pass 1
    );

    if (!existingOutputs && outputRefs.size > 0) {
      blockOutputs.set(blockIndex, outputRefs);
    }
  }

  builder.setCurrentBlockId(undefined);
}

/**
 * Check if a node has a self-loop in the dependency graph.
 */
function hasSelfLoop(graph: DepGraph, node: DepNode): boolean {
  return graph.edges.some(e => e.from === node && e.to === node);
}
```

### Modify lowerBlockInstance signature (line 303):

Add `existingOutputs` parameter:
```typescript
function lowerBlockInstance(
  block: Block,
  blockIndex: BlockIndex,
  builder: IRBuilder,
  errors: CompileError[],
  edges?: readonly NormalizedEdge[],
  blocks?: readonly Block[],
  blockOutputs?: Map<BlockIndex, Map<string, ValueRefPacked>>,
  blockIdToIndex?: Map<string, BlockIndex>,
  instanceContextByBlock?: Map<BlockIndex, InstanceId>,
  portTypes?: ReadonlyMap<PortKey, SignalType>,
  existingOutputs?: { outputsById: Record<string, ValueRefPacked>; stateSlot?: StateSlotId }
): Map<string, ValueRefPacked> {
```

And pass to blockDef.lower (around line 406):
```typescript
const result = blockDef.lower({ ctx, inputs, inputsById, config, existingOutputs });
```

---

## File: src/compiler/passes-v2/pass6-block-lowering.ts (imports)

Add imports at top:
```typescript
import { getBlockDefinition, hasLowerOutputsOnly, type LowerCtx } from '../../blocks/registry';
import type { SCC, DepGraph, DepNode } from '../ir/patches';
import type { StateSlotId } from '../ir/types';
```

---

## Test File: src/compiler/__tests__/feedback-loops.test.ts (NEW)

Create new test file:

```typescript
import { describe, it, expect } from 'vitest';
import { compile } from '../compile';
import { PatchBuilder } from '../../graph/PatchBuilder';
import { createEventHub } from '../../events/EventHub';

describe('Feedback Loop Compilation', () => {
  const events = createEventHub();

  it('compiles simple feedback loop with UnitDelay', () => {
    const b = new PatchBuilder();

    // Create: Const(1) -> Add -> UnitDelay -> Add (feedback)
    const constBlock = b.addBlock('ConstFloat', { value: 1 });
    const addBlock = b.addBlock('Add', {});
    const delayBlock = b.addBlock('UnitDelay', { initialValue: 0 });

    // Const -> Add.a
    b.connect(constBlock, 'out', addBlock, 'a');
    // UnitDelay -> Add.b (feedback)
    b.connect(delayBlock, 'out', addBlock, 'b');
    // Add -> UnitDelay
    b.connect(addBlock, 'out', delayBlock, 'in');

    const patch = b.build();
    const result = compile(patch, { events });

    expect(result.kind).toBe('ok');
  });

  it('compiles feedback loop with multiple blocks', () => {
    const b = new PatchBuilder();

    // Create: Phasor -> Wrap -> UnitDelay -> Add -> Phasor.in
    // Actually, simpler: A -> B -> UnitDelay -> A
    const phasor = b.addBlock('Phasor', {});
    const add = b.addBlock('Add', {});
    const delay = b.addBlock('UnitDelay', {});

    b.connect(phasor, 'out', add, 'a');
    b.connect(delay, 'out', add, 'b');
    b.connect(add, 'out', delay, 'in');

    const patch = b.build();
    const result = compile(patch, { events });

    expect(result.kind).toBe('ok');
  });

  it('rejects cycle without stateful block', () => {
    const b = new PatchBuilder();

    // Create illegal cycle: Add -> Mul -> Add (no stateful block)
    const add = b.addBlock('Add', {});
    const mul = b.addBlock('Mul', {});

    b.connect(add, 'out', mul, 'a');
    b.connect(mul, 'out', add, 'a');

    const patch = b.build();
    const result = compile(patch, { events });

    expect(result.kind).toBe('error');
    expect(result.errors.some(e => e.message.includes('Cycle'))).toBe(true);
  });
});
```

---

## Patterns to Follow

### Existing stateful block pattern (from Accumulator in event-blocks.ts):

```typescript
// State allocation pattern
const stateId = stableStateId(ctx.instanceId, 'stateName');
const stateSlot = ctx.b.allocStateSlot(stateId, { initialValue });

// State read pattern (output)
const outputId = ctx.b.sigStateRead(stateSlot, signalType(FLOAT));

// State write pattern (input)
ctx.b.stepStateWrite(stateSlot, inputId);
```

### Block definition pattern with optional function:

```typescript
registerBlock({
  type: 'BlockType',
  // ... other fields
  isStateful: true,

  lowerOutputsOnly: ({ ctx, config }) => {
    // Generate outputs without inputs
    return { outputsById: { out: ref }, stateSlot };
  },

  lower: ({ ctx, inputsById, config, existingOutputs }) => {
    if (existingOutputs) {
      // Use outputs from pass 1, just generate state writes
    } else {
      // Normal single-pass lowering
    }
    return { outputsById: { out: ref } };
  },
});
```
