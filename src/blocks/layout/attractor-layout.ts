/**
 * AttractorLayout Block
 *
 * Type C Deformer: displaces existing field positions toward a target point.
 * Component-wise lerp: output = lerp(positions, target, strength)
 *
 * Inputs:
 *   positions — Field<vec3> from upstream layout (required, no defaulting)
 *   target    — One<vec3> attraction point (default [0.5, 0.5, 0])
 *   strength  — One<float> 0..1 slider (default 0.5)
 *
 * Output:
 *   position  — Field<vec3> deformed positions
 */

import { registerBlock } from '../registry';
import { canonicalType, unitWorld3, payloadStride, floatConst, requireInst } from '../../core/canonical-types';
import { FLOAT, VEC3 } from '../../core/canonical-types';
import { inferType, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { defaultSourceConst } from '../../types';
import { OpCode } from '../../compiler/ir/types';
import { rewriteFieldType } from './_helpers';

// [LAW:one-source-of-truth] Field cardinality behavior is declared on CT/ICT port types.
const ATTRACTOR_FIELD_CARD = cardinalityVar(cardinalityVarId('attractor_fields'), {
  relation: 'promoteToMany',
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'AttractorLayout',
  label: 'Attractor Layout',
  category: 'layout',
  description: 'Displaces field positions toward a target point (Type C deformer)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  inputs: {
    positions: { label: 'Positions', type: inferType(VEC3, unitWorld3(), { cardinality: ATTRACTOR_FIELD_CARD }), defaulting: 'forbidden' },
    target: { label: 'Target', type: canonicalType(VEC3, unitWorld3()), defaultValue: [0.5, 0.5, 0], defaultSource: defaultSourceConst([0.5, 0.5, 0]), exposedAsPort: true },
    strength: { label: 'Strength', type: canonicalType(FLOAT), defaultValue: 0.5, defaultSource: defaultSourceConst(0.5), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
  },
  outputs: {
    position: { label: 'Position', type: inferType(VEC3, unitWorld3(), { cardinality: ATTRACTOR_FIELD_CARD }) },
  },
  lower: ({ ctx, inputsById }) => {
    const positionsInput = inputsById.positions;

    if (!positionsInput || !('type' in positionsInput && requireInst(positionsInput.type.extent.cardinality, 'cardinality').kind === 'many')) {
      throw new Error('AttractorLayout requires a field input for positions');
    }

    const instanceId = ctx.inferredInstance;
    if (!instanceId) {
      throw new Error('AttractorLayout requires instance context from upstream Array block');
    }

    // Rewrite output type with actual instance
    const posType = rewriteFieldType(ctx.outTypes[0], instanceId, ctx.instances);
    const floatFieldType = { ...posType, payload: FLOAT, unit: { kind: 'none' as const } };

    // Post-normalization: all inputs guaranteed wired
    // [LAW:one-source-of-truth] inputs are the single source
    const targetInput = inputsById.target;
    if (!targetInput) throw new Error('AttractorLayout: target input not wired — normalization bug');
    const strengthInput = inputsById.strength;
    if (!strengthInput) throw new Error('AttractorLayout: strength input not wired — normalization bug');

    // Extract components from positions field (vec3 → x, y, z)
    const inX = ctx.b.extract(positionsInput.id, 0, floatFieldType);
    const inY = ctx.b.extract(positionsInput.id, 1, floatFieldType);
    const inZ = ctx.b.extract(positionsInput.id, 2, floatFieldType);

    // Extract components from target value (vec3 → x, y, z)
    const targetFloatType = canonicalType(FLOAT);
    const tX = ctx.b.extract(targetInput.id, 0, targetFloatType);
    const tY = ctx.b.extract(targetInput.id, 1, targetFloatType);
    const tZ = ctx.b.extract(targetInput.id, 2, targetFloatType);

    const lerp = ctx.b.opcode(OpCode.Lerp);

    // Component-wise lerp: lerp(inComponent, targetComponent, strength)
    // zipAuto handles mixed cardinality (field inX + single-instance tX/strength → zipPromote internally)
    const outX = ctx.b.zipAuto([inX, tX, strengthInput.id], lerp, floatFieldType);
    const outY = ctx.b.zipAuto([inY, tY, strengthInput.id], lerp, floatFieldType);
    const outZ = ctx.b.zipAuto([inZ, tZ, strengthInput.id], lerp, floatFieldType);

    // Construct output vec3
    const positionField = ctx.b.constructAuto([outX, outY, outZ], posType);

    return {
      outputsById: {
        position: { id: positionField, slot: undefined, type: posType, stride: payloadStride(posType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'position', type: posType },
        ],
      },
      instanceContext: instanceId,
    };
  },
});
