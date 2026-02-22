/**
 * PathLayout Block
 *
 * Type B Relation: distributes elements along a path using arc-length
 * parameterized sampling via the pathSample kernel.
 *
 * Inputs:
 *   elements — Field<T> from upstream Array (required)
 *   shape    — One<shape2d> from MakeShape2D/ProceduralPolygon (no defaulting)
 *   spacing  — One<float> distribution multiplier (default 1.0)
 *   offset   — One<float> unitTurns wrap01 flow animation (default 0.0)
 *
 * Outputs:
 *   position — Field<vec3> arc-length sampled positions
 *   rotation — Field<float> tangent angles at sampled positions
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';
import { canonicalType, unitWorld3, unitTurns, contractWrap01, payloadStride, floatConst, requireInst } from '../../core/canonical-types';
import { FLOAT, VEC2, VEC3 } from '../../core/canonical-types';
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
      shape: { label: 'Shape', type: canonicalType(FLOAT), defaulting: 'forbidden' },
      spacing: { label: 'Spacing', type: canonicalType(FLOAT), defaultValue: 1.0, defaultSource: defaultSourceConst(1.0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 5, step: 0.01 } },
      offset: { label: 'Offset', type: canonicalType(FLOAT, unitTurns(), undefined, contractWrap01()), defaultValue: 0, defaultSource: defaultSourceConst(0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    },
    outputs: {
      position: { label: 'Position', type: inferType(VEC3, unitWorld3(), { cardinality: PATH_FIELD_CARD }) },
      rotation: { label: 'Rotation', type: inferType(FLOAT, { kind: 'none' }, { cardinality: PATH_FIELD_CARD }) },
      controlPoints: { label: 'Control Points', type: inferType(VEC2, { kind: 'none' }, { cardinality: PATH_FIELD_CARD }) },
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
  
      // Rewrite output types with actual instance
      const posType = rewriteFieldType(ctx.outTypes[0], instanceId, ctx.instances);
      const floatFieldType = { ...posType, payload: FLOAT, unit: { kind: 'none' as const } };
      const vec2FieldType = { ...posType, payload: { kind: 'vec2' as const }, unit: { kind: 'none' as const } };
      const controlPointsType = rewriteFieldType(ctx.outTypes[2], instanceId, ctx.instances);
  
      // Post-normalization: all inputs guaranteed wired
      // [LAW:one-source-of-truth] inputs are the single source
      const shapeInput = inputsById.shape;
      if (!shapeInput) throw new Error('PathLayout: shape input not wired — it is required (no defaulting)');
      const spacingInput = inputsById.spacing;
      if (!spacingInput) throw new Error('PathLayout: spacing input not wired — normalization bug');
      const offsetInput = inputsById.offset;
      if (!offsetInput) throw new Error('PathLayout: offset input not wired — normalization bug');
  
      // Resolve shapeRef from shape input → get controlPointField + topologyId
      const { controlPointField, topologyId } = resolveShapeRef(ctx.b, shapeInput.id);
  
      // Placement basis for UV → extract u component
      const basisKind: import('../../compiler/ir/types').BasisKind = 'halton2D';
      const uvField = ctx.b.placement('uv', basisKind, vec2FieldType);
      const u = ctx.b.extract(uvField, 0, floatFieldType);
  
      // Opcodes
      const mul = ctx.b.opcode(OpCode.Mul);
      const add = ctx.b.opcode(OpCode.Add);
      const wrap01 = ctx.b.opcode(OpCode.Wrap01);
  
      // t = wrap01(u * spacing + offset)
      const u_scaled = ctx.b.zipAuto([u, spacingInput.id], mul, floatFieldType);
      const u_offset = ctx.b.zipAuto([u_scaled, offsetInput.id], add, floatFieldType);
      const t = ctx.b.mapAuto(u_offset, wrap01, floatFieldType);
  
      // Position: pathSample with 'position' op → vec2, then extend to vec3
      const posVec2 = ctx.b.pathSample(controlPointField, t, topologyId, 'position', vec2FieldType);
      const px = ctx.b.extract(posVec2, 0, floatFieldType);
      const py = ctx.b.extract(posVec2, 1, floatFieldType);
      const const0 = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
      const positionField = ctx.b.constructAuto([px, py, const0], posType);
      const controlPointsField = ctx.b.constructAuto([px, py], controlPointsType);
  
      // Rotation: pathSample with 'tangentAngle' op → float
      const rotationField = ctx.b.pathSample(controlPointField, t, topologyId, 'tangentAngle', floatFieldType);
  
      return {
        outputsById: {
          position: { id: positionField, slot: undefined, type: posType, stride: payloadStride(posType.payload) },
          rotation: { id: rotationField, slot: undefined, type: floatFieldType, stride: 1 },
          controlPoints: { id: controlPointsField, slot: undefined, type: controlPointsType, stride: payloadStride(controlPointsType.payload) },
        },
        effects: {
          slotRequests: [
            { portId: 'position', type: posType },
            { portId: 'rotation', type: floatFieldType },
            { portId: 'controlPoints', type: controlPointsType },
          ],
        },
        instanceContext: instanceId,
      };
    },
  });
}
