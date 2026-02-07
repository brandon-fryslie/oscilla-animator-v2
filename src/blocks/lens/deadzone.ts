/**
 * Deadzone Block
 *
 * y = |x| > threshold ? x : 0
 *
 * Zero out small magnitudes, preserve sign for larger values.
 * Classic deadzone/dead-band filter for noise rejection.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst, requireInst, withInstance } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { alignInputs, withoutContract } from '../lower-utils';

registerBlock({
  type: 'Deadzone',
  label: 'Deadzone',
  category: 'lens',
  description: 'Zero small magnitudes: y = |x| > threshold ? x : 0',
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
    threshold: { label: 'Threshold', type: canonicalType(FLOAT), defaultValue: 0.01 },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    const threshold = inputsById.threshold;
    if (!input) throw new Error('Deadzone: in is required');
    if (!threshold) throw new Error('Deadzone: threshold is required');

    const outType = ctx.outTypes[0];
    const inCard = requireInst(input.type.extent.cardinality, 'cardinality');
    const outTypeWithInstance = inCard.kind === 'many' ? withInstance(outType, inCard.instance) : outType;
    const intermediateType = withoutContract(outTypeWithInstance);
    const intermediateSignalType = withoutContract(threshold.type);

    // Implementation: abs(x) - threshold > 0 ? x : 0
    // Using Select opcode: select(cond, ifTrue, ifFalse) → cond > 0 ? ifTrue : ifFalse

    const absFn = ctx.b.opcode(OpCode.Abs);
    const absVal = ctx.b.kernelMap(input.id, absFn, inCard.kind === 'many' ? intermediateType : intermediateSignalType);

    const subFn = ctx.b.opcode(OpCode.Sub);
    const diff =
      inCard.kind === 'many'
        ? (() => {
          const [ab, th] = alignInputs(absVal, intermediateType, threshold.id, threshold.type, intermediateType, ctx.b);
          return ctx.b.kernelZip([ab, th], subFn, intermediateType);
        })()
        : ctx.b.kernelZip([absVal, threshold.id], subFn, intermediateSignalType);

    // If diff > 0 (i.e., |x| > threshold), use x; otherwise use 0
    const zeroConst = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    const selectFn = ctx.b.opcode(OpCode.Select);
    const result =
      inCard.kind === 'many'
        ? (() => {
          const zeroField = ctx.b.broadcast(zeroConst, intermediateType);
          const [inpField] = alignInputs(input.id, input.type, zeroField, intermediateType, intermediateType, ctx.b);
          return ctx.b.kernelZip([diff, inpField, zeroField], selectFn, outTypeWithInstance);
        })()
        : ctx.b.kernelZip([diff, input.id, zeroConst], selectFn, outTypeWithInstance);

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
