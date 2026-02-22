/**
 * Clamp Block
 *
 * y = clamp(x, min, max)
 *
 * Bounds enforcement for value ranges.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { inferType, unitVar, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { OpCode } from '../../compiler/ir/types';
import { zipAuto } from '../lower-utils';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const CLAMP_CARD = cardinalityVar(cardinalityVarId('clamp_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'Clamp',
    label: 'Clamp',
    category: 'lens',
    description: 'y = clamp(x, min, max) - bounds enforcement',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      in: { label: 'In', type: inferType(FLOAT, unitVar('clamp_U'), { cardinality: CLAMP_CARD }) },
      min: { label: 'Min', type: inferType(FLOAT, unitVar('clamp_U'), { cardinality: CLAMP_CARD }), defaultValue: 0.0 },
      max: { label: 'Max', type: inferType(FLOAT, unitVar('clamp_U'), { cardinality: CLAMP_CARD }), defaultValue: 1.0 },
    },
    outputs: {
      out: { label: 'Out', type: inferType(FLOAT, unitVar('clamp_U'), { cardinality: CLAMP_CARD }) },
    },
    lower: ({ inputsById, ctx }) => {
      const input = inputsById.in;
      const min = inputsById.min;
      const max = inputsById.max;
      if (!input) throw new Error('Clamp: in is required');
      if (!min) throw new Error('Clamp: min is required');
      if (!max) throw new Error('Clamp: max is required');
  
      const outType = ctx.outTypes[0];
  
      const clampFn = ctx.b.opcode(OpCode.Clamp);
      const result = zipAuto([input.id, min.id, max.id], clampFn, outType, ctx.b);
  
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
