/**
 * NormalizeRange Lens Block
 *
 * y = (x - min) / (max - min)
 *
 * Maps [min, max] → [0,1] with contract guarantee.
 * User-placed lens, not auto-inserted.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, contractClamp01, requireInst, withInstance } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { alignInputs, withoutContract } from '../lower-utils';

registerBlock({
  type: 'Lens_NormalizeRange',
  label: 'Normalize Range',
  category: 'lens',
  description: 'y = (x - min) / (max - min) - maps [min, max] → [0,1]',
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
    min: { label: 'Min', type: canonicalType(FLOAT), defaultValue: 0.0 },
    max: { label: 'Max', type: canonicalType(FLOAT), defaultValue: 1.0 },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, undefined, undefined, contractClamp01()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    const min = inputsById.min;
    const max = inputsById.max;
    if (!input) throw new Error('Lens_NormalizeRange: in is required');
    if (!min) throw new Error('Lens_NormalizeRange: min is required');
    if (!max) throw new Error('Lens_NormalizeRange: max is required');

    const outType = ctx.outTypes[0];
    const inCard = requireInst(input.type.extent.cardinality, 'cardinality');
    const outTypeWithInstance = inCard.kind === 'many' ? withInstance(outType, inCard.instance) : outType;

    const intermediateType = withoutContract(outTypeWithInstance);
    const intermediateSignalType = withoutContract(min.type);

    // y = (x - min) / (max - min)
    const subFn = ctx.b.opcode(OpCode.Sub);

    const numerator =
      inCard.kind === 'many'
        ? (() => {
          const [x, mn] = alignInputs(input.id, input.type, min.id, min.type, intermediateType, ctx.b);
          return ctx.b.kernelZip([x, mn], subFn, intermediateType);
        })()
        : ctx.b.kernelZip([input.id, min.id], subFn, intermediateSignalType);

    const maxCard = requireInst(max.type.extent.cardinality, 'cardinality');
    const minCard = requireInst(min.type.extent.cardinality, 'cardinality');
    const range =
      (maxCard.kind === 'many' || minCard.kind === 'many')
        ? (() => {
          const [mx, mn] = alignInputs(max.id, max.type, min.id, min.type, intermediateType, ctx.b);
          return ctx.b.kernelZip([mx, mn], subFn, intermediateType);
        })()
        : ctx.b.kernelZip([max.id, min.id], subFn, intermediateSignalType);

    const divFn = ctx.b.opcode(OpCode.Div);
    const result =
      inCard.kind === 'many'
        ? (() => {
          const rangeField =
            (maxCard.kind === 'many' || minCard.kind === 'many')
              ? range
              : ctx.b.broadcast(range, intermediateType);
          return ctx.b.kernelZip([numerator, rangeField], divFn, outTypeWithInstance);
        })()
        : ctx.b.kernelZip([numerator, range], divFn, outTypeWithInstance);

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
