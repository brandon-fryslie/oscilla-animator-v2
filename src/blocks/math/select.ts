/**
 * Select Block
 *
 * Dataflow conditional: cond > 0 ? ifTrue : ifFalse.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, unitNone, cardinalityVar, FLOAT, INT, VEC2, VEC3, VEC4, COLOR } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { cardinalityVarId } from '../../core/ids';

const SELECT_PAYLOADS = [FLOAT, INT, VEC2, VEC3, VEC4, COLOR] as const;

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const SELECT_CARD = cardinalityVar(cardinalityVarId('select_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'Select',
  label: 'Select',
  category: 'math',
  description: 'Select between A/B using cond > 0',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  payload: {
    allowedPayloads: {
      ifTrue: SELECT_PAYLOADS,
      ifFalse: SELECT_PAYLOADS,
      out: SELECT_PAYLOADS,
    },
    semantics: 'componentwise',
  },
  inputs: {
    cond: { label: 'Cond', type: canonicalType(FLOAT, unitNone(), { cardinality: SELECT_CARD }) },
    ifTrue: { label: 'If True', type: canonicalType(FLOAT, undefined, { cardinality: SELECT_CARD }) },
    ifFalse: { label: 'If False', type: canonicalType(FLOAT, undefined, { cardinality: SELECT_CARD }) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, undefined, { cardinality: SELECT_CARD }) },
  },
  lower: ({ ctx, inputsById }) => {
    const cond = inputsById.cond;
    const ifTrue = inputsById.ifTrue;
    const ifFalse = inputsById.ifFalse;
    if (!cond || !ifTrue || !ifFalse) {
      throw new Error('Select requires cond, ifTrue, and ifFalse inputs');
    }

    const outType = ctx.outTypes[0];
    const result = ctx.b.zipAuto([cond.id, ifTrue.id, ifFalse.id], ctx.b.opcode(OpCode.Select), outType);

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
