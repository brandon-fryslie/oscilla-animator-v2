/**
 * Deadzone Block
 *
 * y = |x| > threshold ? x : 0
 *
 * Zero out small magnitudes, preserve sign for larger values.
 * Classic deadzone/dead-band filter for noise rejection.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { inferType, unitVar, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { OpCode } from '../../compiler/ir/types';
import { withoutContract } from '../lower-utils';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const DEADZONE_CARD = cardinalityVar(cardinalityVarId('deadzone_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'Deadzone',
  label: 'Deadzone',
  category: 'lens',
  description: 'Zero small magnitudes: y = |x| > threshold ? x : 0',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  inputs: {
    in: { label: 'In', type: inferType(FLOAT, unitVar('dz_U'), { cardinality: DEADZONE_CARD }) },
    threshold: { label: 'Threshold', type: inferType(FLOAT, unitVar('dz_U'), { cardinality: DEADZONE_CARD }), defaultValue: 0.01 },
  },
  outputs: {
    out: { label: 'Out', type: inferType(FLOAT, unitVar('dz_U'), { cardinality: DEADZONE_CARD }) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    const threshold = inputsById.threshold;
    if (!input) throw new Error('Deadzone: in is required');
    if (!threshold) throw new Error('Deadzone: threshold is required');

    // outTypes[0] already has instance info pre-populated by orchestrator
    const outType = ctx.outTypes[0];
    const intermediateType = withoutContract(outType);

    // Implementation: abs(x) - threshold > 0 ? x : 0
    // Using Select opcode: select(cond, ifTrue, ifFalse) → cond > 0 ? ifTrue : ifFalse

    const absFn = ctx.b.opcode(OpCode.Abs);
    const absVal = ctx.b.mapAuto(input.id, absFn, intermediateType);

    const subFn = ctx.b.opcode(OpCode.Sub);
    const diff = ctx.b.zipAuto([absVal, threshold.id], subFn, intermediateType);

    // If diff > 0 (i.e., |x| > threshold), use x; otherwise use 0
    const zeroConst = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    const selectFn = ctx.b.opcode(OpCode.Select);
    const result = ctx.b.zipAuto([diff, input.id, zeroConst], selectFn, outType);

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
