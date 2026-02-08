/**
 * Clamp Block
 *
 * y = clamp(x, min, max)
 *
 * Bounds enforcement for value ranges.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { inferType, unitVar } from '../../core/inference-types';
import { OpCode } from '../../compiler/ir/types';
import { zipAuto } from '../lower-utils';

registerBlock({
  type: 'Clamp',
  label: 'Clamp',
  category: 'lens',
  description: 'y = clamp(x, min, max) - bounds enforcement',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: inferType(FLOAT, unitVar('clamp_U')) },
    min: { label: 'Min', type: inferType(FLOAT, unitVar('clamp_U')), defaultValue: 0.0 },
    max: { label: 'Max', type: inferType(FLOAT, unitVar('clamp_U')), defaultValue: 1.0 },
  },
  outputs: {
    out: { label: 'Out', type: inferType(FLOAT, unitVar('clamp_U')) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    const min = inputsById.min;
    const max = inputsById.max;
    if (!input) throw new Error('Clamp: in is required');
    if (!min) throw new Error('Clamp: min is required');
    if (!max) throw new Error('Clamp: max is required');

    const outType = ctx.outTypes[0];

    const clampFn = ctx.b.opcode(OpCode.Clamp);
    const result = zipAuto([input.id, min.id, max.id], clampFn, outType, ctx.b);

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
