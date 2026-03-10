  /**
   * CircleLayoutUV Block
   *
   * Gauge-invariant circle layout using placement basis.
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
  const CIRCLE_FIELD_CARD = cardinalityVar(cardinalityVarId('circle_fields'), {
    relation: 'promoteToMany',
    acceptance: 'manyOnly',
    instanceBinding: 'inherit',
  });

  /**
   * CircleLayoutUV - Gauge-invariant circle layout using placement basis
   *
   * Stage 3: Field operation block.
   * Takes Field<T> input and outputs Field<vec2> control points on a circle.
   * Uses UV placement basis instead of normalizedIndex for gauge invariance.
   */
  export function register(): void {
    registerBlock({
        type: 'CircleLayoutUV',
        label: 'Circle Layout (UV)',
        category: 'layout',
        description: 'Arranges elements in a circle pattern using UV placement basis (gauge-invariant)',
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
          elements: { label: 'Elements', type: inferType(payloadVar('circle_elements_payload'), { kind: 'none' }, { cardinality: CIRCLE_FIELD_CARD }) },
          radius: { label: 'Radius', type: canonicalType(FLOAT), defaultValue: 0.3, defaultSource: defaultSourceConst(0.3), exposedAsPort: true, uiHint: { kind: 'slider', min: 0.01, max: 0.5, step: 0.01 } },
          phase: { label: 'Phase', type: canonicalType(FLOAT, unitTurns(), undefined, contractWrap01()), defaultValue: 0, defaultSource: defaultSourceConst(0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
        },
        outputs: {
          rotation: { label: 'Rotation', type: inferType(FLOAT, { kind: 'none' }, { cardinality: CIRCLE_FIELD_CARD }) },
          scale: { label: 'Scale', type: inferType(FLOAT, { kind: 'none' }, { cardinality: CIRCLE_FIELD_CARD }) },
          controlPoints: { label: 'Control Points', type: inferType(VEC2, { kind: 'none' }, { cardinality: CIRCLE_FIELD_CARD }) },
        },
        lower: ({ ctx, inputsById }) => {
          const elementsInput = inputsById.elements;
    
          if (!elementsInput || !('type' in elementsInput && requireInst(elementsInput.type.extent.cardinality, 'cardinality').kind === 'many')) {
            throw new Error('CircleLayoutUV requires a field input (from Array block)');
          }
    
          const instanceId = ctx.inferredInstance;
          if (!instanceId) {
            throw new Error('CircleLayoutUV requires instance context from upstream Array block');
          }
    
          // [LAW:one-source-of-truth] Layout emits only controlPoints; rotation/scale derive from the same instance.
          const rotationType = rewriteFieldType(ctx.outTypes[0], instanceId, ctx.instances);
          const scaleType = rewriteFieldType(ctx.outTypes[1], instanceId, ctx.instances);
          const controlPointsType = rewriteFieldType(ctx.outTypes[2], instanceId, ctx.instances);
          const floatFieldType = rotationType;
          const vec2FieldType = controlPointsType;
    
          // Post-normalization: all inputs guaranteed wired — no fallback needed
          // [LAW:one-source-of-truth] inputs are the single source; config was a dead fallback
          const radiusInput = inputsById.radius;
          if (!radiusInput) throw new Error('CircleLayoutUV: radius input not wired — normalization bug');
          const phaseInput = inputsById.phase;
          if (!phaseInput) throw new Error('CircleLayoutUV: phase input not wired — normalization bug');
    
          // Use halton2D as default basis kind (user-configurable when BlockDef supports config)
          const basisKind: import('../../compiler/ir/types').BasisKind = 'halton2D';
    
          // Create UV field from placement basis
          const uvField = ctx.b.placement('uv',
            basisKind,
            vec2FieldType
          );
    
          // Decompose circleLayoutUV into opcode sequence:
          // u = extract(uvField, 0) — component 0 = X
          const u = ctx.b.extract(uvField, 0, floatFieldType);
    
          // Constants (one-cardinality — zipAuto/constructAuto handle one→many broadcasting)
          const const0 = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
          const const1 = ctx.b.constant(floatConst(1), canonicalType(FLOAT));
          const const0_5 = ctx.b.constant(floatConst(0.5), canonicalType(FLOAT));
          const twoPi = ctx.b.constant(floatConst(Math.PI * 2), canonicalType(FLOAT));
    
          // Opcodes
          const clamp = ctx.b.opcode(OpCode.Clamp);
          const add = ctx.b.opcode(OpCode.Add);
          const mul = ctx.b.opcode(OpCode.Mul);
          const cos = ctx.b.opcode(OpCode.Cos);
          const sin = ctx.b.opcode(OpCode.Sin);
    
          // u_clamped = clamp(u, 0, 1)
          const u_clamped = ctx.b.zipAuto([u, const0, const1], clamp, floatFieldType);
    
          // angle_base = add(u_clamped, phase)
          const angle_base = ctx.b.zipAuto([u_clamped, phaseInput.id], add, floatFieldType);
    
          // angle = mul(angle_base, twoPi)
          const angle = ctx.b.zipAuto([angle_base, twoPi], mul, floatFieldType);
    
          // x_raw = cos(angle), y_raw = sin(angle)
          const x_raw = ctx.b.mapAuto(angle, cos, floatFieldType);
          const y_raw = ctx.b.mapAuto(angle, sin, floatFieldType);
    
          // x_scaled = mul(x_raw, radius), y_scaled = mul(y_raw, radius)
          const x_scaled = ctx.b.zipAuto([x_raw, radiusInput.id], mul, floatFieldType);
          const y_scaled = ctx.b.zipAuto([y_raw, radiusInput.id], mul, floatFieldType);
    
          // x = add(x_scaled, 0.5), y = add(y_scaled, 0.5)
          const x = ctx.b.zipAuto([x_scaled, const0_5], add, floatFieldType);
          const y = ctx.b.zipAuto([y_scaled, const0_5], add, floatFieldType);
    
          const controlPointsField = ctx.b.constructAuto([x, y], controlPointsType);
    
          // rotation = angle (the circle angle per element, already computed)
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
