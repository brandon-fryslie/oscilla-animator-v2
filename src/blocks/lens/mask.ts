/**
 * Mask Block
 *
 * y = mask > 0 ? x : 0
 *
 * Gate/hold values based on a mask one-cardinality input.
 * When mask > 0, pass through input; when mask ≤ 0, output zero.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { inferType, unitVar, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { OpCode } from '../../compiler/ir/types';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const MASK_CARD = cardinalityVar(cardinalityVarId('mask_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'Mask',
  label: 'Mask',
  category: 'lens',
  description: 'Gate values: y = mask > 0 ? x : 0',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  inputs: {
    in: { label: 'In', type: inferType(FLOAT, unitVar('mask_U'), { cardinality: MASK_CARD }) },
    mask: { label: 'Mask', type: canonicalType(FLOAT, undefined, { cardinality: MASK_CARD }), exposedAsPort: true },
  },
  outputs: {
    out: { label: 'Out', type: inferType(FLOAT, unitVar('mask_U'), { cardinality: MASK_CARD }) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    const mask = inputsById.mask;

    if (!input) throw new Error('Mask input is required');
    if (!mask) throw new Error('Mask mask input is required');

    // outTypes[0] already has instance info pre-populated by orchestrator
    const outType = ctx.outTypes[0];

    // y = select(mask, input, 0)
    // Select: cond > 0 ? ifTrue : ifFalse
    const zeroConst = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    const selectFn = ctx.b.opcode(OpCode.Select);
    const result = ctx.b.zipAuto([mask.id, input.id, zeroConst], selectFn, outType);

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
