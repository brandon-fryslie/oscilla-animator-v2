/**
 * Normalize Block
 *
 * Normalize a 2D or 3D vector to unit length.
 */

import { registerBlock } from '../registry';
import { canonicalType, strideOf, floatConst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'Normalize',
  label: 'Normalize',
  category: 'math',
  description: 'Normalize a 2D or 3D vector to unit length',
  form: 'primitive',
  capability: 'pure',
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
    const x2 = ctx.b.kernelZip([x.id, x.id], mulFn, outTypeX);
    const y2 = ctx.b.kernelZip([y.id, y.id], mulFn, outTypeX);
    let sumSq = ctx.b.kernelZip([x2, y2], addFn, outTypeX);

    if (z) {
      const z2 = ctx.b.kernelZip([z.id, z.id], mulFn, outTypeX);
      sumSq = ctx.b.kernelZip([sumSq, z2], addFn, outTypeX);
    }

    const lengthId = ctx.b.kernelMap(sumSq, sqrtFn, outTypeX);

    // Guard against division by zero
    const epsilon = ctx.b.constant(floatConst(1e-10), canonicalType(FLOAT));
    const safeLengthId = ctx.b.kernelZip([lengthId, epsilon], maxFn, outTypeX);

    // Divide each component by length
    const outXId = ctx.b.kernelZip([x.id, safeLengthId], divFn, outTypeX);
    const outYId = ctx.b.kernelZip([y.id, safeLengthId], divFn, outTypeX);

    let outZId;
    if (z) {
      outZId = ctx.b.kernelZip([z.id, safeLengthId], divFn, outTypeX);
    } else {
      outZId = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    }

    const outTypeY = ctx.outTypes[1];
    const outTypeZ = ctx.outTypes[2];
    const slotX = ctx.b.allocSlot();
    const slotY = ctx.b.allocSlot();
    const slotZ = ctx.b.allocSlot();

    return {
      outputsById: {
        outX: { id: outXId, slot: slotX, type: outTypeX, stride: strideOf(outTypeX.payload) },
        outY: { id: outYId, slot: slotY, type: outTypeY, stride: strideOf(outTypeY.payload) },
        outZ: { id: outZId, slot: slotZ, type: outTypeZ, stride: strideOf(outTypeZ.payload) },
      },
    };
  },
});
