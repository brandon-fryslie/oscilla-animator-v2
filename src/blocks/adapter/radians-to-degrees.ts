/**
 * RadiansToDegrees Block
 *
 * Convert radians to degrees.
 */

import { registerBlock } from '../registry';
import { canonicalType, unitDegrees, unitNone, unitRadians, payloadStride, floatConst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'Adapter_RadiansToDegrees',
  label: 'Radians → Degrees',
  category: 'adapter',
  description: 'Convert radians to degrees',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  adapterSpec: {
    from: { payload: FLOAT, unit: { kind: 'angle', unit: 'radians' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'angle', unit: 'degrees' }, extent: 'any' },
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'Radians → degrees',
    purity: 'pure',
    stability: 'stable',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitRadians()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitDegrees()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input) throw new Error('Lens block input is required');

    const outType = ctx.outTypes[0];
    const factor = ctx.b.constant(floatConst(57.29577951308232), canonicalType(FLOAT, unitNone())); // 180/π
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const degrees = ctx.b.kernelZip([input.id, factor], mulFn, outType);
    return {
      outputsById: {
        out: { id: degrees, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
    };
  },
});
