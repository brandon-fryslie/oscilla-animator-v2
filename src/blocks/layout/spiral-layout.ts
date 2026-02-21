/**
 * SpiralLayout Block
 *
 * Type A Distributor: arranges elements in an Archimedean spiral pattern.
 * Gauge-invariant via halton2D placement basis.
 *
 * Spiral math:
 *   u       = UV placement basis x-component (0..1)
 *   angle   = (u + phase) * turns * 2PI
 *   r       = u * expansion
 *   x       = cos(angle) * r + 0.5
 *   y       = sin(angle) * r + 0.5
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';
import { canonicalType, unitWorld3, unitTurns, contractWrap01, payloadStride, floatConst, requireInst } from '../../core/canonical-types';
import { FLOAT, VEC3 } from '../../core/canonical-types';
import { inferType, payloadVar, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { defaultSourceConst } from '../../types';
import { OpCode } from '../../compiler/ir/types';
import { rewriteFieldType } from './_helpers';

// [LAW:one-source-of-truth] Field cardinality behavior is declared on CT/ICT port types.
const SPIRAL_FIELD_CARD = cardinalityVar(cardinalityVarId('spiral_fields'), {
  relation: 'promoteToMany',
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'SpiralLayout',
  label: 'Spiral Layout',
  category: 'layout',
  description: 'Arranges elements in an Archimedean spiral pattern (gauge-invariant)',
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
    elements: { label: 'Elements', type: inferType(payloadVar('spiral_elements_payload'), { kind: 'none' }, { cardinality: SPIRAL_FIELD_CARD }) },
    turns: { label: 'Turns', type: canonicalType(FLOAT), defaultValue: 3.0, defaultSource: defaultSourceConst(3.0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0.1, max: 20, step: 0.1 } },
    expansion: { label: 'Expansion', type: canonicalType(FLOAT), defaultValue: 0.3, defaultSource: defaultSourceConst(0.3), exposedAsPort: true, uiHint: { kind: 'slider', min: 0.01, max: 0.5, step: 0.01 } },
    phase: { label: 'Phase', type: canonicalType(FLOAT, unitTurns(), undefined, contractWrap01()), defaultValue: 0, defaultSource: defaultSourceConst(0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
  },
  outputs: {
    position: { label: 'Position', type: inferType(VEC3, unitWorld3(), { cardinality: SPIRAL_FIELD_CARD }) },
    rotation: { label: 'Rotation', type: inferType(FLOAT, { kind: 'none' }, { cardinality: SPIRAL_FIELD_CARD }) },
    scale: { label: 'Scale', type: inferType(FLOAT, { kind: 'none' }, { cardinality: SPIRAL_FIELD_CARD }) },
  },
  lower: ({ ctx, inputsById }) => {
    const elementsInput = inputsById.elements;

    if (!elementsInput || !('type' in elementsInput && requireInst(elementsInput.type.extent.cardinality, 'cardinality').kind === 'many')) {
      throw new Error('SpiralLayout requires a field input (from Array block)');
    }

    const instanceId = ctx.inferredInstance;
    if (!instanceId) {
      throw new Error('SpiralLayout requires instance context from upstream Array block');
    }

    // Rewrite output type with actual instance (ctx.outTypes has placeholder 'default')
    const posType = rewriteFieldType(ctx.outTypes[0], instanceId, ctx.instances);
    const floatFieldType = { ...posType, payload: FLOAT, unit: { kind: 'none' as const } };
    const vec2FieldType = { ...posType, payload: { kind: 'vec2' as const }, unit: { kind: 'none' as const } };

    // Post-normalization: all inputs guaranteed wired
    // [LAW:one-source-of-truth] inputs are the single source
    const turnsInput = inputsById.turns;
    if (!turnsInput) throw new Error('SpiralLayout: turns input not wired — normalization bug');
    const expansionInput = inputsById.expansion;
    if (!expansionInput) throw new Error('SpiralLayout: expansion input not wired — normalization bug');
    const phaseInput = inputsById.phase;
    if (!phaseInput) throw new Error('SpiralLayout: phase input not wired — normalization bug');

    const basisKind: import('../../compiler/ir/types').BasisKind = 'halton2D';

    // Create UV field from placement basis
    const uvField = ctx.b.placement('uv', basisKind, vec2FieldType);

    // u = extract(uvField, 0) — component 0 = X
    const u = ctx.b.extract(uvField, 0, floatFieldType);

    // Constants
    const const0 = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    const const0_5 = ctx.b.constant(floatConst(0.5), canonicalType(FLOAT));
    const const1 = ctx.b.constant(floatConst(1), canonicalType(FLOAT));
    const twoPi = ctx.b.constant(floatConst(Math.PI * 2), canonicalType(FLOAT));

    // Opcodes
    const clamp = ctx.b.opcode(OpCode.Clamp);
    const add = ctx.b.opcode(OpCode.Add);
    const mul = ctx.b.opcode(OpCode.Mul);
    const cos = ctx.b.opcode(OpCode.Cos);
    const sin = ctx.b.opcode(OpCode.Sin);

    // u_clamped = clamp(u, 0, 1)
    const u_clamped = ctx.b.zipAuto([u, const0, const1], clamp, floatFieldType);

    // angle = (u + phase) * turns * 2PI
    const angle_base = ctx.b.zipAuto([u_clamped, phaseInput.id], add, floatFieldType);
    const angle_scaled = ctx.b.zipAuto([angle_base, turnsInput.id], mul, floatFieldType);
    const angle = ctx.b.zipAuto([angle_scaled, twoPi], mul, floatFieldType);

    // radius = u * expansion (linear growth from center)
    const radius = ctx.b.zipAuto([u_clamped, expansionInput.id], mul, floatFieldType);

    // x = cos(angle) * radius + 0.5, y = sin(angle) * radius + 0.5
    const x_raw = ctx.b.mapAuto(angle, cos, floatFieldType);
    const y_raw = ctx.b.mapAuto(angle, sin, floatFieldType);
    const x_scaled = ctx.b.zipAuto([x_raw, radius], mul, floatFieldType);
    const y_scaled = ctx.b.zipAuto([y_raw, radius], mul, floatFieldType);
    const x = ctx.b.zipAuto([x_scaled, const0_5], add, floatFieldType);
    const y = ctx.b.zipAuto([y_scaled, const0_5], add, floatFieldType);

    // pos = constructAuto([x, y, 0]) → vec3
    const positionField = ctx.b.constructAuto([x, y, const0], posType);

    // rotation = angle (the spiral angle per element, already computed)
    // scale = broadcast constant 1.0
    const scaleField = ctx.b.broadcast(const1, floatFieldType);

    return {
      outputsById: {
        position: { id: positionField, slot: undefined, type: posType, stride: payloadStride(posType.payload) },
        rotation: { id: angle, slot: undefined, type: floatFieldType, stride: 1 },
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
