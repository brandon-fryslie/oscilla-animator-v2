/**
 * Noise Block
 *
 * Deterministic procedural noise. Output in [0, 1).
 */

import { registerBlock } from '../registry';
import { canonicalType, strideOf, floatConst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'Noise',
  label: 'Noise',
  category: 'math',
  description: 'Deterministic procedural noise. Output in [0, 1)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    x: { label: 'X', type: canonicalType(FLOAT) },
  },
  outputs: {
    out: { label: 'Output', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const x = inputsById.x;
    if (!x) throw new Error('Noise x input is required');

    // Use Hash opcode with fixed seed=0 for deterministic noise
    const outType = ctx.outTypes[0];
    const seedId = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    const hashFn = ctx.b.opcode(OpCode.Hash);
    const hashId = ctx.b.kernelZip([x.id, seedId], hashFn, outType);
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { id: hashId, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});
