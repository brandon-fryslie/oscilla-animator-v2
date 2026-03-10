/**
 * SpiralLayout Block
 *
 * Type A Distributor: arranges elements in an Archimedean spiral pattern.
 * Gauge-invariant via halton2D placement basis.
 *
 * Spiral math:
 *   u       = UV placement basis x-component (0..1)
 *   angle   = (u * turns + phase * spin) * 2PI
 *   r       = u * expansion
 *   x       = cos(angle) * r
 *   y       = sin(angle) * r
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';
import { canonicalType, unitTurns, contractWrap01, payloadStride, floatConst, requireInst } from '../../core/canonical-types';
import { FLOAT, VEC2 } from '../../core/canonical-types';
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

export function register(): void {
  registerBlock({
    type: 'SpiralLayout',
    label: 'Spiral Layout',
    category: 'layout',
    description: 'Arranges elements in an Archimedean spiral pattern (gauge-invariant)',
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
      elements: { label: 'Elements', type: inferType(payloadVar('spiral_elements_payload'), { kind: 'none' }, { cardinality: SPIRAL_FIELD_CARD }) },
      turns: { label: 'Turns', type: canonicalType(FLOAT), defaultValue: 3.0, defaultSource: defaultSourceConst(3.0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0.1, max: 20, step: 0.1 } },
      spin: { label: 'Spin', type: canonicalType(FLOAT), defaultValue: 1.0, defaultSource: defaultSourceConst(1.0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 5, step: 0.05 } },
      expansion: { label: 'Expansion', type: canonicalType(FLOAT), defaultValue: 0.3, defaultSource: defaultSourceConst(0.3), exposedAsPort: true, uiHint: { kind: 'slider', min: 0.01, max: 0.5, step: 0.01 } },
      phase: { label: 'Phase', type: canonicalType(FLOAT, unitTurns(), undefined, contractWrap01()), defaultValue: 0, defaultSource: defaultSourceConst(0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    },
    outputs: {
      rotation: { label: 'Rotation', type: inferType(FLOAT, { kind: 'none' }, { cardinality: SPIRAL_FIELD_CARD }) },
      scale: { label: 'Scale', type: inferType(FLOAT, { kind: 'none' }, { cardinality: SPIRAL_FIELD_CARD }) },
      controlPoints: { label: 'Control Points', type: inferType(VEC2, { kind: 'none' }, { cardinality: SPIRAL_FIELD_CARD }) },
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
  
      // [LAW:one-source-of-truth] Layout emits only controlPoints; rotation/scale derive from the same instance.
      const rotationType = rewriteFieldType(ctx.outTypes[0], instanceId, ctx.instances);
      const scaleType = rewriteFieldType(ctx.outTypes[1], instanceId, ctx.instances);
      const controlPointsType = rewriteFieldType(ctx.outTypes[2], instanceId, ctx.instances);
      const floatFieldType = rotationType;
      const vec2FieldType = controlPointsType;
  
      // Post-normalization: all inputs guaranteed wired
      // [LAW:one-source-of-truth] inputs are the single source
      const turnsInput = inputsById.turns;
      if (!turnsInput) throw new Error('SpiralLayout: turns input not wired — normalization bug');
      const spinInput = inputsById.spin;
      if (!spinInput) throw new Error('SpiralLayout: spin input not wired — normalization bug');
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
  
      // angle = (u * turns + phase * spin) * 2PI
      // [LAW:one-source-of-truth] turns controls spatial winding; spin controls time-driven rotation amount.
      const spiralTurns = ctx.b.zipAuto([u_clamped, turnsInput.id], mul, floatFieldType);
      const phaseTurns = ctx.b.zipAuto([phaseInput.id, spinInput.id], mul, floatFieldType);
      const angleTurns = ctx.b.zipAuto([spiralTurns, phaseTurns], add, floatFieldType);
      const angle = ctx.b.zipAuto([angleTurns, twoPi], mul, floatFieldType);
  
      // radius = u * expansion (linear growth from center)
      const radius = ctx.b.zipAuto([u_clamped, expansionInput.id], mul, floatFieldType);
  
      // x = cos(angle) * radius, y = sin(angle) * radius
      const x_raw = ctx.b.mapAuto(angle, cos, floatFieldType);
      const y_raw = ctx.b.mapAuto(angle, sin, floatFieldType);
      const x_scaled = ctx.b.zipAuto([x_raw, radius], mul, floatFieldType);
      const y_scaled = ctx.b.zipAuto([y_raw, radius], mul, floatFieldType);
      const x = x_scaled;
      const y = y_scaled;
  
      const controlPointsField = ctx.b.constructAuto([x, y], controlPointsType);
  
      // rotation = angle (the spiral angle per element, already computed)
      // scale = broadcast constant 1.0
      const scaleField = ctx.b.broadcast(const1, floatFieldType);
  
      return {
        outputsById: {
          rotation: { id: angle, slot: undefined, type: rotationType, stride: 1 },
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
