/**
 * Event Consumer Blocks
 *
 * Blocks that bridge the event→signal domain (spec §9.2).
 * Events are discrete boolean signals; these blocks explicitly convert
 * them to continuous signals for use in animation.
 */

import { registerBlock } from './registry';
import { canonicalType, canonicalEvent, strideOf } from '../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION } from '../core/canonical-types';
import { OpCode, stableStateId } from '../compiler/ir/types';
import type { SigExprId } from '../compiler/ir/Indices';

// =============================================================================
// EventToSignalMask - Event → Signal bridge (spec §9.2.1)
// =============================================================================

registerBlock({
  type: 'EventToSignalMask',
  label: 'Event → Signal',
  category: 'event',
  description: 'Outputs 1.0 on the tick an event fires, 0.0 otherwise',
  form: 'primitive',
  capability: 'pure',
  inputs: {
    event: { label: 'Event', type: canonicalEvent() },
  },
  outputs: {
    out: { label: 'Signal', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const eventInput = inputsById.event;
    if (!eventInput || eventInput.k !== 'event') {
      throw new Error('EventToSignalMask: event input must be an event');
    }

    // Read the event scalar as a float signal (0.0 or 1.0)
    const sigId = ctx.b.sigEventRead(eventInput.slot);
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});

// =============================================================================
// SampleHold - Event-driven latch (spec §9.2.2)
// =============================================================================

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

    if (!valueInput || valueInput.k !== 'sig') {
      throw new Error('SampleHold: value input must be a signal');
    }
    if (!triggerInput || triggerInput.k !== 'event') {
      throw new Error('SampleHold: trigger input must be an event');
    }

    const initialValue = (config?.initialValue as number) ?? 0;

    // Allocate persistent state slot with stable ID
    const stateSlot = ctx.b.allocStateSlot(
      stableStateId(ctx.instanceId, 'sample'),
      { initialValue }
    );

    // Read previous held value (Phase 1 — reads previous frame's state)
    const prevId = ctx.b.sigStateRead(stateSlot, canonicalType(FLOAT));

    // Read event scalar as float (0.0 or 1.0)
    const triggerSig = ctx.b.sigEventRead(triggerInput.slot);

    // Conditional via lerp: lerp(prev, value, trigger)
    // trigger=0 → output=prev (hold), trigger=1 → output=value (sample)
    const lerpFn = ctx.b.opcode(OpCode.Lerp);
    const outputId = ctx.b.sigZip(
      [prevId, valueInput.id as SigExprId, triggerSig],
      lerpFn,
      canonicalType(FLOAT)
    );

    // Write output to state for next frame (Phase 2)
    ctx.b.stepStateWrite(stateSlot, outputId);

    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: outputId, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});
