/**
 * Mask Block
 *
 * y = mask > 0 ? x : 0
 *
 * Gate/hold values based on a mask signal.
 * When mask > 0, pass through input; when mask ≤ 0, output zero.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst, requireInst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { inferType, unitVar } from '../../core/inference-types';
import { OpCode } from '../../compiler/ir/types';
import { alignInputs, withoutContract } from '../lower-utils';

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
    in: { label: 'In', type: inferType(FLOAT, unitVar('mask_U')) },
    mask: { label: 'Mask', type: canonicalType(FLOAT), exposedAsPort: true },
  },
  outputs: {
    out: { label: 'Out', type: inferType(FLOAT, unitVar('mask_U')) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    const mask = inputsById.mask;

    if (!input) throw new Error('Mask input is required');
    if (!mask) throw new Error('Mask mask input is required');

    const outType = ctx.outTypes[0];
    const outCard = requireInst(outType.extent.cardinality, 'cardinality');

    // y = select(mask, input, 0)
    // Select: cond > 0 ? ifTrue : ifFalse
    const zeroConst = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    const selectFn = ctx.b.opcode(OpCode.Select);

    const result =
      outCard.kind === 'many'
        ? (() => {
          const intermediateField = withoutContract(outType);
          const [maskField, inputField] = alignInputs(mask.id, mask.type, input.id, input.type, intermediateField, ctx.b);
          const zeroField = ctx.b.broadcast(zeroConst, intermediateField);
          return ctx.b.kernelZip([maskField, inputField, zeroField], selectFn, outType);
        })()
        : ctx.b.kernelZip([mask.id, input.id, zeroConst], selectFn, outType);

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
