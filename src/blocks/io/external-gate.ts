/**
 * ExternalGate Block
 *
 * Convert external channel to gate (0/1) via threshold comparison.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst, FLOAT } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { defaultSourceConst } from '../../types';

registerBlock({
  type: 'ExternalGate',
  label: 'External Gate',
  category: 'io',
  description: 'Convert external channel to gate (0/1) via threshold comparison',
  form: 'primitive',
  capability: 'io',
  loweringPurity: 'impure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    channel: {
      label: 'Channel',
      type: canonicalType(FLOAT),
      defaultValue: 'mouse.x',
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
      type: canonicalType(FLOAT),
      defaultValue: 0.5,
      defaultSource: defaultSourceConst(0.5),
      exposedAsPort: false,
      uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
    },
  },
  outputs: {
    gate: { label: 'Gate', type: canonicalType(FLOAT) }, // 0 or 1
  },
  lower: ({ ctx, config }) => {
    const channel = (config?.channel as string) ?? 'mouse.x';
    const threshold = (config?.threshold as number) ?? 0.5;

    const inputSig = ctx.b.external(channel, canonicalType(FLOAT));
    const thresholdSig = ctx.b.constant(floatConst(threshold), canonicalType(FLOAT));

    // gate = input >= threshold ? 1 : 0
    // Implement: a >= b  <=>  NOT(b > a)  <=>  1 - (b > a)
    const oneSig = ctx.b.constant(floatConst(1), canonicalType(FLOAT));
    const gtFn = ctx.b.opcode(OpCode.Gt);
    const subFn = ctx.b.opcode(OpCode.Sub);

    const thresholdGtInput = ctx.b.kernelZip([thresholdSig, inputSig], gtFn, canonicalType(FLOAT));
    const gateSig = ctx.b.kernelZip([oneSig, thresholdGtInput], subFn, canonicalType(FLOAT));

    const outType = ctx.outTypes[0];

    return {
      outputsById: {
        gate: { id: gateSig, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'gate', type: outType },
        ],
      },
    };
  },
});
