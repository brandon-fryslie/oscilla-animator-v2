/**
 * PhaseToRadians Block
 *
 * Convert phase [0,1) to radians [0,2π).
 */

import { registerBlock } from '../registry';
import { canonicalType, unitPhase01, unitScalar, unitRadians, payloadStride, floatConst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'Adapter_PhaseToRadians',
  label: 'Phase → Radians',
  category: 'adapter',
  description: 'Convert phase [0,1) to radians [0,2π)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  adapterSpec: {
    from: { payload: FLOAT, unit: { kind: 'angle', unit: 'phase01' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'angle', unit: 'radians' }, extent: 'any' },
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'Phase [0,1) → radians [0,2π)',
    purity: 'pure',
    stability: 'stable',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitPhase01()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitRadians()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input) throw new Error('Lens block input is required');

    const twoPi = ctx.b.constant(floatConst(6.283185307179586), canonicalType(FLOAT, unitScalar()));
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const radians = ctx.b.kernelZip([input.id, twoPi], mulFn, canonicalType(FLOAT, unitRadians()));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { id: radians, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
