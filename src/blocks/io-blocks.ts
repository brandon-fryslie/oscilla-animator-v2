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
import { OpCode } from '../compiler/ir/types';

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
      type: signalType('float'),
      value: 'mouse.x',
      exposedAsPort: false,
      uiHint: { kind: 'text' },
    },
  },
  outputs: {
    value: { label: 'Value', type: signalType('float') },
  },
  lower: ({ ctx, config }) => {
    const channel = (config?.channel as string) ?? 'mouse.x';
    const sig = ctx.b.sigExternal(channel, signalType('float'));
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
      type: signalType('float'),
      value: 'mouse.x',
      exposedAsPort: false,
      uiHint: { kind: 'text' },
    },
    threshold: {
      label: 'Threshold',
      type: signalType('float'),
      value: 0.5,
      exposedAsPort: false,
      uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
    },
  },
  outputs: {
    gate: { label: 'Gate', type: signalType('float') }, // 0 or 1
  },
  lower: ({ ctx, config }) => {
    const channel = (config?.channel as string) ?? 'mouse.x';
    const threshold = (config?.threshold as number) ?? 0.5;

    const inputSig = ctx.b.sigExternal(channel, signalType('float'));
    const thresholdSig = ctx.b.sigConst(threshold, signalType('float'));

    // gate = input >= threshold ? 1 : 0
    // We need >= but only have Gt (>), Lt (<), and Eq (==)
    // Implement: a >= b  <=>  NOT(b > a)  <=>  1 - (b > a)
    // Since Gt returns 0 or 1: if threshold > input, returns 1, then 1-1=0 (correct)
    //                          if threshold <= input, returns 0, then 1-0=1 (correct)
    const oneSig = ctx.b.sigConst(1, signalType('float'));
    const gtFn = ctx.b.opcode(OpCode.Gt);
    const subFn = ctx.b.opcode(OpCode.Sub);

    // thresholdGtInput = (threshold > input) ? 1 : 0
    const thresholdGtInput = ctx.b.sigZip([thresholdSig, inputSig], gtFn, signalType('float'));

    // gateSig = 1 - thresholdGtInput  =>  (input >= threshold) ? 1 : 0
    const gateSig = ctx.b.sigZip([oneSig, thresholdGtInput], subFn, signalType('float'));

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
      type: signalType('float'),
      value: 'mouse',
      exposedAsPort: false,
      uiHint: { kind: 'text' },
    },
  },
  outputs: {
    position: { label: 'Position', type: signalType('vec2') },
  },
  lower: ({ ctx, config }) => {
    const channelBase = (config?.channelBase as string) ?? 'mouse';

    const xSig = ctx.b.sigExternal(`${channelBase}.x`, signalType('float'));
    const ySig = ctx.b.sigExternal(`${channelBase}.y`, signalType('float'));

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
