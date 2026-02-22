/**
 * CastIntToFloat Block
 *
 * Adapter: int → float (identity in JS — type boundary marker).
 * Unit passthrough: preserves whatever unit the source has.
 */

import { registerBlock } from '../registry';
import { payloadStride } from '../../core/canonical-types';
import { FLOAT, INT } from '../../core/canonical-types';
import { inferType, unitVar, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { OpCode } from '../../compiler/ir/types';
import { zipAuto, mapAuto } from '../lower-utils';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const CAST_INT_TO_FLOAT_CARD = cardinalityVar(cardinalityVarId('cast_int_to_float_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'Adapter_CastIntToFloat',
    label: 'Int → Float',
    category: 'adapter',
    description: 'Cast int to float (identity in JS)',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    adapterSpec: {
      from: { payload: INT, unit: 'any', extent: 'any' },
      to: { payload: FLOAT, unit: 'same', extent: 'any' },
      inputPortId: 'in',
      outputPortId: 'out',
      description: 'Int → float (identity)',
      purity: 'pure',
      stability: 'stable',
    },
    inputs: {
      in: { label: 'In', type: inferType(INT, unitVar('cast_U'), { cardinality: CAST_INT_TO_FLOAT_CARD }) },
    },
    outputs: {
      out: { label: 'Out', type: inferType(FLOAT, unitVar('cast_U'), { cardinality: CAST_INT_TO_FLOAT_CARD }) },
    },
    lower: ({ inputsById, ctx }) => {
      const input = inputsById.in;
      if (!input) throw new Error('Adapter block input is required');
  
      const outType = ctx.outTypes[0];
      const castFn = ctx.b.opcode(OpCode.I32ToF64);
      const result = mapAuto(input.id, castFn, outType, ctx.b);
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
