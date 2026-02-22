/**
 * Cos Block
 *
 * Per-element cosine (works with both single-instance and per-instance fields).
 */

import { registerBlock, STANDARD_NUMERIC_PAYLOADS } from '../registry';
import { canonicalType, payloadStride } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { OpCode } from '../../compiler/ir/types';
import { mapAuto } from '../lower-utils';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const COS_CARD = cardinalityVar(cardinalityVarId('cos_cardinality'), {
  relation: 'uniform',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'Cos',
    label: 'Cos',
    category: 'math',
    description: 'Per-element cosine (works with both single-instance and per-instance fields)',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    payload: {
      allowedPayloads: {
        input: STANDARD_NUMERIC_PAYLOADS,
        result: STANDARD_NUMERIC_PAYLOADS,
      },
      semantics: 'componentwise',
      unitBehavior: 'requireUnitless',
    },
    inputs: {
      input: { label: 'Input', type: canonicalType(FLOAT, undefined, { cardinality: COS_CARD }) },
    },
    outputs: {
      result: { label: 'Result', type: canonicalType(FLOAT, undefined, { cardinality: COS_CARD }) },
    },
    lower: ({ ctx, inputsById }) => {
      const input = inputsById.input;
  
      if (!input) {
        throw new Error('Cos input required');
      }
  
      const outType = ctx.outTypes[0];
      const cosFn = ctx.b.opcode(OpCode.Cos);
      const result = mapAuto(input.id, cosFn, outType, ctx.b);
  
      return {
        outputsById: {
          result: { id: result, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
        },
        effects: {
          slotRequests: [
            { portId: 'result', type: outType },
          ],
        },
      };
    },
  });
}
