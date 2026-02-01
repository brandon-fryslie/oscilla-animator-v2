/**
 * SampleHold Block
 *
 * Event-driven latch (spec §9.2.2).
 * Latches input value when event fires, holds until next fire.
 */

import { registerBlock } from '../registry';
import { canonicalType, canonicalEvent, payloadStride, requireInst, FLOAT } from '../../core/canonical-types';
import { OpCode, stableStateId } from '../../compiler/ir/types';
import type { ValueExprId } from '../../compiler/ir/Indices';

registerBlock({
  type: 'SampleHold',
  label: 'Sample & Hold',
  category: 'event',
  description: 'Latches input value when event fires, holds until next fire',
  form: 'primitive',
  capability: 'state',
  isStateful: true,
  inputs: {
    value: { label: 'Value', type: canonicalType(FLOAT) },
    trigger: { label: 'Trigger', type: canonicalEvent() },
    initialValue: { type: canonicalType(FLOAT), value: 0, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Held', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById, config }) => {
    const valueInput = inputsById.value;
    const triggerInput = inputsById.trigger;

    if (!valueInput || !('type' in valueInput) || requireInst(valueInput.type.extent.temporality, 'temporality').kind !== 'continuous') {
      throw new Error('SampleHold: value input must be a signal');
    }
    if (!triggerInput || !('type' in triggerInput) || requireInst(triggerInput.type.extent.temporality, 'temporality').kind !== 'discrete') {
      throw new Error('SampleHold: trigger input must be an event');
    }

    const initialValue = (config?.initialValue as number) ?? 0;

    // Allocate persistent state slot with stable ID
    const stateSlot = ctx.b.allocStateSlot(
      stableStateId(ctx.instanceId, 'sample'),
      { initialValue }
    );

    // Read previous held value (Phase 1 — reads previous frame's state)
    const prevId = ctx.b.stateRead(stateSlot, canonicalType(FLOAT));

    // Read event scalar as float (0.0 or 1.0)
    const triggerSig = ctx.b.eventRead(triggerInput.id);

    // Conditional via lerp: lerp(prev, value, trigger)
    // trigger=0 → output=prev (hold), trigger=1 → output=value (sample)
    const lerpFn = ctx.b.opcode(OpCode.Lerp);
    const outputId = ctx.b.kernelZip(
      [prevId, valueInput.id as ValueExprId, triggerSig],
      lerpFn,
      canonicalType(FLOAT)
    );

    // Write output to state for next frame (Phase 2)
    ctx.b.stepStateWrite(stateSlot, outputId);

    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { id: outputId, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
