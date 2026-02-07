/**
 * DenormalizeRange Lens Block
 *
 * y = x * (max - min) + min
 *
 * Maps [0,1] → [min, max].
 * User-placed lens, not auto-inserted.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, contractClamp01, requireInst, withInstance } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { alignInputs, withoutContract } from '../lower-utils';

registerBlock({
  type: 'Lens_DenormalizeRange',
  label: 'Denormalize Range',
  category: 'lens',
  description: 'y = x * (max - min) + min - maps [0,1] → [min, max]',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, undefined, undefined, contractClamp01()) },
    min: { label: 'Min', type: canonicalType(FLOAT), defaultValue: 0.0 },
    max: { label: 'Max', type: canonicalType(FLOAT), defaultValue: 1.0 },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    const min = inputsById.min;
    const max = inputsById.max;
    if (!input) throw new Error('Lens_DenormalizeRange: in is required');
    if (!min) throw new Error('Lens_DenormalizeRange: min is required');
    if (!max) throw new Error('Lens_DenormalizeRange: max is required');

    const outType = ctx.outTypes[0];
    const inCard = requireInst(input.type.extent.cardinality, 'cardinality');
    const outTypeWithInstance = inCard.kind === 'many' ? withInstance(outType, inCard.instance) : outType;

    const intermediateType = withoutContract(outTypeWithInstance);
    const intermediateSignalType = withoutContract(min.type);

    // y = x * (max - min) + min
    const subFn = ctx.b.opcode(OpCode.Sub);
    const maxCard = requireInst(max.type.extent.cardinality, 'cardinality');
    const minCard = requireInst(min.type.extent.cardinality, 'cardinality');
    const range =
      (maxCard.kind === 'many' || minCard.kind === 'many')
        ? (() => {
          const [mx, mn] = alignInputs(max.id, max.type, min.id, min.type, intermediateType, ctx.b);
          return ctx.b.kernelZip([mx, mn], subFn, intermediateType);
        })()
        : ctx.b.kernelZip([max.id, min.id], subFn, intermediateSignalType);

    const mulFn = ctx.b.opcode(OpCode.Mul);
    const scaled =
      inCard.kind === 'many'
        ? (() => {
          const rangeField =
            (maxCard.kind === 'many' || minCard.kind === 'many')
              ? range
              : ctx.b.broadcast(range, intermediateType);
          const [x, rg] = alignInputs(input.id, input.type, rangeField, intermediateType, intermediateType, ctx.b);
          return ctx.b.kernelZip([x, rg], mulFn, intermediateType);
        })()
        : ctx.b.kernelZip([input.id, range], mulFn, intermediateSignalType);

    const addFn = ctx.b.opcode(OpCode.Add);
    const result =
      inCard.kind === 'many'
        ? (() => {
          const [sc, mn] = alignInputs(scaled, intermediateType, min.id, min.type, intermediateType, ctx.b);
          return ctx.b.kernelZip([sc, mn], addFn, outTypeWithInstance);
        })()
        : ctx.b.kernelZip([scaled, min.id], addFn, outTypeWithInstance);

    return {
      outputsById: {
        out: { id: result, slot: undefined, type: outTypeWithInstance, stride: payloadStride(outTypeWithInstance.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'out', type: outTypeWithInstance },
        ],
      },
    };
  },
});
