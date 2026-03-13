/**
 * ShapeLissajous2D Block
 *
 * Offsets control points with independent X/Y sine waves over normalized index.
 * Produces lively knot-like motion for playful shape animation.
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
    type: 'ShapeLissajous2D',
    label: 'Shape Lissajous 2D',
    category: 'shape',
    description: 'Apply independent X/Y wave offsets over control-point index',
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
      amountX: {
        label: 'Amount X',
        type: canonicalType(FLOAT),
        defaultValue: 0.05,
        defaultSource: defaultSourceConst(0.05),
        uiHint: { kind: 'slider', min: 0, max: 0.3, step: 0.001 },
      },
      amountY: {
        label: 'Amount Y',
        type: canonicalType(FLOAT),
        defaultValue: 0.05,
        defaultSource: defaultSourceConst(0.05),
        uiHint: { kind: 'slider', min: 0, max: 0.3, step: 0.001 },
      },
      freqX: {
        label: 'Freq X',
        type: canonicalType(FLOAT),
        defaultValue: 3.5,
        defaultSource: defaultSourceConst(3.5),
        uiHint: { kind: 'slider', min: 0, max: 24, step: 0.1 },
      },
      freqY: {
        label: 'Freq Y',
        type: canonicalType(FLOAT),
        defaultValue: 5.25,
        defaultSource: defaultSourceConst(5.25),
        uiHint: { kind: 'slider', min: 0, max: 24, step: 0.1 },
      },
      phaseSkew: {
        label: 'Phase Skew',
        type: canonicalType(FLOAT),
        defaultValue: 1.35,
        defaultSource: defaultSourceConst(1.35),
        uiHint: { kind: 'slider', min: 0, max: 4, step: 0.01 },
      },
    },
    outputs: {
      points: { label: 'Control Points', type: canonicalManyDef(VEC2, { kind: 'none' }) },
    },
    lower: ({ ctx, inputsById }) => {
      const controlPointsInput = inputsById.controlPoints;
      if (!controlPointsInput) {
        throw new Error('ShapeLissajous2D: controlPoints input not wired');
      }
      const phaseInput = inputsById.phase;
      if (!phaseInput) throw new Error('ShapeLissajous2D: phase input not wired — normalization bug');
      const amountXInput = inputsById.amountX;
      if (!amountXInput) throw new Error('ShapeLissajous2D: amountX input not wired — normalization bug');
      const amountYInput = inputsById.amountY;
      if (!amountYInput) throw new Error('ShapeLissajous2D: amountY input not wired — normalization bug');
      const freqXInput = inputsById.freqX;
      if (!freqXInput) throw new Error('ShapeLissajous2D: freqX input not wired — normalization bug');
      const freqYInput = inputsById.freqY;
      if (!freqYInput) throw new Error('ShapeLissajous2D: freqY input not wired — normalization bug');
      const phaseSkewInput = inputsById.phaseSkew;
      if (!phaseSkewInput) throw new Error('ShapeLissajous2D: phaseSkew input not wired — normalization bug');

      const { instanceId, ref } = resolveManyFieldInstance(
        ctx,
        controlPointsInput,
        'ShapeLissajous2D.controlPoints',
      );

      const outputType = withInstance(ctx.outTypes[0], ref);
      const floatFieldType = canonicalMany(FLOAT, { kind: 'none' }, ref);

      const add = ctx.b.opcode(OpCode.Add);
      const mul = ctx.b.opcode(OpCode.Mul);
      const sin = ctx.b.opcode(OpCode.Sin);

      const normalizedIndex = ctx.b.intrinsic('normalizedIndex', floatFieldType);
      const twoPi = ctx.b.constant(floatConst(Math.PI * 2), canonicalType(FLOAT));

      const xTurnsByPoint = ctx.b.zipAuto([normalizedIndex, freqXInput.id], mul, floatFieldType);
      const xTurns = ctx.b.zipAuto([xTurnsByPoint, phaseInput.id], add, floatFieldType);
      const xAngle = ctx.b.zipAuto([xTurns, twoPi], mul, floatFieldType);
      const xWave = ctx.b.mapAuto(xAngle, sin, floatFieldType);
      const deltaX = ctx.b.zipAuto([xWave, amountXInput.id], mul, floatFieldType);

      const yTurnsByPoint = ctx.b.zipAuto([normalizedIndex, freqYInput.id], mul, floatFieldType);
      const yPhase = ctx.b.zipAuto([phaseInput.id, phaseSkewInput.id], mul, floatFieldType);
      const yTurns = ctx.b.zipAuto([yTurnsByPoint, yPhase], add, floatFieldType);
      const yAngle = ctx.b.zipAuto([yTurns, twoPi], mul, floatFieldType);
      const yWave = ctx.b.mapAuto(yAngle, sin, floatFieldType);
      const deltaY = ctx.b.zipAuto([yWave, amountYInput.id], mul, floatFieldType);

      const x = ctx.b.extract(controlPointsInput.id, 0, floatFieldType);
      const y = ctx.b.extract(controlPointsInput.id, 1, floatFieldType);
      const xOut = ctx.b.zipAuto([x, deltaX], add, floatFieldType);
      const yOut = ctx.b.zipAuto([y, deltaY], add, floatFieldType);
      const deformed = ctx.b.constructAuto([xOut, yOut], outputType);

      return {
        outputsById: {
          points: {
            id: deformed,
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
