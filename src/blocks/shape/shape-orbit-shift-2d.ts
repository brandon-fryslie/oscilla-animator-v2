/**
 * ShapeOrbitShift2D Block
 *
 * Offsets control points along per-point orbital directions for swirling motion.
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
    type: 'ShapeOrbitShift2D',
    label: 'Shape Orbit Shift 2D',
    category: 'shape',
    description: 'Shift control points by per-point orbiting offsets',
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
      orbitTurns: {
        label: 'Orbit Turns',
        type: canonicalType(FLOAT),
        defaultValue: 3.2,
        defaultSource: defaultSourceConst(3.2),
        uiHint: { kind: 'slider', min: 0, max: 24, step: 0.1 },
      },
      radius: {
        label: 'Radius',
        type: canonicalType(FLOAT),
        defaultValue: 0.04,
        defaultSource: defaultSourceConst(0.04),
        uiHint: { kind: 'slider', min: 0, max: 0.2, step: 0.001 },
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
        throw new Error('ShapeOrbitShift2D: controlPoints input not wired');
      }
      const phaseInput = inputsById.phase;
      if (!phaseInput) throw new Error('ShapeOrbitShift2D: phase input not wired — normalization bug');
      const orbitTurnsInput = inputsById.orbitTurns;
      if (!orbitTurnsInput) throw new Error('ShapeOrbitShift2D: orbitTurns input not wired — normalization bug');
      const radiusInput = inputsById.radius;
      if (!radiusInput) throw new Error('ShapeOrbitShift2D: radius input not wired — normalization bug');
      const mixInput = inputsById.mix;
      if (!mixInput) throw new Error('ShapeOrbitShift2D: mix input not wired — normalization bug');

      const { instanceId, ref } = resolveManyFieldInstance(
        ctx,
        controlPointsInput,
        'ShapeOrbitShift2D.controlPoints',
      );

      // [LAW:one-source-of-truth] The output field instance is derived from the
      // resolved control-point instance instead of introducing parallel instance state.
      const outputType = withInstance(ctx.outTypes[0], ref);
      const floatFieldType = canonicalMany(FLOAT, { kind: 'none' }, ref);

      const add = ctx.b.opcode(OpCode.Add);
      const mul = ctx.b.opcode(OpCode.Mul);
      const sin = ctx.b.opcode(OpCode.Sin);
      const cos = ctx.b.opcode(OpCode.Cos);

      const normalizedIndex = ctx.b.intrinsic('normalizedIndex', floatFieldType);
      const twoPi = ctx.b.constant(floatConst(Math.PI * 2), canonicalType(FLOAT));

      const turnsByPoint = ctx.b.zipAuto([normalizedIndex, orbitTurnsInput.id], mul, floatFieldType);
      const turns = ctx.b.zipAuto([turnsByPoint, phaseInput.id], add, floatFieldType);
      const angle = ctx.b.zipAuto([turns, twoPi], mul, floatFieldType);

      const waveX = ctx.b.mapAuto(angle, cos, floatFieldType);
      const waveY = ctx.b.mapAuto(angle, sin, floatFieldType);
      const radiusMixed = ctx.b.zipAuto([radiusInput.id, mixInput.id], mul, floatFieldType);
      const deltaX = ctx.b.zipAuto([waveX, radiusMixed], mul, floatFieldType);
      const deltaY = ctx.b.zipAuto([waveY, radiusMixed], mul, floatFieldType);

      const x = ctx.b.extract(controlPointsInput.id, 0, floatFieldType);
      const y = ctx.b.extract(controlPointsInput.id, 1, floatFieldType);
      const xOut = ctx.b.zipAuto([x, deltaX], add, floatFieldType);
      const yOut = ctx.b.zipAuto([y, deltaY], add, floatFieldType);
      const shifted = ctx.b.constructAuto([xOut, yOut], outputType);

      return {
        outputsById: {
          points: {
            id: shifted,
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
