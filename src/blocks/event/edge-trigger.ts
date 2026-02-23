/**
 * EdgeTrigger Block
 *
 * Converts a value-threshold crossing into rising/falling events.
 */

import { registerBlock } from '../registry';
import { defaultSourceConst } from '../../types';
import { canonicalType, canonicalEvent, payloadStride, floatConst, requireInst, FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';

export function register(): void {
  registerBlock({
    type: 'EdgeTrigger',
    label: 'Edge Trigger',
    category: 'event',
    description: 'Emit events on rising/falling threshold crossings',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      value: { label: 'Value', type: canonicalType(FLOAT) },
      threshold: {
        label: 'Threshold',
        type: canonicalType(FLOAT),
        defaultValue: 0.5,
        defaultSource: defaultSourceConst(0.5),
        exposedAsPort: true,
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
      },
    },
    outputs: {
      rising: { label: 'Rising', type: canonicalEvent() },
      falling: { label: 'Falling', type: canonicalEvent() },
      both: { label: 'Both', type: canonicalEvent() },
    },
    lower: ({ ctx, inputsById }) => {
      const value = inputsById.value;
      const threshold = inputsById.threshold;
      if (!value || !threshold || !('type' in value) || requireInst(value.type.extent.temporality, 'temporality').kind !== 'continuous') {
        throw new Error('EdgeTrigger requires continuous value and threshold inputs');
      }
  
      const add = ctx.b.opcode(OpCode.Add);
      const sub = ctx.b.opcode(OpCode.Sub);
      const scalarType = { ...value.type, payload: FLOAT };
  
      const half = ctx.b.constant(floatConst(0.5), canonicalType(FLOAT));
  
      // Rising when (value - threshold + 0.5) crosses above 0.5
      const risingLevel = ctx.b.zipAuto([
        ctx.b.zipAuto([value.id, threshold.id], sub, scalarType),
        half,
      ], add, scalarType);
      const rising = ctx.b.eventWrap(risingLevel);
  
      // Falling when (threshold - value + 0.5) crosses above 0.5
      const fallingLevel = ctx.b.zipAuto([
        ctx.b.zipAuto([threshold.id, value.id], sub, scalarType),
        half,
      ], add, scalarType);
      const falling = ctx.b.eventWrap(fallingLevel);
  
      const both = ctx.b.eventCombine([rising, falling], 'any');
  
      const risingType = ctx.outTypes[0];
      const fallingType = ctx.outTypes[1];
      const bothType = ctx.outTypes[2];
  
      return {
        outputsById: {
          rising: { id: rising, slot: undefined, type: risingType, stride: payloadStride(risingType.payload), eventSlot: undefined },
          falling: { id: falling, slot: undefined, type: fallingType, stride: payloadStride(fallingType.payload), eventSlot: undefined },
          both: { id: both, slot: undefined, type: bothType, stride: payloadStride(bothType.payload), eventSlot: undefined },
        },
        effects: {
          slotRequests: [
            { portId: 'rising', type: risingType },
            { portId: 'falling', type: fallingType },
            { portId: 'both', type: bothType },
          ],
        },
      };
    },
  });
}
