# Implementation Context: Pure Scalar Lenses
Generated: 2026-02-01

## Key Files to Modify

| File | Change |
|------|--------|
| `src/blocks/lens/index.ts` | NEW: barrel import for all lens blocks |
| `src/blocks/lens/scale-bias.ts` | NEW: ScaleBias block |
| `src/blocks/lens/clamp.ts` | NEW: Clamp block |
| `src/blocks/lens/wrap01.ts` | NEW: Wrap01 block |
| `src/blocks/lens/step-quantize.ts` | NEW: StepQuantize block |
| `src/blocks/lens/smoothstep.ts` | NEW: Smoothstep block |
| `src/blocks/lens/power-gamma.ts` | NEW: PowerGamma block |
| `src/blocks/index.ts` | ADD: `import './lens';` |
| `src/ui/reactFlowEditor/lensUtils.ts` | UPDATE: include `'lens'` category in discovery |
| `src/blocks/lens/__tests__/pure-lenses.test.ts` | NEW: tests |

## Block Template (copy-paste starting point)

```typescript
/**
 * ScaleBias Block
 *
 * y = x * scale + bias
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'ScaleBias',
  label: 'Scale + Bias',
  category: 'lens',
  description: 'y = x * scale + bias',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  // NO adapterSpec — lenses are user-controlled only
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT) },
    scale: { type: canonicalType(FLOAT), defaultValue: 1.0, exposedAsPort: false },
    bias: { type: canonicalType(FLOAT), defaultValue: 0.0, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT) },
  },
  lower: ({ inputsById, ctx, config }) => {
    const input = inputsById.in;
    if (!input) throw new Error('ScaleBias input is required');

    const scale = (config?.scale as number) ?? 1.0;
    const bias = (config?.bias as number) ?? 0.0;
    const outType = ctx.outTypes[0];

    // y = x * scale + bias
    const scaleConst = ctx.b.constant(floatConst(scale), canonicalType(FLOAT));
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const scaled = ctx.b.kernelZip([input.id, scaleConst], mulFn, canonicalType(FLOAT));

    const biasConst = ctx.b.constant(floatConst(bias), canonicalType(FLOAT));
    const addFn = ctx.b.opcode(OpCode.Add);
    const result = ctx.b.kernelZip([scaled, biasConst], addFn, canonicalType(FLOAT));

    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { id: result, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
```

## Pattern Notes

1. **Config params**: Non-port inputs (exposedAsPort: false) with defaultValue are passed via `config` in the lower function. The normalizer extracts them from block params.

2. **Type preservation**: Lens blocks keep the same type in and out. Use `canonicalType(FLOAT)` which defaults to `unitScalar()`.

3. **Cardinality preserve**: All pure lenses preserve cardinality — they work on both signals and fields transparently.

4. **Opcode composition**: Smoothstep requires composing multiple opcodes. Use sequential `kernelZip`/`kernelMap` calls — each produces a new `ValueExprId` that feeds into the next.

5. **No adapterSpec**: This is the key distinction from adapter blocks. Lens blocks are NEVER auto-inserted by the compiler.

## Smoothstep Implementation Detail

Smoothstep requires: `t = clamp((x - edge0) / (edge1 - edge0), 0, 1); y = t * t * (3 - 2 * t)`

Composed from:
```
sub1 = x - edge0
sub2 = edge1 - edge0
div1 = sub1 / sub2
t = clamp(div1, 0, 1)
tt = t * t
twoT = 2 * t
threeMinusTwoT = 3 - twoT
y = tt * threeMinusTwoT
```

All operations available via OpCode: Sub, Div, Clamp, Mul.

## lensUtils.ts Update

```typescript
export function getAvailableLensTypes(): LensTypeInfo[] {
  const adapterBlocks = getBlockTypesByCategory('adapter');
  const lensBlocks = getBlockTypesByCategory('lens');
  const allBlocks = [...adapterBlocks, ...lensBlocks];
  // ... rest unchanged
}
```

Note: lens blocks use `in`/`out` port IDs same as adapters, so the existing mapping logic works.
