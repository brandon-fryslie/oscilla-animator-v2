/**
 * Slew Block
 *
 * y += (x - y) * rate * dt
 *
 * Rate-limited smoothing lens using exponential smoothing.
 * Similar to Lag but designed for lens-on-port usage.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, requireInst, unitNorm01 } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { OpCode, stableStateId } from '../../compiler/ir/types';

registerBlock({
  type: 'Slew',
  label: 'Slew',
  category: 'lens',
  description: 'Rate-limited smoothing: y += (x - y) * rate * dt',
  form: 'primitive',
  capability: 'state',
  isStateful: true,  // Allows feedback cycles - reads from previous frame
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT) },
    rate: { label: 'Rate', type: canonicalType(FLOAT, unitNorm01()), defaultValue: 0.5 },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const input = inputsById.in;
    const rate = inputsById.rate;
    const isInputSignal = input && 'type' in input && requireInst(input.type.extent.temporality, 'temporality').kind === 'continuous';
    if (!input || !isInputSignal) throw new Error('Slew requires input signal');
    if (!rate) throw new Error('Slew: rate is required');

    const outType = ctx.outTypes[0];

    // Create state for smoothed value
    const stateId = stableStateId(ctx.instanceId, 'slew');
    const stateSlot = ctx.b.allocStateSlot(stateId, { initialValue: 0 });

    // Read previous state
    const prevValue = ctx.b.stateRead(stateSlot, outType);

    // Compute: lerp(prev, input, rate)
    const lerpFn = ctx.b.opcode(OpCode.Lerp);
    const newValue = ctx.b.kernelZip([prevValue, input.id, rate.id], lerpFn, outType);

    // Write new value to state
    ctx.b.stepStateWrite(stateSlot, newValue);

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { id: newValue, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
