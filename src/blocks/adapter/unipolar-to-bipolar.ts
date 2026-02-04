/**
 * UnipolarToBipolar Adapter Block
 *
 * Convert unipolar [0,1] to bipolar [-1,1].
 * Formula: b = u * 2 - 1
 */

import { registerBlock } from '../registry';
import { canonicalType, unitScalar, payloadStride, floatConst, contractClamp01, contractClamp11 } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'Adapter_UnipolarToBipolar',
  label: 'Unipolar → Bipolar',
  category: 'adapter',
  description: 'Convert unipolar [0,1] to bipolar [-1,1]: b = u * 2 - 1',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  adapterSpec: {
    from: { payload: FLOAT, unit: { kind: 'scalar' }, contract: { kind: 'clamp01' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'scalar' }, contract: { kind: 'clamp11' }, extent: 'any' },
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'Unipolar [0,1] → bipolar [-1,1]',
    purity: 'pure',
    stability: 'stable',
    priority: -10, // Higher priority than general Clamp11 adapter (more specific conversion)
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitScalar(), undefined, contractClamp11()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input) throw new Error('Adapter_UnipolarToBipolar: input is required');

    const outType = ctx.outTypes[0];

    // b = u * 2 - 1
    const two = ctx.b.constant(floatConst(2), canonicalType(FLOAT, unitScalar()));
    const one = ctx.b.constant(floatConst(1), canonicalType(FLOAT, unitScalar()));

    const mulFn = ctx.b.opcode(OpCode.Mul);
    const scaled = ctx.b.kernelZip([input.id, two], mulFn, canonicalType(FLOAT, unitScalar()));

    const subFn = ctx.b.opcode(OpCode.Sub);
    const result = ctx.b.kernelZip([scaled, one], subFn, outType);

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
