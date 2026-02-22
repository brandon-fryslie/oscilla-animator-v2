/**
 * PulseDivider Block
 *
 * Emits one event for every N trigger events.
 */

import { registerBlock } from '../registry';
import { defaultSourceConst } from '../../types';
import { canonicalType, canonicalEvent, payloadStride, floatConst, requireInst, FLOAT, INT } from '../../core/canonical-types';
import { OpCode, stableStateId } from '../../compiler/ir/types';

export function register(): void {
  registerBlock({
    type: 'PulseDivider',
    label: 'Pulse Divider',
    category: 'event',
    description: 'Emit one output pulse for every N input pulses',
    form: 'primitive',
    capability: 'state',
    loweringPurity: 'stateful',
    isStateful: true,
    inputs: {
      trigger: { label: 'Trigger', type: canonicalEvent() },
      divisor: {
        label: 'Divisor',
        type: canonicalType(INT),
        defaultValue: 2,
        defaultSource: defaultSourceConst(2),
        exposedAsPort: true,
        uiHint: { kind: 'slider', min: 1, max: 32, step: 1 },
      },
    },
    outputs: {
      out: { label: 'Out', type: canonicalEvent() },
    },
    lower: ({ ctx, inputsById }) => {
      const trigger = inputsById.trigger;
      const divisor = inputsById.divisor;
      if (!trigger || !divisor || !('type' in trigger) || requireInst(trigger.type.extent.temporality, 'temporality').kind !== 'discrete') {
        throw new Error('PulseDivider requires trigger event and divisor inputs');
      }
  
      const stateKey = stableStateId(ctx.instanceId, 'pulse_divider_count');
  
      const add = ctx.b.opcode(OpCode.Add);
      const mod = ctx.b.opcode(OpCode.Mod);
      const eq = ctx.b.opcode(OpCode.Eq);
      const mul = ctx.b.opcode(OpCode.Mul);
      const max = ctx.b.opcode(OpCode.Max);
      const i2f = ctx.b.opcode(OpCode.I32ToF64);
  
      const zero = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
      const one = ctx.b.constant(floatConst(1), canonicalType(FLOAT));
      const scalarType = { ...divisor.type, payload: FLOAT, unit: { kind: 'none' as const } };
  
      const prevCount = ctx.b.stateRead(stateKey, canonicalType(FLOAT));
      const triggerSig = ctx.b.eventRead(trigger.id);
      const nextCount = ctx.b.zipAuto([prevCount, triggerSig], add, scalarType);
  
      const divisorF = ctx.b.mapAuto(divisor.id, i2f, scalarType);
      const safeDivisor = ctx.b.zipAuto([divisorF, one], max, scalarType);
  
      const wrappedCount = ctx.b.zipAuto([nextCount, safeDivisor], mod, scalarType);
      const hit = ctx.b.zipAuto([wrappedCount, zero], eq, scalarType);
      const fireMask = ctx.b.zipAuto([triggerSig, hit], mul, scalarType);
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
            { kind: 'stateWrite' as const, stateKey, value: wrappedCount },
          ],
        },
      };
    },
  });
}
