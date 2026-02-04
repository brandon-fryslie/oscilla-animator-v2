/**
 * Clamp11 Adapter Block
 *
 * Clamp scalar to bipolar [-1,1] with contract guarantee.
 */

import { registerBlock } from '../registry';
import { canonicalType, unitScalar, payloadStride, floatConst, contractClamp11 } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'Adapter_Clamp11',
  label: 'Clamp [-1,1]',
  category: 'adapter',
  description: 'Clamp scalar to bipolar [-1,1] with contract guarantee',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  adapterSpec: {
    from: { payload: FLOAT, unit: { kind: 'scalar' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'scalar' }, contract: { kind: 'clamp11' }, extent: 'any' },
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'Scalar → bipolar [-1,1] with clamping',
    purity: 'pure',
    stability: 'stable',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitScalar()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitScalar(), undefined, contractClamp11()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input) throw new Error('Adapter_Clamp11: input is required');

    const minusOne = ctx.b.constant(floatConst(-1), canonicalType(FLOAT, unitScalar()));
    const one = ctx.b.constant(floatConst(1), canonicalType(FLOAT, unitScalar()));
    const clampFn = ctx.b.opcode(OpCode.Clamp);
    const clamped = ctx.b.kernelZip([input.id, minusOne, one], clampFn, canonicalType(FLOAT, unitScalar(), undefined, contractClamp11()));
    const outType = ctx.outTypes[0];
    return {
      outputsById: {
        out: { id: clamped, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
    };
  },
});
