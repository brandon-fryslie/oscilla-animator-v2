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
import { inferType, unitVar } from '../../core/inference-types';
import { OpCode } from '../../compiler/ir/types';
import { withoutContract } from '../lower-utils';

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
    in: { label: 'In', type: inferType(FLOAT, unitVar('nr_U')) },
    min: { label: 'Min', type: inferType(FLOAT, unitVar('nr_U')), defaultValue: 0.0 },
    max: { label: 'Max', type: inferType(FLOAT, unitVar('nr_U')), defaultValue: 1.0 },
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

    // outTypes[0] already has instance info pre-populated by orchestrator
    const outType = ctx.outTypes[0];
    const intermediateType = withoutContract(outType);

    // y = (x - min) / (max - min)
    const subFn = ctx.b.opcode(OpCode.Sub);
    const numerator = ctx.b.zipAuto([input.id, min.id], subFn, intermediateType);
    const range = ctx.b.zipAuto([max.id, min.id], subFn, intermediateType);

    const divFn = ctx.b.opcode(OpCode.Div);
    const result = ctx.b.zipAuto([numerator, range], divFn, outType);

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
