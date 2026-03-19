/**
 * ShapeWobble2D Block
 *
 * Deforms a control-point field by applying a phase-animated sinusoidal offset.
 * This keeps geometry editable as first-class field data before assembly.
 */

import { registerBlock } from '../registry';
import {
  canonicalType,
  canonicalMany,
  canonicalManyDef,
  payloadStride,
  floatConst,
  instanceRef,
  withInstance,
  requireInst,
} from '../../core/canonical-types';
import { FLOAT, VEC2 } from '../../core/canonical-types';
import { OpCode } from '../../compiler/ir/types';
import { defaultSourceConst } from '../../types';

export function register(): void {
  registerBlock({
    type: 'ShapeWobble2D',
    label: 'Shape Wobble 2D',
    category: 'shape',
    description: 'Applies phase-animated wobble to Field<vec2> control points',
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
        defaultValue: 0.005,
        defaultSource: defaultSourceConst(0.005),
        uiHint: { kind: 'slider', min: 0, max: 0.02, step: 0.0005 },
      },
      frequency: {
        label: 'Frequency',
        type: canonicalType(FLOAT),
        defaultValue: 3,
        defaultSource: defaultSourceConst(3),
        uiHint: { kind: 'slider', min: 0, max: 12, step: 0.25 },
      },
    },
    outputs: {
      points: { label: 'Control Points', type: canonicalManyDef(VEC2, { kind: 'none' }) },
    },
    lower: ({ ctx, inputsById }) => {
      const controlPointsInput = inputsById.controlPoints;
      if (
        !controlPointsInput ||
        !('type' in controlPointsInput && requireInst(controlPointsInput.type.extent.cardinality, 'cardinality').kind === 'many')
      ) {
        throw new Error('ShapeWobble2D requires a controlPoints field input (cardinality many)');
      }
  
      const phaseInput = inputsById.phase;
      if (!phaseInput) throw new Error('ShapeWobble2D: phase input not wired — normalization bug');
      const amountInput = inputsById.amount;
      if (!amountInput) throw new Error('ShapeWobble2D: amount input not wired — normalization bug');
      const frequencyInput = inputsById.frequency;
      if (!frequencyInput) throw new Error('ShapeWobble2D: frequency input not wired — normalization bug');
  
      const instanceId = ctx.inferredInstance !== undefined ? ctx.inferredInstance : ctx.instance;
      if (!instanceId) {
        throw new Error('ShapeWobble2D requires instance context from controlPoints input');
      }
  
      const instanceDecl = ctx.instances.get(instanceId);
      if (!instanceDecl) {
        throw new Error(`ShapeWobble2D: instance '${instanceId}' not found in instance registry`);
      }
  
      // [LAW:one-source-of-truth] Output field instance is derived from the input field instance.
      const ref = instanceRef(instanceDecl.domainType as string, instanceId as string);
      const outputType = withInstance(ctx.outTypes[0], ref);
      const floatFieldType = canonicalMany(FLOAT, { kind: 'none' }, ref);
  
      const add = ctx.b.opcode(OpCode.Add);
      const mul = ctx.b.opcode(OpCode.Mul);
      const sin = ctx.b.opcode(OpCode.Sin);
      const cos = ctx.b.opcode(OpCode.Cos);
  
      const normIndex = ctx.b.intrinsic('normalizedIndex', floatFieldType);
      const twoPi = ctx.b.constant(floatConst(Math.PI * 2), canonicalType(FLOAT));
  
      const wobbleTurns = ctx.b.zipAuto([normIndex, frequencyInput.id], mul, floatFieldType);
      const wobblePhase = ctx.b.zipAuto([wobbleTurns, phaseInput.id], add, floatFieldType);
      const wobbleAngle = ctx.b.zipAuto([wobblePhase, twoPi], mul, floatFieldType);
  
      const wobbleX = ctx.b.mapAuto(wobbleAngle, sin, floatFieldType);
      const wobbleY = ctx.b.mapAuto(wobbleAngle, cos, floatFieldType);
      const deltaX = ctx.b.zipAuto([wobbleX, amountInput.id], mul, floatFieldType);
      const deltaY = ctx.b.zipAuto([wobbleY, amountInput.id], mul, floatFieldType);
  
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
