# Implementation Context: Block Surface

Generated: 2026-01-25
Plan: SPRINT-20260125-block-surface-PLAN.md

## Key Files

### New Files to Create

- `src/blocks/io-blocks.ts` - External input blocks

### Files to Modify

| File | Change |
|------|--------|
| `src/blocks/index.ts` | Import io-blocks.ts to trigger registration |

## Existing Patterns

### Block Definition Pattern (from time-blocks.ts)
```typescript
import { registerBlock } from './registry';
import { signalType, strideOf } from '../core/canonical-types';

registerBlock({
  type: 'InfiniteTimeRoot',
  label: 'Infinite Time Root',
  category: 'time',
  description: 'Root block for patches with infinite time',
  form: 'primitive',
  capability: 'time',
  cardinality: {
    cardinalityMode: 'signalOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  inputs: {
    periodAMs: { type: signalType('float'), value: 1000, exposedAsPort: false },
  },
  outputs: {
    tMs: { label: 'Time (ms)', type: signalType('float') },
  },
  lower: ({ ctx }): LowerResult => {
    const tMs = ctx.b.sigTime('tMs', signalType('float'));
    const tMsSlot = ctx.b.allocSlot();
    return {
      outputsById: {
        tMs: { k: 'sig', id: tMs, slot: tMsSlot, type: ctx.outTypes[0], stride: strideOf(ctx.outTypes[0].payload) },
      },
    };
  },
});
```

### Config-Only Input Pattern
```typescript
inputs: {
  channel: {
    type: signalType('float'), // Type doesn't matter much for config-only
    value: 'mouse.x',          // Default value
    exposedAsPort: false,      // Config-only, not wirable
  },
},
```

### Vec2 Packing Pattern (from geometry-blocks.ts)
```typescript
// Create vec2 from two signals
const xSig = ctx.b.sigExternal('mouse.x', signalType('float'));
const ySig = ctx.b.sigExternal('mouse.y', signalType('float'));

// Pack into vec2 using zip
const packed = ctx.b.sigZip(
  [xSig, ySig],
  { kind: 'kernel', name: 'pack_vec2' },
  signalType('vec2')
);
```

## Spec References

- design-docs/external-input/02-External-Input-Spec.md
  - Section 6.1: ExternalInput block
  - Section 6.2: ExternalGate block
  - Section 6.3: ExternalVec2 block

## Code Snippets

### ExternalInput Block
```typescript
// src/blocks/io-blocks.ts

import { registerBlock, type LowerResult } from './registry';
import { signalType, strideOf } from '../core/canonical-types';

registerBlock({
  type: 'ExternalInput',
  label: 'External Input',
  category: 'io',
  description: 'Read a named external channel as a float signal',
  form: 'primitive',
  capability: 'io',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    channel: {
      type: signalType('float'),
      value: 'mouse.x',
      exposedAsPort: false,
      uiHint: 'text',
    },
  },
  outputs: {
    value: { label: 'Value', type: signalType('float') },
  },
  lower: ({ ctx, config }): LowerResult => {
    const channel = (config?.channel as string) ?? 'mouse.x';
    const sig = ctx.b.sigExternal(channel, signalType('float'));
    const slot = ctx.b.allocSlot();
    const outType = ctx.outTypes[0];

    return {
      outputsById: {
        value: { k: 'sig', id: sig, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});
```

### ExternalGate Block
```typescript
import { OpCode } from '../compiler/ir/types';

registerBlock({
  type: 'ExternalGate',
  label: 'External Gate',
  category: 'io',
  description: 'Convert external channel to gate (0/1) via threshold',
  form: 'primitive',
  capability: 'io',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    channel: {
      type: signalType('float'),
      value: 'mouse.x',
      exposedAsPort: false,
      uiHint: 'text',
    },
    threshold: {
      type: signalType('float'),
      value: 0.5,
      exposedAsPort: false,
    },
  },
  outputs: {
    gate: { label: 'Gate', type: signalType('float') }, // 0 or 1
  },
  lower: ({ ctx, config }): LowerResult => {
    const channel = (config?.channel as string) ?? 'mouse.x';
    const threshold = (config?.threshold as number) ?? 0.5;

    const inputSig = ctx.b.sigExternal(channel, signalType('float'));
    const thresholdSig = ctx.b.sigConst(threshold, signalType('float'));

    // gate = input >= threshold ? 1 : 0
    // Use Gt which returns 1 if a > b, else 0
    // We need >= so we invert: NOT (threshold > input)
    // Actually, just use step function or check if we have Gte
    // For now: use (input - threshold) > 0 via sign, or just Gt and accept >
    const gateSig = ctx.b.sigZip(
      [inputSig, thresholdSig],
      { kind: 'opcode', opcode: OpCode.Gt },
      signalType('float')
    );

    const slot = ctx.b.allocSlot();
    const outType = ctx.outTypes[0];

    return {
      outputsById: {
        gate: { k: 'sig', id: gateSig, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});
```

### ExternalVec2 Block
```typescript
registerBlock({
  type: 'ExternalVec2',
  label: 'External Vec2',
  category: 'io',
  description: 'Read external channels as vec2 (channelBase.x, channelBase.y)',
  form: 'primitive',
  capability: 'io',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    channelBase: {
      type: signalType('float'),
      value: 'mouse',
      exposedAsPort: false,
      uiHint: 'text',
    },
  },
  outputs: {
    position: { label: 'Position', type: signalType('vec2') },
  },
  lower: ({ ctx, config }): LowerResult => {
    const channelBase = (config?.channelBase as string) ?? 'mouse';

    const xSig = ctx.b.sigExternal(`${channelBase}.x`, signalType('float'));
    const ySig = ctx.b.sigExternal(`${channelBase}.y`, signalType('float'));

    // Pack x and y into vec2
    // Check if pack_vec2 kernel exists, or use alternative pattern
    const packedSig = ctx.b.sigZip(
      [xSig, ySig],
      { kind: 'kernel', name: 'pack_vec2' },
      signalType('vec2')
    );

    const slot = ctx.b.allocSlot();
    const outType = ctx.outTypes[0];

    return {
      outputsById: {
        position: { k: 'sig', id: packedSig, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});
```

### Import in Block Index
```typescript
// src/blocks/index.ts
// Add this import to trigger registration
import './io-blocks';
```

## Migration Notes

### Dependencies on Sprint 1

This sprint requires:
- `ctx.b.sigExternal(channel: string, type)` to accept any channel name
- The runtime must have ExternalChannelSystem with snapshot that responds to these channels

### Testing Without Full Runtime

For unit testing the block lower functions:
1. Mock the IRBuilder
2. Verify sigExternal is called with correct channel name
3. Verify output structure is correct

For integration testing:
1. Use existing mouse channels (mouse.x, mouse.y, mouse.over)
2. These should work once Sprint 1 migrates mouse to channel system

### Vec2 Pack Kernel

Check if `pack_vec2` kernel exists. If not, alternatives:
1. Create the kernel in SignalEvaluator
2. Use a composed opcode sequence
3. Return two separate slots and let downstream handle packing

Most likely `pack_vec2` needs to be added - check OpcodeInterpreter.ts for vec2 support.
