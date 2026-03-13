/**
 * ShapePolarRipple2D Block
 *
 * Pushes control points along their radial direction using a sinusoidal wave
 * over point index and radius. Good for flower-like and breathing patterns.
 */

import { registerBlock } from '../registry';
import {
  canonicalMany,
  canonicalManyDef,
  canonicalType,
  floatConst,
  payloadStride,
  requireInst,
  withInstance,
} from '../../core/canonical-types';
import { FLOAT, VEC2 } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { defaultSourceConst } from '../../types';
import { resolveManyFieldInstance } from './_instance-helpers';

export function register(): void {
  registerBlock({
    type: 'ShapePolarRipple2D',
    label: 'Shape Polar Ripple 2D',
    category: 'shape',
    description: 'Apply radial ripples to control points in polar space',
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
        defaultValue: 0.05,
        defaultSource: defaultSourceConst(0.05),
        uiHint: { kind: 'slider', min: 0, max: 0.4, step: 0.001 },
      },
      pointFrequency: {
        label: 'Point Frequency',
        type: canonicalType(FLOAT),
        defaultValue: 4,
        defaultSource: defaultSourceConst(4),
        uiHint: { kind: 'slider', min: 0, max: 24, step: 0.1 },
      },
      radialFrequency: {
        label: 'Radial Frequency',
        type: canonicalType(FLOAT),
        defaultValue: 2.5,
        defaultSource: defaultSourceConst(2.5),
        uiHint: { kind: 'slider', min: 0, max: 24, step: 0.1 },
      },
    },
    outputs: {
      points: { label: 'Control Points', type: canonicalManyDef(VEC2, { kind: 'none' }) },
    },
    lower: ({ ctx, inputsById }) => {
      const controlPointsInput = inputsById.controlPoints;
      if (
        !controlPointsInput
        || !('type' in controlPointsInput && requireInst(controlPointsInput.type.extent.cardinality, 'cardinality').kind === 'many')
      ) {
        throw new Error('ShapePolarRipple2D requires a controlPoints field input (cardinality many)');
      }
      const phaseInput = inputsById.phase;
      if (!phaseInput) throw new Error('ShapePolarRipple2D: phase input not wired — normalization bug');
      const amountInput = inputsById.amount;
      if (!amountInput) throw new Error('ShapePolarRipple2D: amount input not wired — normalization bug');
      const pointFrequencyInput = inputsById.pointFrequency;
      if (!pointFrequencyInput) throw new Error('ShapePolarRipple2D: pointFrequency input not wired — normalization bug');
      const radialFrequencyInput = inputsById.radialFrequency;
      if (!radialFrequencyInput) throw new Error('ShapePolarRipple2D: radialFrequency input not wired — normalization bug');

      const { instanceId, ref } = resolveManyFieldInstance(
        ctx,
        controlPointsInput,
        'ShapePolarRipple2D.controlPoints',
      );

      const outputType = withInstance(ctx.outTypes[0], ref);
      const floatFieldType = canonicalMany(FLOAT, { kind: 'none' }, ref);

      const add = ctx.b.opcode(OpCode.Add);
      const mul = ctx.b.opcode(OpCode.Mul);
      const div = ctx.b.opcode(OpCode.Div);
      const max = ctx.b.opcode(OpCode.Max);
      const sqrt = ctx.b.opcode(OpCode.Sqrt);
      const sin = ctx.b.opcode(OpCode.Sin);

      const x = ctx.b.extract(controlPointsInput.id, 0, floatFieldType);
      const y = ctx.b.extract(controlPointsInput.id, 1, floatFieldType);
      const normalizedIndex = ctx.b.intrinsic('normalizedIndex', floatFieldType);

      const x2 = ctx.b.zipAuto([x, x], mul, floatFieldType);
      const y2 = ctx.b.zipAuto([y, y], mul, floatFieldType);
      const radiusSq = ctx.b.zipAuto([x2, y2], add, floatFieldType);
      const radius = ctx.b.mapAuto(radiusSq, sqrt, floatFieldType);

      const epsilon = ctx.b.constant(floatConst(1e-5), canonicalType(FLOAT));
      const safeRadius = ctx.b.zipAuto([radius, epsilon], max, floatFieldType);
      const dirX = ctx.b.zipAuto([x, safeRadius], div, floatFieldType);
      const dirY = ctx.b.zipAuto([y, safeRadius], div, floatFieldType);

      const pointTurns = ctx.b.zipAuto([normalizedIndex, pointFrequencyInput.id], mul, floatFieldType);
      const radialTurns = ctx.b.zipAuto([radius, radialFrequencyInput.id], mul, floatFieldType);
      const waveTurnsBase = ctx.b.zipAuto([pointTurns, radialTurns], add, floatFieldType);
      const waveTurns = ctx.b.zipAuto([waveTurnsBase, phaseInput.id], add, floatFieldType);

      const twoPi = ctx.b.constant(floatConst(Math.PI * 2), canonicalType(FLOAT));
      const waveAngle = ctx.b.zipAuto([waveTurns, twoPi], mul, floatFieldType);
      const wave = ctx.b.mapAuto(waveAngle, sin, floatFieldType);
      const displacement = ctx.b.zipAuto([wave, amountInput.id], mul, floatFieldType);

      const dx = ctx.b.zipAuto([dirX, displacement], mul, floatFieldType);
      const dy = ctx.b.zipAuto([dirY, displacement], mul, floatFieldType);
      const xOut = ctx.b.zipAuto([x, dx], add, floatFieldType);
      const yOut = ctx.b.zipAuto([y, dy], add, floatFieldType);
      const rippled = ctx.b.constructAuto([xOut, yOut], outputType);

      return {
        outputsById: {
          points: {
            id: rippled,
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
