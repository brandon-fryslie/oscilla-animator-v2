/**
 * Lerp Block
 *
 * Componentwise linear interpolation between A and B.
 */

import { registerBlock } from '../registry';
import { defaultSourceConst } from '../../types';
import { canonicalType, payloadStride, unitNone, contractClamp01, cardinalityVar, FLOAT, INT, VEC2, VEC3, VEC4, COLOR } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { cardinalityVarId } from '../../core/ids';

const LERP_PAYLOADS = [FLOAT, INT, VEC2, VEC3, VEC4, COLOR] as const;

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const LERP_CARD = cardinalityVar(cardinalityVarId('lerp_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'Lerp',
    label: 'Lerp',
    category: 'math',
    description: 'Linear interpolation between A and B by T',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    payload: {
      allowedPayloads: {
        a: LERP_PAYLOADS,
        b: LERP_PAYLOADS,
        out: LERP_PAYLOADS,
      },
      semantics: 'componentwise',
    },
    inputs: {
      a: { label: 'A', type: canonicalType(FLOAT, undefined, { cardinality: LERP_CARD }) },
      b: { label: 'B', type: canonicalType(FLOAT, undefined, { cardinality: LERP_CARD }) },
      t: {
        label: 'T',
        type: canonicalType(FLOAT, unitNone(), { cardinality: LERP_CARD }, contractClamp01()),
        defaultValue: 0.5,
        defaultSource: defaultSourceConst(0.5),
        exposedAsPort: true,
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
      },
    },
    outputs: {
      out: { label: 'Out', type: canonicalType(FLOAT, undefined, { cardinality: LERP_CARD }) },
    },
    lower: ({ ctx, inputsById }) => {
      const a = inputsById.a;
      const b = inputsById.b;
      const t = inputsById.t;
      if (!a || !b || !t) throw new Error('Lerp requires a, b, and t inputs');
  
      const outType = ctx.outTypes[0];
      const result = ctx.b.zipAuto([a.id, b.id, t.id], ctx.b.opcode(OpCode.Lerp), outType);
  
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
}
