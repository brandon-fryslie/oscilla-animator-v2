/**
 * Add Block
 *
 * Adds two numbers (signals or fields).
 */

import { registerBlock, STANDARD_NUMERIC_PAYLOADS } from '../registry';
import { canonicalType, payloadStride } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { alignInputs } from '../lower-utils';

registerBlock({
  type: 'Add',
  label: 'Add',
  category: 'math',
  description: 'Adds two numbers (signals or fields)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure', // MIGRATION (2026-02-03): Pure block for macro expansion
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
    if (!a || !b) throw new Error(`Add requires both inputs`);

    const outType = ctx.outTypes[0];
    const [aId, bId] = alignInputs(a.id, a.type, b.id, b.type, outType, ctx.b);
    const resultId = ctx.b.kernelZip([aId, bId], ctx.b.opcode(OpCode.Add), outType);

    // MIGRATION (2026-02-03): Pure blocks don't allocate slots directly.
    // The orchestrator (lower-blocks.ts) allocates slots on behalf of pure blocks.
    return {
      outputsById: {
        out: { id: resultId, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
