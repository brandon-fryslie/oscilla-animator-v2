/**
 * ShapeSquishWave2D Block
 *
 * Applies opposing X/Y scaling waves per control-point index to create
 * squash-stretch style motion while preserving topology.
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
    type: 'ShapeSquishWave2D',
    label: 'Shape Squish Wave 2D',
    category: 'shape',
    description: 'Apply opposing X/Y index waves for squash-stretch deformation',
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
        defaultValue: 0.4,
        defaultSource: defaultSourceConst(0.4),
        uiHint: { kind: 'slider', min: 0, max: 1.2, step: 0.01 },
      },
      frequency: {
        label: 'Frequency',
        type: canonicalType(FLOAT),
        defaultValue: 5.4,
        defaultSource: defaultSourceConst(5.4),
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
        throw new Error('ShapeSquishWave2D: controlPoints input not wired');
      }
      const phaseInput = inputsById.phase;
      if (!phaseInput) throw new Error('ShapeSquishWave2D: phase input not wired — normalization bug');
      const amountInput = inputsById.amount;
      if (!amountInput) throw new Error('ShapeSquishWave2D: amount input not wired — normalization bug');
      const frequencyInput = inputsById.frequency;
      if (!frequencyInput) throw new Error('ShapeSquishWave2D: frequency input not wired — normalization bug');
      const mixInput = inputsById.mix;
      if (!mixInput) throw new Error('ShapeSquishWave2D: mix input not wired — normalization bug');

      const { instanceId, ref } = resolveManyFieldInstance(
        ctx,
        controlPointsInput,
        'ShapeSquishWave2D.controlPoints',
      );

      // [LAW:one-source-of-truth] The output field instance is derived from the
      // resolved control-point instance instead of introducing parallel instance state.
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

      const signedAmount = ctx.b.zipAuto([wave, amountInput.id], mul, floatFieldType);
      const scaleXRaw = ctx.b.zipAuto([one, signedAmount], add, floatFieldType);
      const scaleYRaw = ctx.b.zipAuto([one, signedAmount], sub, floatFieldType);

      const scaleXDelta = ctx.b.zipAuto([scaleXRaw, one], sub, floatFieldType);
      const scaleYDelta = ctx.b.zipAuto([scaleYRaw, one], sub, floatFieldType);
      const scaleXDeltaMixed = ctx.b.zipAuto([scaleXDelta, mixInput.id], mul, floatFieldType);
      const scaleYDeltaMixed = ctx.b.zipAuto([scaleYDelta, mixInput.id], mul, floatFieldType);
      const scaleX = ctx.b.zipAuto([one, scaleXDeltaMixed], add, floatFieldType);
      const scaleY = ctx.b.zipAuto([one, scaleYDeltaMixed], add, floatFieldType);

      const x = ctx.b.extract(controlPointsInput.id, 0, floatFieldType);
      const y = ctx.b.extract(controlPointsInput.id, 1, floatFieldType);
      const xOut = ctx.b.zipAuto([x, scaleX], mul, floatFieldType);
      const yOut = ctx.b.zipAuto([y, scaleY], mul, floatFieldType);
      const squished = ctx.b.constructAuto([xOut, yOut], outputType);

      return {
        outputsById: {
          points: {
            id: squished,
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
