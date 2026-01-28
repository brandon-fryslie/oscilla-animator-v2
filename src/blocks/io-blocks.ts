/**
 * IO Blocks
 *
 * Blocks for external input access (mouse, keyboard, sensors, etc.)
 * via the ExternalChannelSystem.
 *
 * Spec Reference: design-docs/external-input/02-External-Input-Spec.md Section 6
 */

import { registerBlock } from './registry';
import { signalType, strideOf } from '../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION } from '../core/canonical-types';
import { OpCode } from '../compiler/ir/types';
import { defaultSourceConst } from '../types';

// =============================================================================
// ExternalInput
// =============================================================================

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
      type: signalType(FLOAT),
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
    value: { label: 'Value', type: signalType(FLOAT) },
  },
  lower: ({ ctx, config }) => {
    const channel = (config?.channel as string) ?? 'mouse.x';
    const sig = ctx.b.sigExternal(channel, signalType(FLOAT));
    const slot = ctx.b.allocSlot();
    const outType = ctx.outTypes[0];

    return {
      outputsById: {
        value: { k: 'sig', id: sig, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});

// =============================================================================
// ExternalGate
// =============================================================================

registerBlock({
  type: 'ExternalGate',
  label: 'External Gate',
  category: 'io',
  description: 'Convert external channel to gate (0/1) via threshold comparison',
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
      type: signalType(FLOAT),
      value: 'mouse.x',
      exposedAsPort: false,
      uiHint: {
        kind: 'select',
        options: [
          { value: 'mouse.x', label: 'Mouse X' },
          { value: 'mouse.y', label: 'Mouse Y' },
          { value: 'mouse.over', label: 'Mouse Over Canvas' },
          { value: 'mouse.button.left.held', label: 'Left Button Held' },
          { value: 'mouse.button.right.held', label: 'Right Button Held' },
          { value: 'mouse.button.left.down', label: 'Left Button Down (pulse)' },
          { value: 'mouse.button.left.up', label: 'Left Button Up (pulse)' },
          { value: 'mouse.button.right.down', label: 'Right Button Down (pulse)' },
          { value: 'mouse.button.right.up', label: 'Right Button Up (pulse)' },
          { value: 'mouse.wheel.dx', label: 'Mouse Wheel Horizontal (delta)' },
          { value: 'mouse.wheel.dy', label: 'Mouse Wheel Vertical (delta)' },
        ],
      },
    },
    threshold: {
      label: 'Threshold',
      type: signalType(FLOAT),
      value: 0.5,
      defaultSource: defaultSourceConst(0.5),
      exposedAsPort: true,
      uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
    },
  },
  outputs: {
    gate: { label: 'Gate', type: signalType(FLOAT) }, // 0 or 1
  },
  lower: ({ ctx, config }) => {
    const channel = (config?.channel as string) ?? 'mouse.x';
    const threshold = (config?.threshold as number) ?? 0.5;

    const inputSig = ctx.b.sigExternal(channel, signalType(FLOAT));
    const thresholdSig = ctx.b.sigConst(threshold, signalType(FLOAT));

    // gate = input >= threshold ? 1 : 0
    // We need >= but only have Gt (>), Lt (<), and Eq (==)
    // Implement: a >= b  <=>  NOT(b > a)  <=>  1 - (b > a)
    // Since Gt returns 0 or 1: if threshold > input, returns 1, then 1-1=0 (correct)
    //                          if threshold <= input, returns 0, then 1-0=1 (correct)
    const oneSig = ctx.b.sigConst(1, signalType(FLOAT));
    const gtFn = ctx.b.opcode(OpCode.Gt);
    const subFn = ctx.b.opcode(OpCode.Sub);

    // thresholdGtInput = (threshold > input) ? 1 : 0
    const thresholdGtInput = ctx.b.sigZip([thresholdSig, inputSig], gtFn, signalType(FLOAT));

    // gateSig = 1 - thresholdGtInput  =>  (input >= threshold) ? 1 : 0
    const gateSig = ctx.b.sigZip([oneSig, thresholdGtInput], subFn, signalType(FLOAT));

    const slot = ctx.b.allocSlot();
    const outType = ctx.outTypes[0];

    return {
      outputsById: {
        gate: { k: 'sig', id: gateSig, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});

// =============================================================================
// ExternalVec2
// =============================================================================

registerBlock({
  type: 'ExternalVec2',
  label: 'External Vec2',
  category: 'io',
  description: 'Read external channels as vec2 (channelBase.x, channelBase.y)',
  form: 'primitive',
  capability: 'io',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    channelBase: {
      label: 'Channel Base',
      type: signalType(FLOAT),
      value: 'mouse',
      exposedAsPort: false,
      uiHint: {
        kind: 'select',
        options: [
          { value: 'mouse', label: 'Mouse Position' },
          { value: 'mouse.wheel', label: 'Mouse Wheel Delta' },
        ],
      },
    },
  },
  outputs: {
    position: { label: 'Position', type: signalType(VEC2) },
  },
  lower: ({ ctx, config }) => {
    const channelBase = (config?.channelBase as string) ?? 'mouse';

    const xSig = ctx.b.sigExternal(`${channelBase}.x`, signalType(FLOAT));
    const ySig = ctx.b.sigExternal(`${channelBase}.y`, signalType(FLOAT));

    // Pack x and y into vec2 using strided slot write
    const outType = ctx.outTypes[0];
    const stride = strideOf(outType.payload); // vec2 has stride 2
    const slot = ctx.b.allocSlot(stride);
    const components = [xSig, ySig];

    // Emit step to write components to strided slot
    ctx.b.stepSlotWriteStrided(slot, components);

    return {
      outputsById: {
        position: { k: 'sig', id: xSig, slot, type: outType, stride, components },
      },
    };
  },
});
