/**
 * Normalize Block
 *
 * Normalize a 2D or 3D vector to unit length.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { zipAuto, mapAuto } from '../lower-utils';

registerBlock({
  type: 'Normalize',
  label: 'Normalize',
  category: 'math',
  description: 'Normalize a 2D or 3D vector to unit length',
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
    outX: { label: 'X', type: canonicalType(FLOAT) },
    outY: { label: 'Y', type: canonicalType(FLOAT) },
    outZ: { label: 'Z', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const x = inputsById.x;
    const y = inputsById.y;
    const z = inputsById.z;
    if (!x || !y) throw new Error('Normalize requires x and y inputs');

    const outTypeX = ctx.outTypes[0];
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const addFn = ctx.b.opcode(OpCode.Add);
    const sqrtFn = ctx.b.opcode(OpCode.Sqrt);
    const divFn = ctx.b.opcode(OpCode.Div);
    const maxFn = ctx.b.opcode(OpCode.Max);

    // length = sqrt(x² + y² [+ z²])
    const x2 = zipAuto([x.id, x.id], mulFn, outTypeX, ctx.b);
    const y2 = zipAuto([y.id, y.id], mulFn, outTypeX, ctx.b);
    let sumSq = zipAuto([x2, y2], addFn, outTypeX, ctx.b);

    if (z) {
      const z2 = zipAuto([z.id, z.id], mulFn, outTypeX, ctx.b);
      sumSq = zipAuto([sumSq, z2], addFn, outTypeX, ctx.b);
    }

    const lengthId = mapAuto(sumSq, sqrtFn, outTypeX, ctx.b);

    // Guard against division by zero
    const epsilon = ctx.b.constant(floatConst(1e-10), canonicalType(FLOAT));
    const safeLengthId = zipAuto([lengthId, epsilon], maxFn, outTypeX, ctx.b);

    // Divide each component by length
    const outXId = zipAuto([x.id, safeLengthId], divFn, outTypeX, ctx.b);
    const outYId = zipAuto([y.id, safeLengthId], divFn, outTypeX, ctx.b);

    let outZId;
    if (z) {
      outZId = zipAuto([z.id, safeLengthId], divFn, outTypeX, ctx.b);
    } else {
      outZId = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    }

    const outTypeY = ctx.outTypes[1];
    const outTypeZ = ctx.outTypes[2];

    return {
      outputsById: {
        outX: { id: outXId, slot: undefined, type: outTypeX, stride: payloadStride(outTypeX.payload) },
        outY: { id: outYId, slot: undefined, type: outTypeY, stride: payloadStride(outTypeY.payload) },
        outZ: { id: outZId, slot: undefined, type: outTypeZ, stride: payloadStride(outTypeZ.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'outX', type: outTypeX },
          { portId: 'outY', type: outTypeY },
          { portId: 'outZ', type: outTypeZ },
        ],
      },
    };
  },
});
