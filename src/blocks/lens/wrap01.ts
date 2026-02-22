/**
 * Wrap01 Block
 *
 * y = fract(x)
 *
 * Phase/hue hygiene wrap to [0,1). Value shaper only - does NOT change unit type.
 * For type conversion to phase01, use Adapter_ScalarToPhase01 instead.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { inferType, unitVar, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { OpCode } from '../../compiler/ir/types';
import { mapAuto } from '../lower-utils';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const WRAP01_CARD = cardinalityVar(cardinalityVarId('wrap01_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'Wrap01',
    label: 'Wrap [0,1)',
    category: 'lens',
    description: 'y = fract(x) - wrap to [0,1) without changing type',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      in: { label: 'In', type: inferType(FLOAT, unitVar('w01_U'), { cardinality: WRAP01_CARD }) },
    },
    outputs: {
      out: { label: 'Out', type: inferType(FLOAT, unitVar('w01_U'), { cardinality: WRAP01_CARD }) },
    },
    lower: ({ inputsById, ctx }) => {
      const input = inputsById.in;
      if (!input) throw new Error('Wrap01 input is required');
  
      const outType = ctx.outTypes[0];
  
      // fract(x) using Wrap01 opcode
      const wrapFn = ctx.b.opcode(OpCode.Wrap01);
      const result = mapAuto(input.id, wrapFn, outType, ctx.b);
  
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
