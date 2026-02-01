/**
 * ExternalInput Block
 *
 * Read a named external channel as a float signal.
 */

import { registerBlock } from '../registry';
import { canonicalType, strideOf, floatConst, intConst, FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { defaultSourceConst } from '../../types';

registerBlock({
  type: 'ExternalInput',
  label: 'External Input',
  category: 'io',
  description: 'Read a named external channel as a float signal',
  form: 'primitive',
  capability: 'io',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    channel: {
      label: 'Channel',
      type: canonicalType(FLOAT),
      value: 'mouse.x',
      exposedAsPort: false,
      uiHint: {
        kind: 'select',
        options: [
          // Value channels (sample-and-hold)
          { value: 'mouse.x', label: 'Mouse X' },
          { value: 'mouse.y', label: 'Mouse Y' },
          { value: 'mouse.over', label: 'Mouse Over Canvas' },
          { value: 'mouse.button.left.held', label: 'Left Button Held' },
          { value: 'mouse.button.right.held', label: 'Right Button Held' },
          // Pulse channels (1 for one frame, then 0)
          { value: 'mouse.button.left.down', label: 'Left Button Down (pulse)' },
          { value: 'mouse.button.left.up', label: 'Left Button Up (pulse)' },
          { value: 'mouse.button.right.down', label: 'Right Button Down (pulse)' },
          { value: 'mouse.button.right.up', label: 'Right Button Up (pulse)' },
          // Accumulator channels (sums deltas, clears each frame)
          { value: 'mouse.wheel.dx', label: 'Mouse Wheel Horizontal (delta)' },
          { value: 'mouse.wheel.dy', label: 'Mouse Wheel Vertical (delta)' },
        ],
      },
    },
  },
  outputs: {
    value: { label: 'Value', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, config }) => {
    const channel = (config?.channel as string) ?? 'mouse.x';
    const sig = ctx.b.external(channel, canonicalType(FLOAT));
    const slot = ctx.b.allocSlot();
    const outType = ctx.outTypes[0];

    return {
      outputsById: {
        value: { id: sig, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});
