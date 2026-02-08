/**
 * Wrap01 Adapter Block
 *
 * Wrap scalar to [0,1) with contract guarantee (cyclic wrap).
 */

import { registerBlock } from '../registry';
import { canonicalType, unitNone, payloadStride, contractWrap01 } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'Adapter_Wrap01',
  label: 'Wrap [0,1)',
  category: 'adapter',
  description: 'Wrap scalar to [0,1) with contract guarantee (cyclic wrap)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  adapterSpec: {
    from: { payload: FLOAT, unit: { kind: 'none' }, extent: 'any' },
    to: { payload: FLOAT, unit: { kind: 'none' }, contract: { kind: 'wrap01' }, extent: 'any' },
    inputPortId: 'in',
    outputPortId: 'out',
    description: 'Scalar → [0,1) with cyclic wrapping',
    purity: 'pure',
    stability: 'stable',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitNone()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitNone(), undefined, contractWrap01()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input) throw new Error('Adapter_Wrap01: input is required');

    const outType = ctx.outTypes[0];

    // fract(x) using Wrap01 opcode
    const wrapFn = ctx.b.opcode(OpCode.Wrap01);
    const wrapped = ctx.b.kernelMap(input.id, wrapFn, outType);

    return {
      outputsById: {
        out: { id: wrapped, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
    };
  },
});
