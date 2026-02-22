/**
 * EventToOneMask Block
 *
 * Event → One bridge (spec §9.2.1).
 * Outputs 1.0 on the tick an event fires, 0.0 otherwise.
 */

import { registerBlock } from '../registry';
import { canonicalType, canonicalEvent, payloadStride, requireInst, FLOAT } from '../../core/canonical-types';

export function register(): void {
  registerBlock({
    type: 'EventToOneMask',
    label: 'Event → One',
    category: 'event',
    description: 'Outputs 1.0 on the tick an event fires, 0.0 otherwise',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      event: { label: 'Event', type: canonicalEvent() },
    },
    outputs: {
      out: { label: 'One', type: canonicalType(FLOAT) },
    },
    lower: ({ ctx, inputsById }) => {
      const eventInput = inputsById.event;
      if (!eventInput || !('type' in eventInput) || requireInst(eventInput.type.extent.temporality, 'temporality').kind !== 'discrete') {
        throw new Error('EventToOneMask: event input must be an event');
      }
  
      // Read the event scalar as a float one-cardinality value (0.0 or 1.0)
      const sigId = ctx.b.eventRead(eventInput.id);
      const outType = ctx.outTypes[0];
  
      return {
        outputsById: {
          out: { id: sigId, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
        },
        effects: {
          slotRequests: [
            { portId: 'out', type: outType },
          ],
        },
      };
    },
  });
}
