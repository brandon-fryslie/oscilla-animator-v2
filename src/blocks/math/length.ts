/**
 * Length Block
 *
 * Euclidean length (magnitude) of a 2D or 3D vector.
 */

import { registerBlock } from '../registry';
import { canonicalType, strideOf } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'Length',
  label: 'Length',
  category: 'math',
  description: 'Euclidean length (magnitude) of a 2D or 3D vector',
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
    const x2 = ctx.b.kernelZip([x.id, x.id], mulFn, outType);
    const y2 = ctx.b.kernelZip([y.id, y.id], mulFn, outType);
    let sumSq = ctx.b.kernelZip([x2, y2], addFn, outType);

    if (z) {
      const z2 = ctx.b.kernelZip([z.id, z.id], mulFn, outType);
      sumSq = ctx.b.kernelZip([sumSq, z2], addFn, outType);
    }

    const lengthId = ctx.b.kernelMap(sumSq, sqrtFn, outType);
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { id: lengthId, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});
