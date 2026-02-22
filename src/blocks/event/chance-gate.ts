/**
 * ChanceGate Block
 *
 * Probabilistically passes trigger events.
 */

import { registerBlock } from '../registry';
import { defaultSourceConst } from '../../types';
import { canonicalType, canonicalEvent, payloadStride, floatConst, contractClamp01, requireInst, FLOAT } from '../../core/canonical-types';
import { OpCode, stableStateId } from '../../compiler/ir/types';

export function register(): void {
  registerBlock({
    type: 'ChanceGate',
    label: 'Chance Gate',
    category: 'event',
    description: 'Pass trigger events with probability p',
    form: 'primitive',
    capability: 'state',
    loweringPurity: 'stateful',
    isStateful: true,
    inputs: {
      trigger: { label: 'Trigger', type: canonicalEvent() },
      probability: {
        label: 'Probability',
        type: canonicalType(FLOAT, undefined, undefined, contractClamp01()),
        defaultValue: 0.5,
        defaultSource: defaultSourceConst(0.5),
        exposedAsPort: true,
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
      },
      seed: {
        label: 'Seed',
        type: canonicalType(FLOAT),
        defaultValue: 0,
        defaultSource: defaultSourceConst(0),
        exposedAsPort: true,
      },
    },
    outputs: {
      out: { label: 'Out', type: canonicalEvent() },
    },
    lower: ({ ctx, inputsById }) => {
      const trigger = inputsById.trigger;
      const probability = inputsById.probability;
      const seed = inputsById.seed;
      if (!trigger || !probability || !seed || !('type' in trigger) || requireInst(trigger.type.extent.temporality, 'temporality').kind !== 'discrete') {
        throw new Error('ChanceGate requires trigger event, probability, and seed inputs');
      }
  
      const stateKey = stableStateId(ctx.instanceId, 'chance_gate_count');
  
      const add = ctx.b.opcode(OpCode.Add);
      const mul = ctx.b.opcode(OpCode.Mul);
      const lt = ctx.b.opcode(OpCode.Lt);
      const hash = ctx.b.opcode(OpCode.Hash);
  
      const prevCount = ctx.b.stateRead(stateKey, canonicalType(FLOAT));
      const triggerSig = ctx.b.eventRead(trigger.id);
      const scalarType = { ...probability.type, payload: FLOAT, unit: { kind: 'none' as const } };
      const nextCount = ctx.b.zipAuto([prevCount, triggerSig], add, scalarType);
  
      const rnd = ctx.b.zipAuto([nextCount, seed.id], hash, scalarType);
      const pass = ctx.b.zipAuto([rnd, probability.id], lt, scalarType);
      const fireMask = ctx.b.zipAuto([triggerSig, pass], mul, scalarType);
      const outEvent = ctx.b.eventWrap(fireMask);
  
      const outType = ctx.outTypes[0];
  
      return {
        outputsById: {
          out: { id: outEvent, slot: undefined, type: outType, stride: payloadStride(outType.payload), eventSlot: undefined },
        },
        effects: {
          stateDecls: [
            { key: stateKey, initialValue: 0 },
          ],
          stepRequests: [
            { kind: 'stateWrite' as const, stateKey, value: nextCount },
          ],
        },
      };
    },
  });
}
