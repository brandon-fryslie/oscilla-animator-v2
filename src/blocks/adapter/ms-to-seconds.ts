/**
 * MsToSeconds Block
 *
 * Convert milliseconds to seconds.
 */

import { registerBlock } from '../registry';
import { canonicalType, unitMs, unitScalar, unitSeconds, payloadStride, floatConst } from '../../core/canonical-types';
import { INT, FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'Adapter_MsToSeconds',
  label: 'Ms → Seconds',
  category: 'adapter',
  description: 'Convert milliseconds to seconds',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  adapterSpec: {
    from: { payload: INT, unit: { kind: 'time', unit: 'ms' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'time', unit: 'seconds' }, extent: 'any' },
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'Milliseconds (int) → seconds (float)',
    purity: 'pure',
    stability: 'stable',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(INT, unitMs()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitSeconds()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input) throw new Error('Lens block input is required');

    const outType = ctx.outTypes[0];
    // int:ms → float division → float:seconds
    const divisor = ctx.b.constant(floatConst(1000), canonicalType(FLOAT, unitScalar()));
    const divFn = ctx.b.opcode(OpCode.Div);
    const seconds = ctx.b.kernelZip([input.id, divisor], divFn, outType);
    return {
      outputsById: {
        out: { id: seconds, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
    };
  },
});
