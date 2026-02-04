/**
 * Mask Block
 *
 * y = mask > 0 ? x : 0
 *
 * Gate/hold values based on a mask signal.
 * When mask > 0, pass through input; when mask ≤ 0, output zero.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

registerBlock({
  type: 'Mask',
  label: 'Mask',
  category: 'lens',
  description: 'Gate values: y = mask > 0 ? x : 0',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT) },
    mask: { label: 'Mask', type: canonicalType(FLOAT), exposedAsPort: true },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    const mask = inputsById.mask;

    if (!input) throw new Error('Mask input is required');
    if (!mask) throw new Error('Mask mask input is required');

    const outType = ctx.outTypes[0];

    // y = select(mask, input, 0)
    // Select: cond > 0 ? ifTrue : ifFalse
    const zeroConst = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    const selectFn = ctx.b.opcode(OpCode.Select);
    const result = ctx.b.kernelZip([mask.id, input.id, zeroConst], selectFn, outType);

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
