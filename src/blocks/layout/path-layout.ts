/**
 * PathLayout Block
 *
 * Type B Relation: distributes elements along a path using arc-length
 * parameterized sampling via the pathSample kernel.
 *
 * Inputs:
 *   elements — Field<T> from upstream Array (required)
 *   shape    — Signal<shape2d> from MakeShape2D/ProceduralPolygon (no defaulting)
 *   spacing  — Signal<float> distribution multiplier (default 1.0)
 *   offset   — Signal<float> unitTurns wrap01 flow animation (default 0.0)
 *
 * Outputs:
 *   position — Field<vec3> arc-length sampled positions
 *   rotation — Field<float> tangent angles at sampled positions
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';
import { canonicalType, canonicalFieldDef, unitWorld3, unitTurns, contractWrap01, payloadStride, floatConst, requireInst } from '../../core/canonical-types';
import { FLOAT, VEC3 } from '../../core/canonical-types';
import { defaultSourceConst } from '../../types';
import { OpCode } from '../../compiler/ir/types';
import { rewriteFieldType, resolveShapeRef } from './_helpers';

registerBlock({
  type: 'PathLayout',
  label: 'Path Layout',
  category: 'layout',
  description: 'Distributes elements along a path using arc-length parameterized sampling',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  payload: {
    allowedPayloads: {
      elements: ALL_CONCRETE_PAYLOADS,
    },
    semantics: 'typeSpecific',
  },
  inputs: {
    elements: { label: 'Elements', type: canonicalFieldDef(FLOAT, { kind: 'none' }) },
    shape: { label: 'Shape', type: canonicalType(FLOAT), defaulting: 'forbidden' },
    spacing: { label: 'Spacing', type: canonicalType(FLOAT), defaultValue: 1.0, defaultSource: defaultSourceConst(1.0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 5, step: 0.01 } },
    offset: { label: 'Offset', type: canonicalType(FLOAT, unitTurns(), undefined, contractWrap01()), defaultValue: 0, defaultSource: defaultSourceConst(0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
  },
  outputs: {
    position: { label: 'Position', type: canonicalFieldDef(VEC3, unitWorld3()) },
    rotation: { label: 'Rotation', type: canonicalFieldDef(FLOAT, { kind: 'none' }) },
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

    // Rotation: pathSample with 'tangentAngle' op → float
    const rotationField = ctx.b.pathSample(controlPointField, t, topologyId, 'tangentAngle', floatFieldType);

    return {
      outputsById: {
        position: { id: positionField, slot: undefined, type: posType, stride: payloadStride(posType.payload) },
        rotation: { id: rotationField, slot: undefined, type: floatFieldType, stride: 1 },
      },
      effects: {
        slotRequests: [
          { portId: 'position', type: posType },
          { portId: 'rotation', type: floatFieldType },
        ],
      },
      instanceContext: instanceId,
    };
  },
});
