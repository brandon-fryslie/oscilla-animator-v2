/**
 * DenormalizeRange Lens Block
 *
 * y = x * (max - min) + min
 *
 * Maps [0,1] → [min, max].
 * User-placed lens, not auto-inserted.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, contractClamp01 } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'Lens_DenormalizeRange',
  label: 'Denormalize Range',
  category: 'lens',
  description: 'y = x * (max - min) + min - maps [0,1] → [min, max]',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, undefined, undefined, contractClamp01()) },
    min: { label: 'Min', type: canonicalType(FLOAT), defaultValue: 0.0 },
    max: { label: 'Max', type: canonicalType(FLOAT), defaultValue: 1.0 },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    const min = inputsById.min;
    const max = inputsById.max;
    if (!input) throw new Error('Lens_DenormalizeRange: in is required');
    if (!min) throw new Error('Lens_DenormalizeRange: min is required');
    if (!max) throw new Error('Lens_DenormalizeRange: max is required');

    const outType = ctx.outTypes[0];

    // y = x * (max - min) + min
    const subFn = ctx.b.opcode(OpCode.Sub);
    const range = ctx.b.kernelZip([max.id, min.id], subFn, canonicalType(FLOAT));

    const mulFn = ctx.b.opcode(OpCode.Mul);
    const scaled = ctx.b.kernelZip([input.id, range], mulFn, canonicalType(FLOAT));

    const addFn = ctx.b.opcode(OpCode.Add);
    const result = ctx.b.kernelZip([scaled, min.id], addFn, outType);

    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { id: result, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
