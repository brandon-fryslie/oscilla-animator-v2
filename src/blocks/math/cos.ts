/**
 * Cos Block
 *
 * Per-element cosine (works with both signals and fields).
 */

import { registerBlock, STANDARD_NUMERIC_PAYLOADS } from '../registry';
import { canonicalType, payloadStride } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'Cos',
  label: 'Cos',
  category: 'math',
  description: 'Per-element cosine (works with both signals and fields)',
  form: 'primitive',
  capability: 'pure',
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
    const cosFn = ctx.b.opcode(OpCode.Cos);  // ALWAYS opcode
    const result = ctx.b.kernelMap(input.id, cosFn, outType);
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        result: { id: result, slot, type: outType, stride: payloadStride(outType.payload) },
      },
      // instanceContext auto-propagated by framework
    };
  },
});
