/**
 * Sin Block
 *
 * Per-element sine (works with both signals and fields).
 */

import { registerBlock, STANDARD_NUMERIC_PAYLOADS } from '../registry';
import { canonicalType, payloadStride } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { OpCode } from '../../compiler/ir/types';
import { mapAuto } from '../lower-utils';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const SIN_CARD = cardinalityVar(cardinalityVarId('sin_cardinality'), {
  relation: 'uniform',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'Sin',
  label: 'Sin',
  category: 'math',
  description: 'Per-element sine (works with both signals and fields)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  payload: {
    allowedPayloads: {
      input: STANDARD_NUMERIC_PAYLOADS,
      result: STANDARD_NUMERIC_PAYLOADS,
    },
    semantics: 'componentwise',
    unitBehavior: 'requireUnitless',
  },
  inputs: {
    input: { label: 'Input', type: canonicalType(FLOAT, undefined, { cardinality: SIN_CARD }) },
  },
  outputs: {
    result: { label: 'Result', type: canonicalType(FLOAT, undefined, { cardinality: SIN_CARD }) },
  },
  lower: ({ ctx, inputsById }) => {
    const input = inputsById.input;

    if (!input) {
      throw new Error('Sin input required');
    }

    const outType = ctx.outTypes[0];
    const sinFn = ctx.b.opcode(OpCode.Sin);
    const result = mapAuto(input.id, sinFn, outType, ctx.b);

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
