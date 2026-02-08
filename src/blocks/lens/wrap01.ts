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
import { inferType, unitVar } from '../../core/inference-types';
import { OpCode } from '../../compiler/ir/types';
import { mapAuto } from '../lower-utils';

registerBlock({
  type: 'Wrap01',
  label: 'Wrap [0,1)',
  category: 'lens',
  description: 'y = fract(x) - wrap to [0,1) without changing type',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: inferType(FLOAT, unitVar('w01_U')) },
  },
  outputs: {
    out: { label: 'Out', type: inferType(FLOAT, unitVar('w01_U')) },
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
