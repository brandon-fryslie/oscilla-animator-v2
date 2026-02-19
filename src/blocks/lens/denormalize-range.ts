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
import { inferType, unitVar } from '../../core/inference-types';
import { OpCode } from '../../compiler/ir/types';
import { withoutContract } from '../lower-utils';

registerBlock({
  type: 'Lens_DenormalizeRange',
  label: 'Denormalize Range',
  category: 'lens',
  description: 'y = x * (max - min) + min - maps [0,1] → [min, max]',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, undefined, undefined, contractClamp01()) },
    min: { label: 'Min', type: inferType(FLOAT, unitVar('dnr_U')), defaultValue: 0.0 },
    max: { label: 'Max', type: inferType(FLOAT, unitVar('dnr_U')), defaultValue: 1.0 },
  },
  outputs: {
    out: { label: 'Out', type: inferType(FLOAT, unitVar('dnr_U')) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    const min = inputsById.min;
    const max = inputsById.max;
    if (!input) throw new Error('Lens_DenormalizeRange: in is required');
    if (!min) throw new Error('Lens_DenormalizeRange: min is required');
    if (!max) throw new Error('Lens_DenormalizeRange: max is required');

    // outTypes[0] already has instance info pre-populated by orchestrator
    const outType = ctx.outTypes[0];
    const intermediateType = withoutContract(outType);

    // y = x * (max - min) + min
    const subFn = ctx.b.opcode(OpCode.Sub);
    const range = ctx.b.zipAuto([max.id, min.id], subFn, intermediateType);

    const mulFn = ctx.b.opcode(OpCode.Mul);
    const scaled = ctx.b.zipAuto([input.id, range], mulFn, intermediateType);

    const addFn = ctx.b.opcode(OpCode.Add);
    const result = ctx.b.zipAuto([scaled, min.id], addFn, outType);

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
