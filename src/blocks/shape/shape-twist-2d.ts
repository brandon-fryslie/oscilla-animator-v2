/**
 * ShapeTwist2D Block
 *
 * Rotates each control point by a per-point phase offset to create
 * helical/twisted shape motion. Output stays in the same field instance.
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
    type: 'ShapeTwist2D',
    label: 'Shape Twist 2D',
    category: 'shape',
    description: 'Twist control points around origin with per-point phase offsets',
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
      twistTurns: {
        label: 'Twist Turns',
        type: canonicalType(FLOAT),
        defaultValue: 0.35,
        defaultSource: defaultSourceConst(0.35),
        uiHint: { kind: 'slider', min: -2, max: 2, step: 0.01 },
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
      if (
        !controlPointsInput
        || !('type' in controlPointsInput && requireInst(controlPointsInput.type.extent.cardinality, 'cardinality').kind === 'many')
      ) {
        throw new Error('ShapeTwist2D requires a controlPoints field input (cardinality many)');
      }
      const phaseInput = inputsById.phase;
      if (!phaseInput) throw new Error('ShapeTwist2D: phase input not wired — normalization bug');
      const twistTurnsInput = inputsById.twistTurns;
      if (!twistTurnsInput) throw new Error('ShapeTwist2D: twistTurns input not wired — normalization bug');
      const mixInput = inputsById.mix;
      if (!mixInput) throw new Error('ShapeTwist2D: mix input not wired — normalization bug');

      const { instanceId, ref } = resolveManyFieldInstance(
        ctx,
        controlPointsInput,
        'ShapeTwist2D.controlPoints',
      );

      const outputType = withInstance(ctx.outTypes[0], ref);
      const floatFieldType = canonicalMany(FLOAT, { kind: 'none' }, ref);

      const add = ctx.b.opcode(OpCode.Add);
      const sub = ctx.b.opcode(OpCode.Sub);
      const mul = ctx.b.opcode(OpCode.Mul);
      const sin = ctx.b.opcode(OpCode.Sin);
      const cos = ctx.b.opcode(OpCode.Cos);

      const normalizedIndex = ctx.b.intrinsic('normalizedIndex', floatFieldType);
      const twoPi = ctx.b.constant(floatConst(Math.PI * 2), canonicalType(FLOAT));
      const turnsByPoint = ctx.b.zipAuto([normalizedIndex, twistTurnsInput.id], mul, floatFieldType);
      const turns = ctx.b.zipAuto([turnsByPoint, phaseInput.id], add, floatFieldType);
      const angle = ctx.b.zipAuto([turns, twoPi], mul, floatFieldType);

      const sinAngle = ctx.b.mapAuto(angle, sin, floatFieldType);
      const cosAngle = ctx.b.mapAuto(angle, cos, floatFieldType);

      const x = ctx.b.extract(controlPointsInput.id, 0, floatFieldType);
      const y = ctx.b.extract(controlPointsInput.id, 1, floatFieldType);

      const xCos = ctx.b.zipAuto([x, cosAngle], mul, floatFieldType);
      const ySin = ctx.b.zipAuto([y, sinAngle], mul, floatFieldType);
      const xRot = ctx.b.zipAuto([xCos, ySin], sub, floatFieldType);

      const xSin = ctx.b.zipAuto([x, sinAngle], mul, floatFieldType);
      const yCos = ctx.b.zipAuto([y, cosAngle], mul, floatFieldType);
      const yRot = ctx.b.zipAuto([xSin, yCos], add, floatFieldType);

      const xDelta = ctx.b.zipAuto([xRot, x], sub, floatFieldType);
      const yDelta = ctx.b.zipAuto([yRot, y], sub, floatFieldType);
      const xDeltaMixed = ctx.b.zipAuto([xDelta, mixInput.id], mul, floatFieldType);
      const yDeltaMixed = ctx.b.zipAuto([yDelta, mixInput.id], mul, floatFieldType);

      const xOut = ctx.b.zipAuto([x, xDeltaMixed], add, floatFieldType);
      const yOut = ctx.b.zipAuto([y, yDeltaMixed], add, floatFieldType);
      const twisted = ctx.b.constructAuto([xOut, yOut], outputType);

      return {
        outputsById: {
          points: {
            id: twisted,
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
