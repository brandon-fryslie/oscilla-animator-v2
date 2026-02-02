/**
 * RadiansToPhase01 Block
 *
 * Convert radians to phase [0,1) with wrapping.
 */

import { registerBlock } from '../registry';
import { canonicalType, unitTurns, unitScalar, unitRadians, payloadStride, floatConst, contractWrap01 } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'Adapter_RadiansToPhase01',
  label: 'Radians → Phase',
  category: 'adapter',
  description: 'Convert radians to phase [0,1) with wrapping',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  adapterSpec: {
    from: { payload: FLOAT, unit: { kind: 'angle', unit: 'radians' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'angle', unit: 'turns' }, contract: { kind: 'wrap01' }, extent: 'any' },
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'Radians → phase [0,1) with wrapping',
    purity: 'pure',
    stability: 'stable',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitRadians()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitTurns(), undefined, contractWrap01()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input) throw new Error('Lens block input is required');

    const twoPi = ctx.b.constant(floatConst(6.283185307179586), canonicalType(FLOAT, unitScalar()));
    const divFn = ctx.b.opcode(OpCode.Div);
    const divided = ctx.b.kernelZip([input.id, twoPi], divFn, canonicalType(FLOAT, unitScalar()));
    const wrapFn = ctx.b.opcode(OpCode.Wrap01);
    const wrapped = ctx.b.kernelMap(divided, wrapFn, canonicalType(FLOAT, unitTurns(), undefined, contractWrap01()));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { id: wrapped, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
