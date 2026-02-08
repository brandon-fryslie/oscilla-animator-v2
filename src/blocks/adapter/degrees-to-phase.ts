/**
 * DegreesToPhase Block
 *
 * Convert degrees to phase [0,1) with wrapping.
 * Direct single-step adapter (degrees / 360, then wrap01).
 */

import { registerBlock } from '../registry';
import { canonicalType, unitTurns, unitNone, unitDegrees, payloadStride, floatConst, contractWrap01 } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { zipAuto, mapAuto } from '../lower-utils';

registerBlock({
  type: 'Adapter_DegreesToPhase',
  label: 'Degrees → Phase',
  category: 'adapter',
  description: 'Convert degrees to phase [0,1) with wrapping',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  adapterSpec: {
    from: { payload: FLOAT, unit: { kind: 'angle', unit: 'degrees' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'angle', unit: 'turns' }, contract: { kind: 'wrap01' }, extent: 'any' },
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'Degrees → phase [0,1) with wrapping',
    purity: 'pure',
    stability: 'stable',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitDegrees()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitTurns(), undefined, contractWrap01()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input) throw new Error('Adapter block input is required');

    const outType = ctx.outTypes[0];
    const threeSixty = ctx.b.constant(floatConst(360), canonicalType(FLOAT, unitNone()));
    const divFn = ctx.b.opcode(OpCode.Div);
    const divided = zipAuto([input.id, threeSixty], divFn, outType, ctx.b);
    const wrapFn = ctx.b.opcode(OpCode.Wrap01);
    const wrapped = mapAuto(divided, wrapFn, outType, ctx.b);
    return {
      outputsById: {
        out: { id: wrapped, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
    };
  },
});
