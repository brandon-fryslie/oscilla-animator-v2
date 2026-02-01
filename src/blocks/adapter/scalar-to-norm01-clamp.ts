/**
 * ScalarToNorm01Clamp Block
 *
 * Clamp scalar to normalized [0,1].
 */

import { registerBlock } from '../registry';
import { canonicalType, unitNorm01, unitScalar, strideOf, floatConst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'Adapter_ScalarToNorm01Clamp',
  label: 'Scalar → Norm01',
  category: 'adapter',
  description: 'Clamp scalar to normalized [0,1]',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  adapterSpec: {
    from: { payload: FLOAT, unit: { kind: 'scalar' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'norm01' }, extent: 'any' },
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'Scalar → normalized [0,1] with clamping',
    purity: 'pure',
    stability: 'stable',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitScalar()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitNorm01()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input) throw new Error('Lens block input is required');

    const zero = ctx.b.constant(floatConst(0), canonicalType(FLOAT, unitScalar()));
    const one = ctx.b.constant(floatConst(1), canonicalType(FLOAT, unitScalar()));
    const clampFn = ctx.b.opcode(OpCode.Clamp);
    const clamped = ctx.b.kernelZip([input.id, zero, one], clampFn, canonicalType(FLOAT, unitNorm01()));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { id: clamped, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});
