/**
 * LineLayoutUV Block
 *
 * Gauge-invariant line layout using placement basis.
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';

import { canonicalType, unitWorld3, payloadStride, floatConst, requireInst } from '../../core/canonical-types';
import { FLOAT, VEC3 } from '../../core/canonical-types';
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
 * Takes Field<T> input and outputs Field<vec3> positions along a line.
 * Uses UV placement basis instead of normalizedIndex for gauge invariance.
 */
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
    position: { label: 'Position', type: inferType(VEC3, unitWorld3(), { cardinality: LINE_FIELD_CARD }) },
    rotation: { label: 'Rotation', type: inferType(FLOAT, { kind: 'none' }, { cardinality: LINE_FIELD_CARD }) },
    scale: { label: 'Scale', type: inferType(FLOAT, { kind: 'none' }, { cardinality: LINE_FIELD_CARD }) },
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

    // Rewrite output type with actual instance (ctx.outTypes has placeholder 'default')
    const posType = rewriteFieldType(ctx.outTypes[0], instanceId, ctx.instances);
    const floatFieldType = { ...posType, payload: FLOAT, unit: { kind: 'none' as const } };
    const vec2FieldType = { ...posType, payload: { kind: 'vec2' as const }, unit: { kind: 'none' as const } };

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

    // Constants (signal — zipAuto/constructAuto handle signal→field broadcasting)
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

    // pos = constructAuto([x, y, 0]) → vec3 (auto-broadcasts const0 signal)
    const positionField = ctx.b.constructAuto([x, y, const0], posType);

    // rotation = atan2(y1-y0, x1-x0) — constant along line, broadcast signal→field
    const sub = ctx.b.opcode(OpCode.Sub);
    const atan2 = ctx.b.opcode(OpCode.Atan2);
    const floatSignalType = canonicalType(FLOAT); // signal-extent type for signal computations
    const dy = ctx.b.zipAuto([y1Input.id, y0Input.id], sub, floatSignalType);
    const dx = ctx.b.zipAuto([x1Input.id, x0Input.id], sub, floatSignalType);
    const lineAngle = ctx.b.zipAuto([dy, dx], atan2, floatSignalType);
    const rotationField = ctx.b.broadcast(lineAngle, floatFieldType);

    // scale = broadcast constant 1.0
    const scaleField = ctx.b.broadcast(const1, floatFieldType);

    return {
      outputsById: {
        position: { id: positionField, slot: undefined, type: posType, stride: payloadStride(posType.payload) },
        rotation: { id: rotationField, slot: undefined, type: floatFieldType, stride: 1 },
        scale: { id: scaleField, slot: undefined, type: floatFieldType, stride: 1 },
      },
      effects: {
        slotRequests: [
          { portId: 'position', type: posType },
          { portId: 'rotation', type: floatFieldType },
          { portId: 'scale', type: floatFieldType },
        ],
      },
      instanceContext: instanceId,
    };
  },
});
