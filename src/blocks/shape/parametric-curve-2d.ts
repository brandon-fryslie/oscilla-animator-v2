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
import { createParametricCubicPathTopology } from './_topology-helpers';

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
        defaultValue: 64,
        defaultSource: defaultSourceConst(64),
        exposedAsPort: true,
        uiHint: { kind: 'slider', min: 4, max: 256, step: 1 },
      },
      thickness: {
        label: 'Thickness',
        type: canonicalType(FLOAT),
        defaultValue: 0.02,
        defaultSource: defaultSourceConst(0.02),
        exposedAsPort: true,
        uiHint: { kind: 'slider', min: 0.001, max: 0.2, step: 0.001 },
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

      const instance = ctx.inferredInstance !== undefined ? ctx.inferredInstance : ctx.instance;
      if (!instance) {
        throw new Error('ParametricCurve2D: missing instance context from controlPoints');
      }
      const instanceDecl = ctx.instances.get(instance);
      if (!instanceDecl) {
        throw new Error(`ParametricCurve2D: instance '${String(instance)}' not found`);
      }
      const pointCount = typeof instanceDecl.count === 'number'
        ? instanceDecl.count
        : instanceDecl.maxCount;
      // [LAW:single-enforcer] Type 2 cubic contract is enforced at the block
      // lowering boundary so runtime/materializer receives one fixed arity.
      if (pointCount !== 4) {
        throw new Error(
          `ParametricCurve2D: controlPoints must have exactly 4 lanes (P0..P3), got ${String(pointCount)}`,
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

