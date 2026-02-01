/**
 * RadiansToDegrees Block
 *
 * Convert radians to degrees.
 */

import { registerBlock } from '../registry';
import { canonicalType, unitDegrees, unitScalar, unitRadians, strideOf, floatConst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'Adapter_RadiansToDegrees',
  label: 'Radians → Degrees',
  category: 'adapter',
  description: 'Convert radians to degrees',
  form: 'primitive',
  capability: 'pure',
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

    const factor = ctx.b.constant(floatConst(57.29577951308232), canonicalType(FLOAT, unitScalar())); // 180/π
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const degrees = ctx.b.kernelZip([input.id, factor], mulFn, canonicalType(FLOAT, unitDegrees()));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { id: degrees, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});
