/**
 * StepQuantize Block
 *
 * y = round(x / step) * step
 *
 * Discretize values to a step grid.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'StepQuantize',
  label: 'Step Quantize',
  category: 'lens',
  description: 'y = round(x / step) * step - discretize to step grid',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT) },
    step: { label: 'Step', type: canonicalType(FLOAT), defaultValue: 0.1, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT) },
  },
  lower: ({ inputsById, ctx, config }) => {
    const input = inputsById.in;
    if (!input) throw new Error('StepQuantize input is required');

    const step = (config?.step as number) ?? 0.1;
    const outType = ctx.outTypes[0];

    // y = round(x / step) * step
    const stepConst = ctx.b.constant(floatConst(step), canonicalType(FLOAT));

    // x / step
    const divFn = ctx.b.opcode(OpCode.Div);
    const divided = ctx.b.kernelZip([input.id, stepConst], divFn, outType);

    // round(x / step)
    const roundFn = ctx.b.opcode(OpCode.Round);
    const rounded = ctx.b.kernelMap(divided, roundFn, outType);

    // round(x / step) * step
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const result = ctx.b.kernelZip([rounded, stepConst], mulFn, outType);

    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { id: result, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
