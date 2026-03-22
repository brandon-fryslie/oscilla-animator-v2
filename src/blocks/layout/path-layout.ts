/**
 * PathLayout Block
 *
 * Distributes elements along a path using arc-length parameterized sampling
 * via the pathSample kernel. Convenience block built on the domain topology primitives.
 *
 * Inputs:
 *   elements — Field<T> from upstream Array (required)
 *   shape    — One<shape> from MakeShape2D/ProceduralPolygon (no defaulting)
 *   spacing  — One<float> distribution multiplier (default 1.0)
 *   offset   — One<float> unitTurns wrap01 flow animation (default 0.0)
 *
 * Outputs:
 *   controlPoints — Field<vec2> arc-length sampled positions
 *   rotation      — Field<float> tangent angles at sampled positions
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';
import { canonicalType, unitTurns, contractWrap01, payloadStride, requireInst } from '../../core/canonical-types';
import { FLOAT, SHAPE, VEC2 } from '../../core/canonical-types';
import { inferType, payloadVar, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { defaultSourceConst } from '../../types';
import { OpCode } from '../../compiler/ir/types';
import { rewriteFieldType, resolveShapeRef } from './_helpers';

// [LAW:one-source-of-truth] Field cardinality behavior is declared on CT/ICT port types.
const PATH_FIELD_CARD = cardinalityVar(cardinalityVarId('path_fields'), {
  relation: 'promoteToMany',
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'PathLayout',
    label: 'Path Layout',
    category: 'layout',
    description: 'Distributes elements along a path using arc-length parameterized sampling',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    payload: {
      allowedPayloads: {
        elements: ALL_CONCRETE_PAYLOADS,
      },
      semantics: 'typeSpecific',
    },
    inputs: {
      elements: { label: 'Elements', type: inferType(payloadVar('path_elements_payload'), { kind: 'none' }, { cardinality: PATH_FIELD_CARD }) },
      shape: { label: 'Shape', type: canonicalType(SHAPE), defaulting: 'forbidden' },
      spacing: { label: 'Spacing', type: canonicalType(FLOAT), defaultValue: 1.0, defaultSource: defaultSourceConst(1.0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 5, step: 0.01 } },
      offset: { label: 'Offset', type: canonicalType(FLOAT, unitTurns(), undefined, contractWrap01()), defaultValue: 0, defaultSource: defaultSourceConst(0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    },
    outputs: {
      controlPoints: { label: 'Control Points', type: inferType(VEC2, { kind: 'none' }, { cardinality: PATH_FIELD_CARD }) },
      rotation: { label: 'Rotation', type: inferType(FLOAT, { kind: 'none' }, { cardinality: PATH_FIELD_CARD }) },
    },
    lower: ({ ctx, inputsById }) => {
      const elementsInput = inputsById.elements;

      if (!elementsInput || !('type' in elementsInput && requireInst(elementsInput.type.extent.cardinality, 'cardinality').kind === 'many')) {
        throw new Error('PathLayout requires a field input (from Array block)');
      }

      const instanceId = ctx.inferredInstance;
      if (!instanceId) {
        throw new Error('PathLayout requires instance context from upstream Array block');
      }

      const controlPointsType = rewriteFieldType(ctx.outTypes[0], instanceId, ctx.instances);
      const rotationType = rewriteFieldType(ctx.outTypes[1], instanceId, ctx.instances);
      const floatFieldType = rotationType;
      const vec2FieldType = controlPointsType;

      const shapeInput = inputsById.shape;
      if (!shapeInput) throw new Error('PathLayout: shape input not wired — it is required (no defaulting)');
      const spacingInput = inputsById.spacing;
      if (!spacingInput) throw new Error('PathLayout: spacing input not wired — normalization bug');
      const offsetInput = inputsById.offset;
      if (!offsetInput) throw new Error('PathLayout: offset input not wired — normalization bug');

      // Resolve shapeRef from shape input → get controlPointField + topologyId
      const { controlPointField, topologyId } = resolveShapeRef(ctx.b, shapeInput.id);

      // Placement basis for UV → extract u component
      const uvField = ctx.b.placement('uv', 'halton2D', vec2FieldType);
      const u = ctx.b.extract(uvField, 0, floatFieldType);

      const mul = ctx.b.opcode(OpCode.Mul);
      const add = ctx.b.opcode(OpCode.Add);
      const wrap01 = ctx.b.opcode(OpCode.Wrap01);

      // t = wrap01(u * spacing + offset)
      const u_scaled = ctx.b.zipAuto([u, spacingInput.id], mul, floatFieldType);
      const u_offset = ctx.b.zipAuto([u_scaled, offsetInput.id], add, floatFieldType);
      const t = ctx.b.mapAuto(u_offset, wrap01, floatFieldType);

      // Position sampling: pathSample with 'position' op → vec2 control points.
      const posVec2 = ctx.b.pathSample(controlPointField, t, topologyId, 'position', vec2FieldType);
      const px = ctx.b.extract(posVec2, 0, floatFieldType);
      const py = ctx.b.extract(posVec2, 1, floatFieldType);
      const controlPointsField = ctx.b.constructAuto([px, py], controlPointsType);

      // Rotation: pathSample with 'tangentAngle' op → float
      const rotationField = ctx.b.pathSample(controlPointField, t, topologyId, 'tangentAngle', rotationType);

      return {
        outputsById: {
          controlPoints: { id: controlPointsField, slot: undefined, type: controlPointsType, stride: payloadStride(controlPointsType.payload) },
          rotation: { id: rotationField, slot: undefined, type: rotationType, stride: 1 },
        },
        effects: {
          slotRequests: [
            { portId: 'controlPoints', type: controlPointsType },
            { portId: 'rotation', type: rotationType },
          ],
        },
        instanceContext: instanceId,
      };
    },
  });
}
