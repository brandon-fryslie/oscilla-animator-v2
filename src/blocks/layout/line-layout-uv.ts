/**
 * LineLayoutUV Block
 *
 * Gauge-invariant line layout using placement basis.
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';

import { canonicalType, payloadStride, floatConst, requireInst } from '../../core/canonical-types';
import { FLOAT, VEC2 } from '../../core/canonical-types';
import { inferType, payloadVar, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { defaultSourceConst } from '../../types';
import { OpCode } from '../../compiler/ir/types';
import { rewriteFieldType } from './_helpers';

// [LAW:one-source-of-truth] Field cardinality behavior is declared on CT/ICT port types.
const LINE_FIELD_CARD = cardinalityVar(cardinalityVarId('line_fields'), {
  relation: 'promoteToMany',
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});

/**
 * LineLayoutUV - Gauge-invariant line layout using placement basis
 *
 * Stage 3: Field operation block.
 * Takes Field<T> input and outputs Field<vec2> control points along a line.
 * Uses UV placement basis instead of normalizedIndex for gauge invariance.
 */
export function register(): void {
  registerBlock({
    type: 'LineLayoutUV',
    label: 'Line Layout (UV)',
    category: 'layout',
    description: 'Arranges elements along a line using UV placement basis (gauge-invariant)',
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
      elements: { label: 'Elements', type: inferType(payloadVar('line_elements_payload'), { kind: 'none' }, { cardinality: LINE_FIELD_CARD }) },
      x0: { label: 'Start X', type: canonicalType(FLOAT), defaultValue: 0.2, defaultSource: defaultSourceConst(0.2), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
      y0: { label: 'Start Y', type: canonicalType(FLOAT), defaultValue: 0.2, defaultSource: defaultSourceConst(0.2), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
      x1: { label: 'End X', type: canonicalType(FLOAT), defaultValue: 0.8, defaultSource: defaultSourceConst(0.8), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
      y1: { label: 'End Y', type: canonicalType(FLOAT), defaultValue: 0.8, defaultSource: defaultSourceConst(0.8), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    },
    outputs: {
      rotation: { label: 'Rotation', type: inferType(FLOAT, { kind: 'none' }, { cardinality: LINE_FIELD_CARD }) },
      scale: { label: 'Scale', type: inferType(FLOAT, { kind: 'none' }, { cardinality: LINE_FIELD_CARD }) },
      controlPoints: { label: 'Control Points', type: inferType(VEC2, { kind: 'none' }, { cardinality: LINE_FIELD_CARD }) },
    },
    lower: ({ ctx, inputsById }) => {
      const elementsInput = inputsById.elements;
  
      if (!elementsInput || !('type' in elementsInput && requireInst(elementsInput.type.extent.cardinality, 'cardinality').kind === 'many')) {
        throw new Error('LineLayoutUV requires a field input (from Array block)');
      }
  
      const instanceId = ctx.inferredInstance;
      if (!instanceId) {
        throw new Error('LineLayoutUV requires instance context from upstream Array block');
      }
  
      // [LAW:one-source-of-truth] Layout emits only controlPoints; rotation/scale derive from the same instance.
      const rotationType = rewriteFieldType(ctx.outTypes[0], instanceId, ctx.instances);
      const scaleType = rewriteFieldType(ctx.outTypes[1], instanceId, ctx.instances);
      const controlPointsType = rewriteFieldType(ctx.outTypes[2], instanceId, ctx.instances);
      const floatFieldType = rotationType;
      const vec2FieldType = controlPointsType;
  
      // Post-normalization: all inputs guaranteed wired — no fallback needed
      // [LAW:one-source-of-truth] inputs are the single source; config was a dead fallback
      const x0Input = inputsById.x0;
      if (!x0Input) throw new Error('LineLayoutUV: x0 input not wired — normalization bug');
      const y0Input = inputsById.y0;
      if (!y0Input) throw new Error('LineLayoutUV: y0 input not wired — normalization bug');
      const x1Input = inputsById.x1;
      if (!x1Input) throw new Error('LineLayoutUV: x1 input not wired — normalization bug');
      const y1Input = inputsById.y1;
      if (!y1Input) throw new Error('LineLayoutUV: y1 input not wired — normalization bug');
  
      // Use halton2D as default basis kind (user-configurable when BlockDef supports config)
      const basisKind: import('../../compiler/ir/types').BasisKind = 'halton2D';
  
      // Create UV field from placement basis
      const uvField = ctx.b.placement('uv',
        basisKind,
        vec2FieldType
      );
  
      // Decompose lineLayoutUV into opcode sequence:
      // u = extract(uvField, 0) — component 0 = X
      const u = ctx.b.extract(uvField, 0, floatFieldType);
  
      // Constants (one-cardinality — zipAuto/constructAuto handle one→many broadcasting)
      const const0 = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
      const const1 = ctx.b.constant(floatConst(1), canonicalType(FLOAT));
  
      // Opcodes
      const clamp = ctx.b.opcode(OpCode.Clamp);
      const lerp = ctx.b.opcode(OpCode.Lerp);
  
      // u_clamped = clamp(u, 0, 1)
      const u_clamped = ctx.b.zipAuto([u, const0, const1], clamp, floatFieldType);
  
      // x = lerp(x0, x1, u_clamped)
      const x = ctx.b.zipAuto([x0Input.id, x1Input.id, u_clamped], lerp, floatFieldType);
  
      // y = lerp(y0, y1, u_clamped)
      const y = ctx.b.zipAuto([y0Input.id, y1Input.id, u_clamped], lerp, floatFieldType);
  
      const controlPointsField = ctx.b.constructAuto([x, y], controlPointsType);
  
      // rotation = atan2(y1-y0, x1-x0) — constant along line, broadcast one→many
      const sub = ctx.b.opcode(OpCode.Sub);
      const atan2 = ctx.b.opcode(OpCode.Atan2);
      const floatOneType = canonicalType(FLOAT); // one-extent type for one-cardinality computations
      const dy = ctx.b.zipAuto([y1Input.id, y0Input.id], sub, floatOneType);
      const dx = ctx.b.zipAuto([x1Input.id, x0Input.id], sub, floatOneType);
      const lineAngle = ctx.b.zipAuto([dy, dx], atan2, floatOneType);
      const rotationField = ctx.b.broadcast(lineAngle, floatFieldType);
  
      // scale = broadcast constant 1.0
      const scaleField = ctx.b.broadcast(const1, floatFieldType);
  
      return {
        outputsById: {
          rotation: { id: rotationField, slot: undefined, type: rotationType, stride: 1 },
          scale: { id: scaleField, slot: undefined, type: scaleType, stride: 1 },
          controlPoints: { id: controlPointsField, slot: undefined, type: controlPointsType, stride: payloadStride(controlPointsType.payload) },
        },
        effects: {
          slotRequests: [
            { portId: 'rotation', type: rotationType },
            { portId: 'scale', type: scaleType },
            { portId: 'controlPoints', type: controlPointsType },
          ],
        },
        instanceContext: instanceId,
      };
    },
  });
}
