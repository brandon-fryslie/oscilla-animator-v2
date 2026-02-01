/**
 * Multiply Block
 *
 * Multiplies two numbers (signals or fields).
 */

import { registerBlock, STANDARD_NUMERIC_PAYLOADS } from '../registry';
import { canonicalType, payloadStride } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { alignInputs } from '../lower-utils';

registerBlock({
  type: 'Multiply',
  label: 'Multiply',
  category: 'math',
  description: 'Multiplies two numbers (signals or fields)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  payload: {
    allowedPayloads: {
      a: STANDARD_NUMERIC_PAYLOADS,
      b: STANDARD_NUMERIC_PAYLOADS,
      out: STANDARD_NUMERIC_PAYLOADS,
    },
    semantics: 'componentwise',
  },
  inputs: {
    a: { label: 'A', type: canonicalType(FLOAT) },
    b: { label: 'B', type: canonicalType(FLOAT) },
  },
  outputs: {
    out: { label: 'Output', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const a = inputsById.a;
    const b = inputsById.b;
    if (!a || !b) throw new Error(`Multiply requires both inputs`);

    const outType = ctx.outTypes[0];
    const [aId, bId] = alignInputs(a.id, a.type, b.id, b.type, outType, ctx.b);
    const resultId = ctx.b.kernelZip([aId, bId], ctx.b.opcode(OpCode.Mul), outType);
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { id: resultId, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
