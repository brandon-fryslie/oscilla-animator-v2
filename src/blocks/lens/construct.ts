/**
 * Construct Block
 *
 * Construct vector payloads from scalar components.
 * This is a type-changing lens:
 * - vec2 = (x, y)
 * - vec3 = (x, y, z)
 * - vec4 = (x, y, z, w)
 */

import { registerBlock } from '../registry';
import { payloadStride } from '../../core/canonical-types';
import { FLOAT, VEC2, VEC3, VEC4 } from '../../core/canonical-types';
import { inferType, unitVar, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const CONSTRUCT_CARD = cardinalityVar(cardinalityVarId('construct_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'Construct',
    label: 'Construct',
    category: 'lens',
    description: 'Construct vec2/vec3/vec4 values from scalar components',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      x: { label: 'X', type: inferType(FLOAT, unitVar('construct_u'), { cardinality: CONSTRUCT_CARD }), defaultValue: 0.0 },
      y: { label: 'Y', type: inferType(FLOAT, unitVar('construct_u'), { cardinality: CONSTRUCT_CARD }), defaultValue: 0.0 },
      z: { label: 'Z', type: inferType(FLOAT, unitVar('construct_u'), { cardinality: CONSTRUCT_CARD }), defaultValue: 0.0 },
      w: { label: 'W', type: inferType(FLOAT, unitVar('construct_u'), { cardinality: CONSTRUCT_CARD }), defaultValue: 0.0 },
    },
    outputs: {
      vec2: { label: 'Vec2', type: inferType(VEC2, unitVar('construct_u'), { cardinality: CONSTRUCT_CARD }) },
      vec3: { label: 'Vec3', type: inferType(VEC3, unitVar('construct_u'), { cardinality: CONSTRUCT_CARD }) },
      vec4: { label: 'Vec4', type: inferType(VEC4, unitVar('construct_u'), { cardinality: CONSTRUCT_CARD }) },
      out: { label: 'Out', type: inferType(VEC3, unitVar('construct_u'), { cardinality: CONSTRUCT_CARD }), hidden: true },
    },
    lower: ({ inputsById, ctx }) => {
      const xInput = inputsById.x;
      const yInput = inputsById.y;
      const zInput = inputsById.z;
      const wInput = inputsById.w;

      if (!xInput || !yInput || !zInput || !wInput) {
        throw new Error('Construct requires all inputs (x, y, z, w)');
      }

      const vec2Type = ctx.outTypes[0];
      const vec3Type = ctx.outTypes[1];
      const vec4Type = ctx.outTypes[2];
      const outAliasType = ctx.outTypes[3];
      if (!vec2Type || !vec3Type || !vec4Type || !outAliasType) {
        throw new Error('Construct missing resolved output types from pass1');
      }

      // [LAW:one-type-per-behavior] One constructor block provides vec2/vec3/vec4 variants.
      // [LAW:dataflow-not-control-flow] All variants are lowered unconditionally; graph wiring
      // decides which outputs are consumed.
      const vec2 = ctx.b.constructAuto([xInput.id, yInput.id], vec2Type);
      const vec3 = ctx.b.constructAuto([xInput.id, yInput.id, zInput.id], vec3Type);
      const vec4 = ctx.b.constructAuto([xInput.id, yInput.id, zInput.id, wInput.id], vec4Type);
      const outAlias = ctx.b.constructAuto([xInput.id, yInput.id, zInput.id], outAliasType);

      return {
        outputsById: {
          vec2: { id: vec2, slot: undefined, type: vec2Type, stride: payloadStride(vec2Type.payload) },
          vec3: { id: vec3, slot: undefined, type: vec3Type, stride: payloadStride(vec3Type.payload) },
          vec4: { id: vec4, slot: undefined, type: vec4Type, stride: payloadStride(vec4Type.payload) },
          out: { id: outAlias, slot: undefined, type: outAliasType, stride: payloadStride(outAliasType.payload) },
        },
        effects: {
          slotRequests: [
            { portId: 'vec2', type: vec2Type },
            { portId: 'vec3', type: vec3Type },
            { portId: 'vec4', type: vec4Type },
            { portId: 'out', type: outAliasType },
          ],
        },
      };
    },
  });
}
