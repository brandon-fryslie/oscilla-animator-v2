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
import { inferType, unitVar, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { OpCode } from '../../compiler/ir/types';
import { zipAuto, mapAuto } from '../lower-utils';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const STEP_QUANTIZE_CARD = cardinalityVar(cardinalityVarId('step_quantize_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'StepQuantize',
  label: 'Step Quantize',
  category: 'lens',
  description: 'y = round(x / step) * step - discretize to step grid',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  inputs: {
    in: { label: 'In', type: inferType(FLOAT, unitVar('stepQ_U'), { cardinality: STEP_QUANTIZE_CARD }) },
    step: { label: 'Step', type: inferType(FLOAT, unitVar('stepQ_U'), { cardinality: STEP_QUANTIZE_CARD }), defaultValue: 0.1 },
  },
  outputs: {
    out: { label: 'Out', type: inferType(FLOAT, unitVar('stepQ_U'), { cardinality: STEP_QUANTIZE_CARD }) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    const step = inputsById.step;
    if (!input) throw new Error('StepQuantize: in is required');
    if (!step) throw new Error('StepQuantize: step is required');

    const outType = ctx.outTypes[0];

    // y = round(x / step) * step
    const divFn = ctx.b.opcode(OpCode.Div);
    const divided = zipAuto([input.id, step.id], divFn, outType, ctx.b);

    const roundFn = ctx.b.opcode(OpCode.Round);
    const rounded = mapAuto(divided, roundFn, outType, ctx.b);

    const mulFn = ctx.b.opcode(OpCode.Mul);
    const result = zipAuto([rounded, step.id], mulFn, outType, ctx.b);

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
