/**
 * Accumulator Block
 *
 * Accumulates value over time with delta input.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst, requireInst } from '../../core/canonical-types';
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

    // Symbolic state key
    const stateKey = stableStateId(ctx.instanceId, 'accumulator');

    // Read current state (symbolic key, no allocation)
    const currentValue = ctx.b.stateRead(stateKey, canonicalType(FLOAT));

    // Compute new value: reset ? 0 : (currentValue + delta)
    const add = ctx.b.opcode(OpCode.Add);
    const zero = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    const newValue = ctx.b.kernelZip([currentValue, delta.id], add, canonicalType(FLOAT));

    // Select: reset ? 0 : newValue
    const select = ctx.b.opcode(OpCode.Select);
    const finalValue = ctx.b.kernelZip([reset.id, zero, newValue], select, canonicalType(FLOAT));

    // Return effects-as-data (no imperative calls)
    return {
      outputsById: {
        value: { id: finalValue, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        stateDecls: [
          { key: stateKey, initialValue: 0 },
        ],
        stepRequests: [
          { kind: 'stateWrite' as const, stateKey, value: finalValue },
        ],
        slotRequests: [
          { portId: 'value', type: outType },
        ],
      },
    };
  },
});
