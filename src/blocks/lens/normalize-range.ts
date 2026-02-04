/**
 * NormalizeRange Lens Block
 *
 * y = (x - min) / (max - min)
 *
 * Maps [min, max] → [0,1] with contract guarantee.
 * User-placed lens, not auto-inserted.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, contractClamp01 } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'Lens_NormalizeRange',
  label: 'Normalize Range',
  category: 'lens',
  description: 'y = (x - min) / (max - min) - maps [min, max] → [0,1]',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT) },
    min: { label: 'Min', type: canonicalType(FLOAT), defaultValue: 0.0 },
    max: { label: 'Max', type: canonicalType(FLOAT), defaultValue: 1.0 },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, undefined, undefined, contractClamp01()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    const min = inputsById.min;
    const max = inputsById.max;
    if (!input) throw new Error('Lens_NormalizeRange: in is required');
    if (!min) throw new Error('Lens_NormalizeRange: min is required');
    if (!max) throw new Error('Lens_NormalizeRange: max is required');

    const outType = ctx.outTypes[0];

    // y = (x - min) / (max - min)
    const subFn = ctx.b.opcode(OpCode.Sub);
    const numerator = ctx.b.kernelZip([input.id, min.id], subFn, canonicalType(FLOAT));
    const range = ctx.b.kernelZip([max.id, min.id], subFn, canonicalType(FLOAT));

    const divFn = ctx.b.opcode(OpCode.Div);
    const result = ctx.b.kernelZip([numerator, range], divFn, outType);

    return {
      outputsById: {
        out: { id: result, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
    };
  },
});
