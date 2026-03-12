/**
 * DefaultSourceField Block
 *
 * Field-cardinality default source for unconnected field inputs.
 * Inserted by the cardinality adapter policy when a one-only DefaultSource
 * connects to a field port (ClampManyConflict resolution).
 *
 * // [LAW:one-type-per-behavior] DefaultSource = one defaults, DefaultSourceField = field defaults.
 * // [LAW:single-enforcer] Cardinality adapter policy is the single place that decides to use this block.
 *
 * Instance resolution:
 * - Uses ctx.inferredInstance from sibling lookup (e.g., Array on same downstream block)
 * - Per-element defaults (rainbow, circular) when instance is available
 * - Broadcast of one constant as fallback
 */

import { registerBlock } from '../registry';
import type { LowerCtx } from '../registry';
import {
  canonicalType,
  canonicalScalar,
  payloadStride,
  FLOAT,
  COLOR,
  unitTurns,
  unitOklch,
} from '../../core/canonical-types';
import type { PayloadType, CanonicalType } from '../../core/canonical-types';
import { isPayloadVar, payloadVar, unitVar, inferType, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { OpCode } from '../../compiler/ir/types';
import type { ValueExprId } from '../../compiler/ir/value-expr';
import { rewriteFieldType } from '../layout/_helpers';
import { promoteToMany } from '../lower-utils';

// ============================================================================
// Field default helpers (per-element variation)
// ============================================================================

/**
 * Create a per-element normalizedIndex field plus a broadcast phaseA field,
 * then add them to produce a per-element phase that shifts over time.
 * Returns a field expression where each element has a unique value in [0,1)+time.
 */
function perElementPhase(ctx: LowerCtx, outType: CanonicalType): ValueExprId {
  const floatFieldType = { ...canonicalScalar(FLOAT), extent: outType.extent };
  const normIdx = ctx.b.intrinsic('normalizedIndex', floatFieldType);

  const phaseValue = ctx.b.time('phaseA', canonicalScalar(FLOAT, unitTurns()));
  const phaseField = promoteToMany(phaseValue, floatFieldType, ctx.b);

  const addFn = ctx.b.opcode(OpCode.Add);
  return ctx.b.zipAuto([normIdx, phaseField], addFn, floatFieldType);
}

/**
 * vec3 field default: circular arrangement that rotates over time.
 * x = cos((normalizedIndex + phaseA) * 2pi)
 * y = sin((normalizedIndex + phaseA) * 2pi)
 * z = 0
 */
function fieldVec3Default(ctx: LowerCtx, outType: CanonicalType): ValueExprId {
  const floatFieldType = { ...canonicalScalar(FLOAT), extent: outType.extent };
  const phase = perElementPhase(ctx, outType);

  const tau = ctx.b.constant({ kind: 'float', value: Math.PI * 2 }, canonicalScalar(FLOAT));
  const tauField = promoteToMany(tau, floatFieldType, ctx.b);
  const mulFn = ctx.b.opcode(OpCode.Mul);
  const angle = ctx.b.zipAuto([phase, tauField], mulFn, floatFieldType);

  const cosFn = ctx.b.opcode(OpCode.Cos);
  const sinFn = ctx.b.opcode(OpCode.Sin);
  const x = ctx.b.mapAuto(angle, cosFn, floatFieldType);
  const y = ctx.b.mapAuto(angle, sinFn, floatFieldType);

  const zero = ctx.b.constant({ kind: 'float', value: 0 }, canonicalScalar(FLOAT));
  const z = promoteToMany(zero, floatFieldType, ctx.b);

  return ctx.b.construct([x, y, z], outType);
}

/**
 * color field default: per-element rainbow that shifts over time.
 * hue = normalizedIndex + phaseA
 * chroma = 0.8, lightness = 0.5, alpha = 1.0
 * Output is OKLCH — conversion to RGB happens at render boundary.
 */
function fieldColorDefault(ctx: LowerCtx, outType: CanonicalType): ValueExprId {
  const floatFieldType = { ...canonicalScalar(FLOAT), extent: outType.extent };
  const hue = perElementPhase(ctx, outType);

  const chroma = ctx.b.constant({ kind: 'float', value: 0.8 }, canonicalScalar(FLOAT));
  const light = ctx.b.constant({ kind: 'float', value: 0.5 }, canonicalScalar(FLOAT));
  const alpha = ctx.b.constant({ kind: 'float', value: 1.0 }, canonicalScalar(FLOAT));
  const chromaField = promoteToMany(chroma, floatFieldType, ctx.b);
  const lightField = promoteToMany(light, floatFieldType, ctx.b);
  const alphaField = promoteToMany(alpha, floatFieldType, ctx.b);

  const oklchType: CanonicalType = { ...canonicalType(COLOR, unitOklch()), extent: outType.extent };
  return ctx.b.construct([hue, chromaField, lightField, alphaField], oklchType);
}

/**
 * One-cardinality constant for the given payload, then broadcast to field.
 */
function fieldBroadcastDefault(
  ctx: LowerCtx,
  payload: PayloadType,
  outType: CanonicalType,
): ValueExprId {
  let oneId: ValueExprId;
  switch (payload.kind) {
    case 'float':
      oneId = ctx.b.constant({ kind: 'float', value: 1.0 }, canonicalScalar(FLOAT));
      break;
    case 'int':
      oneId = ctx.b.constant({ kind: 'float', value: 0 }, canonicalScalar(FLOAT));
      break;
    case 'bool':
      oneId = ctx.b.constant({ kind: 'float', value: 0 }, canonicalScalar(FLOAT));
      break;
    case 'vec2':
      oneId = ctx.b.constant({ kind: 'vec2', value: [0, 0] }, canonicalScalar(payload));
      break;
    case 'vec3':
      oneId = ctx.b.constant({ kind: 'vec3', value: [0, 0, 0] }, canonicalScalar(payload));
      break;
    default:
      oneId = ctx.b.constant({ kind: 'float', value: 0 }, canonicalScalar(FLOAT));
      break;
  }
  return promoteToMany(oneId, outType, ctx.b);
}

// ============================================================================
// Block registration
// ============================================================================

// [LAW:one-source-of-truth] Field default cardinality behavior is declared on CT/ICT.
const DEFAULT_SOURCE_FIELD_OUT_CARD = cardinalityVar(cardinalityVarId('default_source_field_out'), {
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'DefaultSourceField',
    label: 'Default Source (Field)',
    category: 'field',
    description: 'Polymorphic field-cardinality default value source',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {},
    outputs: {
      // Polymorphic output — payload and unit resolve via constraint propagation
      out: {
        label: 'Output',
        type: inferType(payloadVar('dsf_payload'), unitVar('dsf_unit'), { cardinality: DEFAULT_SOURCE_FIELD_OUT_CARD }),
      },
    },
    lower: ({ ctx }) => {
      let outType = ctx.outTypes[0];
  
      if (isPayloadVar(outType.payload)) {
        throw new Error(
          `DefaultSourceField: output type is still unresolved (payload var). ` +
          `This indicates a type inference failure upstream.`
        );
      }
  
      const payload = outType.payload as PayloadType;
  
      // Rewrite output type with real backend instance if available
      // (inferInstanceContext provides this via sibling lookup through shared downstream targets)
      if (ctx.inferredInstance) {
        outType = rewriteFieldType(outType, ctx.inferredInstance, ctx.instances);
      }
  
      // Dispatch on payload for per-element field defaults
      let id: ValueExprId;
      switch (payload.kind) {
        case 'vec3':
          id = fieldVec3Default(ctx, outType);
          break;
        case 'color':
          id = fieldColorDefault(ctx, outType);
          break;
        default:
          id = fieldBroadcastDefault(ctx, payload, outType);
          break;
      }
  
      return {
        outputsById: {
          out: { id, type: outType, stride: payloadStride(outType.payload) },
        },
        effects: {
          slotRequests: [{ portId: 'out', type: outType }],
        },
        instanceContext: ctx.inferredInstance,
      };
    },
  });
}
