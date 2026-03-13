/**
 * ParametricCurve2D Block
 *
 * Type 2 shape assembler:
 * - Input: Field<vec2> control points (expects 4 lanes: cubic bezier P0..P3)
 * - Output: One<shape> with cubic topology + runtime param args
 */

import { registerBlock } from '../registry';
import { canonicalType, canonicalManyDef, payloadStride, requireInst } from '../../core/canonical-types';
import { VEC2, SHAPE, FLOAT, INT } from '../../core/canonical-types';
import { defaultSourceConst } from '../../types';
import {
  PARAMETRIC_CUBIC_CONTROL_POINT_COUNT,
  PARAMETRIC_RESOLUTION_DEFAULT,
  PARAMETRIC_RESOLUTION_MIN,
  PARAMETRIC_RESOLUTION_UI_MAX,
  PARAMETRIC_RESOLUTION_UI_STEP,
  PARAMETRIC_THICKNESS_DEFAULT,
  PARAMETRIC_THICKNESS_UI_MAX,
  PARAMETRIC_THICKNESS_UI_MIN,
  PARAMETRIC_THICKNESS_UI_STEP,
} from '../../shapes/parametric-contract';
import { createParametricCubicPathTopology } from './_topology-helpers';
import { resolveManyFieldInstance } from './_instance-helpers';

export function register(): void {
  registerBlock({
    type: 'ParametricCurve2D',
    label: 'Parametric Curve 2D',
    category: 'shape',
    description: 'Assemble 4 control points into a Type 2 cubic parametric curve',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      controlPoints: {
        label: 'Control Points',
        type: canonicalManyDef(VEC2, { kind: 'none' }),
      },
      resolution: {
        label: 'Resolution',
        type: canonicalType(INT),
        defaultValue: PARAMETRIC_RESOLUTION_DEFAULT,
        defaultSource: defaultSourceConst(PARAMETRIC_RESOLUTION_DEFAULT),
        exposedAsPort: true,
        uiHint: {
          kind: 'slider',
          min: PARAMETRIC_RESOLUTION_MIN,
          max: PARAMETRIC_RESOLUTION_UI_MAX,
          step: PARAMETRIC_RESOLUTION_UI_STEP,
        },
      },
      thickness: {
        label: 'Thickness',
        type: canonicalType(FLOAT),
        defaultValue: PARAMETRIC_THICKNESS_DEFAULT,
        defaultSource: defaultSourceConst(PARAMETRIC_THICKNESS_DEFAULT),
        exposedAsPort: true,
        uiHint: {
          kind: 'slider',
          min: PARAMETRIC_THICKNESS_UI_MIN,
          max: PARAMETRIC_THICKNESS_UI_MAX,
          step: PARAMETRIC_THICKNESS_UI_STEP,
        },
      },
    },
    outputs: {
      shape: { label: 'Shape', type: canonicalType(SHAPE) },
    },
    lower: ({ ctx, inputsById }) => {
      const controlPointsInput = inputsById.controlPoints;
      if (!controlPointsInput) {
        throw new Error('ParametricCurve2D: controlPoints input not wired');
      }
      const card = requireInst(controlPointsInput.type.extent.cardinality, 'cardinality');
      if (card.kind !== 'many') {
        throw new Error('ParametricCurve2D: controlPoints must be a field (many cardinality)');
      }

      const { instanceId: instance, instanceDecl } = resolveManyFieldInstance(
        ctx,
        controlPointsInput,
        'ParametricCurve2D.controlPoints',
      );
      const pointCount = typeof instanceDecl.count === 'number'
        ? instanceDecl.count
        : instanceDecl.maxCount;
      // [LAW:single-enforcer] Type 2 cubic contract is enforced at the block
      // lowering boundary so runtime/materializer receives one fixed arity.
      if (pointCount !== PARAMETRIC_CUBIC_CONTROL_POINT_COUNT) {
        throw new Error(
          `ParametricCurve2D: controlPoints must have exactly ${String(PARAMETRIC_CUBIC_CONTROL_POINT_COUNT)} lanes (P0..P3), got ${String(pointCount)}`,
        );
      }

      const resolutionInput = inputsById.resolution;
      if (!resolutionInput) {
        throw new Error('ParametricCurve2D: resolution input not wired');
      }
      const thicknessInput = inputsById.thickness;
      if (!thicknessInput) {
        throw new Error('ParametricCurve2D: thickness input not wired');
      }

      const topologyId = ctx.b.registerTopology(
        createParametricCubicPathTopology(),
        'parametric-cubic-curve',
      );

      const shapeRefSig = ctx.b.shapeRef(
        topologyId,
        [resolutionInput.id, thicknessInput.id],
        canonicalType(SHAPE),
        controlPointsInput.id,
      );
      const shapeType = ctx.outTypes[0];
      return {
        outputsById: {
          shape: { id: shapeRefSig, slot: undefined, type: shapeType, stride: payloadStride(shapeType.payload) },
        },
        effects: {
          slotRequests: [
            { portId: 'shape', type: shapeType },
          ],
        },
        instanceContext: instance,
      };
    },
  });
}
