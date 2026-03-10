/**
 * AttractorLayout Block
 *
 * Type C Deformer: displaces existing control points toward a target point.
 * Component-wise lerp: output = lerp(controlPoints, target, strength)
 *
 * Inputs:
 *   points        — Field<vec2> from upstream layout/shape (required, no defaulting)
 *   target        — One<vec2> attraction point (default [0, 0])
 *   strength  — One<float> 0..1 slider (default 0.5)
 *
 * Output:
 *   controlPoints — Field<vec2> deformed control points
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, requireInst } from '../../core/canonical-types';
import { FLOAT, VEC2 } from '../../core/canonical-types';
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

export function register(): void {
  registerBlock({
    type: 'AttractorLayout',
    label: 'Attractor Layout',
    category: 'layout',
    description: 'Displaces field control points toward a target point (Type C deformer)',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      points: { label: 'Points', type: inferType(VEC2, { kind: 'none' }, { cardinality: ATTRACTOR_FIELD_CARD }), defaulting: 'forbidden' },
      // [LAW:one-source-of-truth] World-space default target is the canonical origin.
      target: { label: 'Target', type: canonicalType(VEC2), defaultValue: [0, 0], defaultSource: defaultSourceConst([0, 0]), exposedAsPort: true },
      strength: { label: 'Strength', type: canonicalType(FLOAT), defaultValue: 0.5, defaultSource: defaultSourceConst(0.5), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    },
    outputs: {
      controlPoints: { label: 'Control Points', type: inferType(VEC2, { kind: 'none' }, { cardinality: ATTRACTOR_FIELD_CARD }) },
    },
    lower: ({ ctx, inputsById }) => {
      const controlPointsInput = inputsById.points;
  
      if (!controlPointsInput || !('type' in controlPointsInput && requireInst(controlPointsInput.type.extent.cardinality, 'cardinality').kind === 'many')) {
        throw new Error('AttractorLayout requires a field input for controlPoints');
      }
  
      const instanceId = ctx.inferredInstance;
      if (!instanceId) {
        throw new Error('AttractorLayout requires instance context from upstream Array block');
      }
  
      // [LAW:one-source-of-truth] Attractor emits only controlPoints as the canonical spatial output.
      const controlPointsType = rewriteFieldType(ctx.outTypes[0], instanceId, ctx.instances);
      const floatFieldType = { ...controlPointsType, payload: FLOAT, unit: { kind: 'none' as const } };
  
      // Post-normalization: all inputs guaranteed wired
      // [LAW:one-source-of-truth] inputs are the single source
      const targetInput = inputsById.target;
      if (!targetInput) throw new Error('AttractorLayout: target input not wired — normalization bug');
      const strengthInput = inputsById.strength;
      if (!strengthInput) throw new Error('AttractorLayout: strength input not wired — normalization bug');
  
      // Extract components from input control points field (vec2 → x, y)
      const inX = ctx.b.extract(controlPointsInput.id, 0, floatFieldType);
      const inY = ctx.b.extract(controlPointsInput.id, 1, floatFieldType);
  
      // Extract components from target value (vec2 → x, y)
      const targetFloatType = canonicalType(FLOAT);
      const tX = ctx.b.extract(targetInput.id, 0, targetFloatType);
      const tY = ctx.b.extract(targetInput.id, 1, targetFloatType);
  
      const lerp = ctx.b.opcode(OpCode.Lerp);
  
      // Component-wise lerp: lerp(inComponent, targetComponent, strength)
      // zipAuto handles mixed cardinality (field inX + single-instance tX/strength → zipPromote internally)
      const outX = ctx.b.zipAuto([inX, tX, strengthInput.id], lerp, floatFieldType);
      const outY = ctx.b.zipAuto([inY, tY, strengthInput.id], lerp, floatFieldType);
  
      // Construct output: vec2 control points.
      const controlPointsField = ctx.b.constructAuto([outX, outY], controlPointsType);
  
      return {
        outputsById: {
          controlPoints: { id: controlPointsField, slot: undefined, type: controlPointsType, stride: payloadStride(controlPointsType.payload) },
        },
        effects: {
          slotRequests: [
            { portId: 'controlPoints', type: controlPointsType },
          ],
        },
        instanceContext: instanceId,
      };
    },
  });
}
