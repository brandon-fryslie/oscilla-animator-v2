/**
 * SampleHold Block
 *
 * Event-driven latch (spec §9.2.2).
 * Latches input value when event fires, holds until next fire.
 */

import { registerBlock } from '../registry';
import { canonicalType, canonicalEvent, payloadStride, requireInst, FLOAT } from '../../core/canonical-types';
import { inferType, unitVar } from '../../core/inference-types';
import { OpCode, stableStateId } from '../../compiler/ir/types';
import type { ValueExprId } from '../../compiler/ir/Indices';

registerBlock({
  type: 'SampleHold',
  label: 'Sample & Hold',
  category: 'event',
  description: 'Latches input value when event fires, holds until next fire',
  form: 'primitive',
  capability: 'state',
  loweringPurity: 'stateful',
  isStateful: true,
  cardinality: {
    cardinalityMode: 'signalOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  inputs: {
    value: { label: 'Value', type: inferType(FLOAT, unitVar('sh_U')) },
    trigger: { label: 'Trigger', type: canonicalEvent() },
    initialValue: { type: canonicalType(FLOAT), defaultValue: 0, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Held', type: inferType(FLOAT, unitVar('sh_U')) },
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

    // Symbolic state key
    const stateKey = stableStateId(ctx.instanceId, 'sample');

    // Read previous held value (Phase 1 — reads previous frame's state, symbolic key)
    const prevId = ctx.b.stateRead(stateKey, canonicalType(FLOAT));

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

    const outType = ctx.outTypes[0];

    // Return effects-as-data (no imperative calls)
    return {
      outputsById: {
        out: { id: outputId, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        stateDecls: [
          { key: stateKey, initialValue },
        ],
        stepRequests: [
          { kind: 'stateWrite' as const, stateKey, value: outputId },
        ],
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
    };
  },
});
