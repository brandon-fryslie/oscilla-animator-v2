/**
 * CastIntToFloat Block
 *
 * Adapter: int → float (identity in JS — type boundary marker).
 * Unit passthrough: preserves whatever unit the source has.
 */

import { registerBlock } from '../registry';
import { payloadStride } from '../../core/canonical-types';
import { FLOAT, INT } from '../../core/canonical-types';
import { inferType, unitVar } from '../../core/inference-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'Adapter_CastIntToFloat',
  label: 'Int → Float',
  category: 'adapter',
  description: 'Cast int to float (identity in JS)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
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
    in: { label: 'In', type: inferType(INT, unitVar('cast_U')) },
  },
  outputs: {
    out: { label: 'Out', type: inferType(FLOAT, unitVar('cast_U')) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input) throw new Error('Adapter block input is required');

    const outType = ctx.outTypes[0];
    const castFn = ctx.b.opcode(OpCode.I32ToF64);
    const result = ctx.b.kernelMap(input.id, castFn, outType);
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
