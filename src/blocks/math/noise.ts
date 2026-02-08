/**
 * Noise Block
 *
 * Deterministic procedural noise. Output in [0, 1).
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { zipAuto } from '../lower-utils';

registerBlock({
  type: 'Noise',
  label: 'Noise',
  category: 'math',
  description: 'Deterministic procedural noise. Output in [0, 1)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
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
    const hashId = zipAuto([x.id, seedId], hashFn, outType, ctx.b);

    return {
      outputsById: {
        out: { id: hashId, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
    };
  },
});
