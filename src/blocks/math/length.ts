/**
 * Length Block
 *
 * Euclidean length (magnitude) of a 2D or 3D vector.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { zipAuto, mapAuto } from '../lower-utils';

registerBlock({
  type: 'Length',
  label: 'Length',
  category: 'math',
  description: 'Euclidean length (magnitude) of a 2D or 3D vector',
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
    y: { label: 'Y', type: canonicalType(FLOAT) },
    z: { label: 'Z', type: canonicalType(FLOAT), optional: true },
  },
  outputs: {
    out: { label: 'Output', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const x = inputsById.x;
    const y = inputsById.y;
    const z = inputsById.z;
    if (!x || !y) throw new Error('Length requires x and y inputs');

    const outType = ctx.outTypes[0];
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const addFn = ctx.b.opcode(OpCode.Add);
    const sqrtFn = ctx.b.opcode(OpCode.Sqrt);

    // x² + y² [+ z²] → sqrt
    const x2 = zipAuto([x.id, x.id], mulFn, outType, ctx.b);
    const y2 = zipAuto([y.id, y.id], mulFn, outType, ctx.b);
    let sumSq = zipAuto([x2, y2], addFn, outType, ctx.b);

    if (z) {
      const z2 = zipAuto([z.id, z.id], mulFn, outType, ctx.b);
      sumSq = zipAuto([sumSq, z2], addFn, outType, ctx.b);
    }

    const lengthId = mapAuto(sumSq, sqrtFn, outType, ctx.b);

    return {
      outputsById: {
        out: { id: lengthId, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
    };
  },
});
