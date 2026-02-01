/**
 * Accumulator Block
 *
 * Accumulates value over time with delta input.
 */

import { registerBlock } from '../registry';
import { canonicalType, strideOf, floatConst, requireInst } from '../../core/canonical-types';
import { FLOAT, BOOL } from '../../core/canonical-types';
import { OpCode, stableStateId } from '../../compiler/ir/types';

registerBlock({
  type: 'Accumulator',
  label: 'Accumulator',
  category: 'signal',
  description: 'Accumulates value over time with delta input',
  form: 'primitive',
  capability: 'state',
  isStateful: true,  // Allows feedback cycles - reads from previous frame
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    delta: { label: 'Delta', type: canonicalType(FLOAT) },
    reset: { label: 'Reset', type: canonicalType(BOOL) },
  },
  outputs: {
    value: { label: 'Value', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const delta = inputsById.delta;
    const reset = inputsById.reset;

    const isDeltaSignal = delta && 'type' in delta && requireInst(delta.type.extent.temporality, 'temporality').kind === 'continuous';
    const isResetSignal = reset && 'type' in reset && requireInst(reset.type.extent.temporality, 'temporality').kind === 'continuous';

    if (!delta || !isDeltaSignal) {
      throw new Error('Accumulator delta required as signal');
    }
    if (!reset || !isResetSignal) {
      throw new Error('Accumulator reset required as signal');
    }

    const outType = ctx.outTypes[0];

    // Create state for accumulated value
    const stateId = stableStateId(ctx.instanceId, 'accumulator');
    const stateSlot = ctx.b.allocStateSlot(stateId, { initialValue: 0 });

    // Read current state
    const currentValue = ctx.b.stateRead(stateSlot, canonicalType(FLOAT));

    // Compute new value: reset ? 0 : (currentValue + delta)
    const add = ctx.b.opcode(OpCode.Add);
    const zero = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    const newValue = ctx.b.kernelZip([currentValue, delta.id], add, canonicalType(FLOAT));

    // Select: reset ? 0 : newValue
    const select = ctx.b.opcode(OpCode.Select);
    const finalValue = ctx.b.kernelZip([reset.id, zero, newValue], select, canonicalType(FLOAT));

    // Write back to state
    ctx.b.stepStateWrite(stateSlot, finalValue);

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        value: { id: finalValue, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});
