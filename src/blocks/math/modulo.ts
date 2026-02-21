/**
 * Modulo Block
 *
 * Computes modulo of two numbers (signals or fields).
 */

import { registerBlock, STANDARD_NUMERIC_PAYLOADS } from '../registry';
import { canonicalType, payloadStride, cardinalityVar } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const MODULO_CARD = cardinalityVar(cardinalityVarId('modulo_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'Modulo',
  label: 'Modulo',
  category: 'math',
  description: 'Computes modulo of two numbers (signals or fields)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
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
    a: { label: 'A', type: canonicalType(FLOAT, undefined, { cardinality: MODULO_CARD }) },
    b: { label: 'B', type: canonicalType(FLOAT, undefined, { cardinality: MODULO_CARD }) },
  },
  outputs: {
    out: { label: 'Output', type: canonicalType(FLOAT, undefined, { cardinality: MODULO_CARD }) },
  },
  lower: ({ ctx, inputsById }) => {
    const a = inputsById.a;
    const b = inputsById.b;
    if (!a || !b) throw new Error(`Modulo requires both inputs`);

    const outType = ctx.outTypes[0];
    const resultId = ctx.b.zipAuto([a.id, b.id], ctx.b.opcode(OpCode.Mod), outType);

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
