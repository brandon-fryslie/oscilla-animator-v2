/**
 * Add Block
 *
 * Adds two numbers (single-instance or per-instance fields).
 */

import { registerBlock, STANDARD_NUMERIC_PAYLOADS } from '../registry';
import { canonicalType, payloadStride, cardinalityVar } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const ADD_CARD = cardinalityVar(cardinalityVarId('add_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'Add',
    label: 'Add',
    category: 'math',
    description: 'Adds two numbers (single-instance or per-instance fields)',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure', // MIGRATION (2026-02-03): Pure block for macro expansion
    payload: {
      allowedPayloads: {
        a: STANDARD_NUMERIC_PAYLOADS,
        b: STANDARD_NUMERIC_PAYLOADS,
        out: STANDARD_NUMERIC_PAYLOADS,
      },
      semantics: 'componentwise',
      unitBehavior: 'preserve',
    },
    inputs: {
      a: { label: 'A', type: canonicalType(FLOAT, undefined, { cardinality: ADD_CARD }) },
      b: { label: 'B', type: canonicalType(FLOAT, undefined, { cardinality: ADD_CARD }) },
    },
    outputs: {
      out: { label: 'Output', type: canonicalType(FLOAT, undefined, { cardinality: ADD_CARD }) },
    },
    lower: ({ ctx, inputsById }) => {
      const a = inputsById.a;
      const b = inputsById.b;
      if (!a || !b) throw new Error(`Add requires both inputs`);
  
      const outType = ctx.outTypes[0];
      const resultId = ctx.b.zipAuto([a.id, b.id], ctx.b.opcode(OpCode.Add), outType);
  
      // MIGRATION (2026-02-03): Pure blocks return effects-as-data.
      // The orchestrator allocates slots on behalf of pure blocks via slotRequests.
      return {
        outputsById: {
          out: { id: resultId, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
        },
        effects: {
          slotRequests: [
            { portId: 'out', type: outType },
          ],
        },
      };
    },
  });
}
