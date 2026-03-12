/**
 * ShapeRadialPulse2D Block
 *
 * Scales control points radially with a sinusoidal envelope per control-point index.
 * Great for breathing, heartbeat, and rhythmic bloom effects.
 */

import { registerBlock } from '../registry';
import {
  canonicalMany,
  canonicalManyDef,
  canonicalType,
  floatConst,
  payloadStride,
  withInstance,
} from '../../core/canonical-types';
import { FLOAT, VEC2 } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { defaultSourceConst } from '../../types';
import { resolveManyFieldInstance } from './_instance-helpers';

export function register(): void {
  registerBlock({
    type: 'ShapeRadialPulse2D',
    label: 'Shape Radial Pulse 2D',
    category: 'shape',
    description: 'Pulse control points radially with indexed sinusoidal scaling',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      controlPoints: {
        label: 'Control Points',
        type: canonicalManyDef(VEC2, { kind: 'none' }),
      },
      phase: {
        label: 'Phase',
        type: canonicalType(FLOAT),
        defaultValue: 0,
        defaultSource: defaultSourceConst(0),
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
      },
      amount: {
        label: 'Amount',
        type: canonicalType(FLOAT),
        defaultValue: 0.25,
        defaultSource: defaultSourceConst(0.25),
        uiHint: { kind: 'slider', min: 0, max: 1.2, step: 0.01 },
      },
      frequency: {
        label: 'Frequency',
        type: canonicalType(FLOAT),
        defaultValue: 4,
        defaultSource: defaultSourceConst(4),
        uiHint: { kind: 'slider', min: 0, max: 24, step: 0.1 },
      },
      mix: {
        label: 'Mix',
        type: canonicalType(FLOAT),
        defaultValue: 1,
        defaultSource: defaultSourceConst(1),
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
      },
    },
    outputs: {
      points: { label: 'Control Points', type: canonicalManyDef(VEC2, { kind: 'none' }) },
    },
    lower: ({ ctx, inputsById }) => {
      const controlPointsInput = inputsById.controlPoints;
      if (!controlPointsInput) {
        throw new Error('ShapeRadialPulse2D: controlPoints input not wired');
      }
      const phaseInput = inputsById.phase;
      if (!phaseInput) throw new Error('ShapeRadialPulse2D: phase input not wired — normalization bug');
      const amountInput = inputsById.amount;
      if (!amountInput) throw new Error('ShapeRadialPulse2D: amount input not wired — normalization bug');
      const frequencyInput = inputsById.frequency;
      if (!frequencyInput) throw new Error('ShapeRadialPulse2D: frequency input not wired — normalization bug');
      const mixInput = inputsById.mix;
      if (!mixInput) throw new Error('ShapeRadialPulse2D: mix input not wired — normalization bug');

      const { instanceId, ref } = resolveManyFieldInstance(
        ctx,
        controlPointsInput,
        'ShapeRadialPulse2D.controlPoints',
      );

      const outputType = withInstance(ctx.outTypes[0], ref);
      const floatFieldType = canonicalMany(FLOAT, { kind: 'none' }, ref);

      const add = ctx.b.opcode(OpCode.Add);
      const sub = ctx.b.opcode(OpCode.Sub);
      const mul = ctx.b.opcode(OpCode.Mul);
      const sin = ctx.b.opcode(OpCode.Sin);

      const normalizedIndex = ctx.b.intrinsic('normalizedIndex', floatFieldType);
      const twoPi = ctx.b.constant(floatConst(Math.PI * 2), canonicalType(FLOAT));
      const one = ctx.b.constant(floatConst(1), canonicalType(FLOAT));

      const turnsByPoint = ctx.b.zipAuto([normalizedIndex, frequencyInput.id], mul, floatFieldType);
      const turns = ctx.b.zipAuto([turnsByPoint, phaseInput.id], add, floatFieldType);
      const angle = ctx.b.zipAuto([turns, twoPi], mul, floatFieldType);
      const wave = ctx.b.mapAuto(angle, sin, floatFieldType);

      const pulseAmount = ctx.b.zipAuto([wave, amountInput.id], mul, floatFieldType);
      const rawScale = ctx.b.zipAuto([one, pulseAmount], add, floatFieldType);

      const scaleDelta = ctx.b.zipAuto([rawScale, one], sub, floatFieldType);
      const mixedDelta = ctx.b.zipAuto([scaleDelta, mixInput.id], mul, floatFieldType);
      const finalScale = ctx.b.zipAuto([one, mixedDelta], add, floatFieldType);

      const x = ctx.b.extract(controlPointsInput.id, 0, floatFieldType);
      const y = ctx.b.extract(controlPointsInput.id, 1, floatFieldType);
      const xOut = ctx.b.zipAuto([x, finalScale], mul, floatFieldType);
      const yOut = ctx.b.zipAuto([y, finalScale], mul, floatFieldType);
      const pulsed = ctx.b.constructAuto([xOut, yOut], outputType);

      return {
        outputsById: {
          points: {
            id: pulsed,
            slot: undefined,
            type: outputType,
            stride: payloadStride(outputType.payload),
          },
        },
        effects: {
          slotRequests: [{ portId: 'points', type: outputType }],
        },
        instanceContext: instanceId,
      };
    },
  });
}
