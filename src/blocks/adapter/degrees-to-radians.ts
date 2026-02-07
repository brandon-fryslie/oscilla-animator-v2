/**
 * DegreesToRadians Block
 *
 * Convert degrees to radians.
 */

import { registerBlock } from '../registry';
import { canonicalType, unitDegrees, unitScalar, unitRadians, payloadStride, floatConst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'Adapter_DegreesToRadians',
  label: 'Degrees → Radians',
  category: 'adapter',
  description: 'Convert degrees to radians',
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
    to: { payload: FLOAT, unit: { kind: 'angle', unit: 'radians' }, extent: 'any' },
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'Degrees → radians',
    purity: 'pure',
    stability: 'stable',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitDegrees()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitRadians()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input) throw new Error('Lens block input is required');

    const outType = ctx.outTypes[0];
    const factor = ctx.b.constant(floatConst(0.017453292519943295), canonicalType(FLOAT, unitScalar())); // π/180
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const radians = ctx.b.kernelZip([input.id, factor], mulFn, outType);
    return {
      outputsById: {
        out: { id: radians, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
    };
  },
});
