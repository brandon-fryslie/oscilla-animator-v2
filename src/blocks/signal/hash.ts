/**
 * Hash Block
 *
 * Deterministic hash function. Output in [0, 1).
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst, requireInst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import type { ValueExprId } from '../../compiler/ir/Indices';

registerBlock({
  type: 'Hash',
  label: 'Hash',
  category: 'signal',
  description: 'Deterministic hash function. Output in [0, 1)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    value: { label: 'Value', type: canonicalType(FLOAT) },
    seed: { label: 'Seed', type: canonicalType(FLOAT), optional: true },
  },
  outputs: {
    out: { label: 'Output', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const value = inputsById.value;
    const isValueSignal = value && 'type' in value && requireInst(value.type.extent.temporality, 'temporality').kind === 'continuous';
    if (!value || !isValueSignal) {
      throw new Error('Hash requires value signal input');
    }

    const seed = inputsById.seed;
    let seedId: ValueExprId;
    const isSeedSignal = seed && 'type' in seed && requireInst(seed.type.extent.temporality, 'temporality').kind === 'continuous';
    if (seed && isSeedSignal) {
      seedId = seed.id;
    } else {
      seedId = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    }

    const hashFn = ctx.b.opcode(OpCode.Hash);
    const hashId = ctx.b.kernelZip([value.id, seedId], hashFn, canonicalType(FLOAT));

    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { id: hashId, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
