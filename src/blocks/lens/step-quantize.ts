/**
 * StepQuantize Block
 *
 * y = round(x / step) * step
 *
 * Discretize values to a step grid.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'StepQuantize',
  label: 'Step Quantize',
  category: 'lens',
  description: 'y = round(x / step) * step - discretize to step grid',
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
    step: { label: 'Step', type: canonicalType(FLOAT), defaultValue: 0.1 },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    const step = inputsById.step;
    if (!input) throw new Error('StepQuantize: in is required');
    if (!step) throw new Error('StepQuantize: step is required');

    const outType = ctx.outTypes[0];

    // y = round(x / step) * step
    const divFn = ctx.b.opcode(OpCode.Div);
    const divided = ctx.b.kernelZip([input.id, step.id], divFn, outType);

    const roundFn = ctx.b.opcode(OpCode.Round);
    const rounded = ctx.b.kernelMap(divided, roundFn, outType);

    const mulFn = ctx.b.opcode(OpCode.Mul);
    const result = ctx.b.kernelZip([rounded, step.id], mulFn, outType);

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
