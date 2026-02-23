/**
 * DefaultSourceEvent Block
 *
 * Discrete/event fallback source used by default-source policy when an
 * unconnected input port requires event temporality.
 */

import { registerBlock } from '../registry';
import { canonicalEvent, requireInst } from '../../core/canonical-types';

export function register(): void {
  registerBlock({
    type: 'DefaultSourceEvent',
    label: 'Default Event Source',
    category: 'event',
    description: 'Event fallback source that never fires',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {},
    outputs: {
      out: { label: 'Output', type: canonicalEvent() },
    },
    lower: ({ ctx }) => {
      const outType = ctx.outTypes[0];
      const temporality = requireInst(outType.extent.temporality, 'temporality');
      if (temporality.kind !== 'discrete') {
        throw new Error(`DefaultSourceEvent: expected discrete temporality, got ${temporality.kind}`);
      }
      if (outType.payload.kind !== 'bool' || outType.unit.kind !== 'none') {
        throw new Error(
          `DefaultSourceEvent: expected event bool+none type, got payload=${outType.payload.kind}, unit=${outType.unit.kind}`
        );
      }
  
      const neverId = ctx.b.eventNever();
      return {
        outputsById: {
          out: { id: neverId, slot: undefined, type: outType, stride: 0 },
        },
        effects: {
          slotRequests: [{ portId: 'out', type: outType }],
        },
      };
    },
  });
}
