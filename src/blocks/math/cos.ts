/**
 * Cos Block
 *
 * Per-element cosine (works with both signals and fields).
 */

import { registerBlock, STANDARD_NUMERIC_PAYLOADS } from '../registry';
import { canonicalType, payloadStride } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { mapAuto } from '../lower-utils';

registerBlock({
  type: 'Cos',
  label: 'Cos',
  category: 'math',
  description: 'Per-element cosine (works with both signals and fields)',
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
    input: { label: 'Input', type: canonicalType(FLOAT) },
  },
  outputs: {
    result: { label: 'Result', type: canonicalType(FLOAT) },
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
