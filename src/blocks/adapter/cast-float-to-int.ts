/**
 * CastFloatToInt Block
 *
 * Adapter: float → int via truncation toward zero.
 * Clamps to i32 range, NaN → 0.
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
const CAST_FLOAT_TO_INT_CARD = cardinalityVar(cardinalityVarId('cast_float_to_int_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'Adapter_CastFloatToInt',
  label: 'Float \u2192 Int',
  category: 'adapter',
  description: 'Cast float to int (truncation toward zero)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  adapterSpec: {
    from: { payload: FLOAT, unit: 'any', extent: 'any' },
    to: { payload: INT, unit: 'same', extent: 'any' },
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'Float \u2192 int (truncation)',
    purity: 'pure',
    stability: 'stable',
  },
  inputs: {
    in: { label: 'In', type: inferType(FLOAT, unitVar('cast_U'), { cardinality: CAST_FLOAT_TO_INT_CARD }) },
  },
  outputs: {
    out: { label: 'Out', type: inferType(INT, unitVar('cast_U'), { cardinality: CAST_FLOAT_TO_INT_CARD }) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input) throw new Error('Adapter block input is required');

    const outType = ctx.outTypes[0];
    const truncFn = ctx.b.opcode(OpCode.F64ToI32Trunc);
    const result = mapAuto(input.id, truncFn, outType, ctx.b);
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
