/**
 * SecondsToMs Block
 *
 * Convert seconds to milliseconds (rounded down).
 */

import { registerBlock } from '../registry';
import { canonicalType, unitMs, unitNone, unitSeconds, payloadStride, floatConst } from '../../core/canonical-types';
import { INT, FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { zipAuto, mapAuto } from '../lower-utils';

registerBlock({
  type: 'Adapter_SecondsToMs',
  label: 'Seconds → Ms',
  category: 'adapter',
  description: 'Convert seconds to milliseconds (rounded down)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  adapterSpec: {
    from: { payload: FLOAT, unit: { kind: 'time', unit: 'seconds' }, extent: 'any' },
    to: { payload: INT, unit: { kind: 'time', unit: 'ms' }, extent: 'any' },
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'Seconds (float) → milliseconds (int, rounded)',
    purity: 'pure',
    stability: 'stable',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitSeconds()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(INT, unitMs()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input) throw new Error('Lens block input is required');

    const outType = ctx.outTypes[0];
    const multiplier = ctx.b.constant(floatConst(1000), canonicalType(FLOAT, unitNone()));
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const floatMs = zipAuto([input.id, multiplier], mulFn, outType, ctx.b);
    const floorFn = ctx.b.opcode(OpCode.Floor);
    const intMs = mapAuto(floatMs, floorFn, outType, ctx.b);
    return {
      outputsById: {
        out: { id: intMs, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
    };
  },
});
