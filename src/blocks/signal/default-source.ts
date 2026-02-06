/**
 * DefaultSource Block
 *
 * Polymorphic source block inserted by normalization for unconnected inputs.
 * Output type resolves to match target port type via constraint propagation.
 * Lowering dispatches on resolved type to produce appropriate default values.
 *
 * Policy table (signals — cardinality one):
 * - float (scalar) → const(1) [identity for multiplication]
 * - int → const(0)
 * - bool → const(false)
 * - vec2 → const(0, 0)
 * - vec3 → const(0, 0, 0)
 * - color → HueRainbow(phaseA) [cycling rainbow via macro expansion]
 * - event (discrete) → eventNever [never fires]
 * - unresolved generic → error
 * - camera projection, shape2d → error
 *
 * Policy table (fields — cardinality many):
 * - vec3 → circular arrangement from normalizedIndex + phaseA
 * - color → per-element rainbow from normalizedIndex + phaseA
 * - other → broadcast of signal default
 */

import { registerBlock } from '../registry';
import type { LowerCtx } from '../registry';
import {
  canonicalType,
  canonicalSignal,
  payloadStride,
  FLOAT,
  COLOR,
  requireInst,
  isMany,
  unitTurns,
  unitHsl,
  withInstance,
  instanceRef,
} from '../../core/canonical-types';
import type { PayloadType, CanonicalType } from '../../core/canonical-types';
import { isPayloadVar, payloadVar, unitVar, inferType } from '../../core/inference-types';
import { LowerSandbox } from '../../compiler/ir/LowerSandbox';
import { OpCode } from '../../compiler/ir/types';
import type { ValueExprId } from '../../compiler/ir/value-expr';

// ============================================================================
// Field default helpers (cardinality many)
//
// TODO(oscilla-animator-v2-cpc): Remove this entire section when cardinality
// typevars are fully implemented. At that point DefaultSource will always
// produce signal-cardinality output and the compiler's cardinality solver will
// insert broadcast/lift ops automatically. The manual field construction here
// (perElementPhase, fieldVec3Default, fieldColorDefault, fieldBroadcastDefault)
// is a temporary workaround.
// ============================================================================

/**
 * Create a per-element normalizedIndex field plus a broadcast phaseA field,
 * then add them to produce a per-element phase that shifts over time.
 * Returns a field expression where each element has a unique value in [0,1)+time.
 */
function perElementPhase(ctx: LowerCtx, outType: CanonicalType): ValueExprId {
  // normalizedIndex: float field (0→1 per element)
  const floatFieldType = { ...canonicalSignal(FLOAT), extent: outType.extent };
  const normIdx = ctx.b.intrinsic('normalizedIndex', floatFieldType);

  // phaseA: float signal (time) → broadcast to field
  const phaseSignal = ctx.b.time('phaseA', canonicalSignal(FLOAT, unitTurns()));
  const phaseField = ctx.b.broadcast(phaseSignal, floatFieldType);

  // per-element phase = normalizedIndex + phaseA
  const addFn = ctx.b.opcode(OpCode.Add);
  return ctx.b.kernelZip([normIdx, phaseField], addFn, floatFieldType);
}

/**
 * vec3 field default: circular arrangement that rotates over time.
 * x = cos((normalizedIndex + phaseA) * 2π)
 * y = sin((normalizedIndex + phaseA) * 2π)
 * z = 0
 */
function fieldVec3Default(ctx: LowerCtx, outType: CanonicalType): ValueExprId {
  const floatFieldType = { ...canonicalSignal(FLOAT), extent: outType.extent };

  const phase = perElementPhase(ctx, outType);

  // angle = phase * 2π
  const tau = ctx.b.constant({ kind: 'float', value: Math.PI * 2 }, canonicalSignal(FLOAT));
  const tauField = ctx.b.broadcast(tau, floatFieldType);
  const mulFn = ctx.b.opcode(OpCode.Mul);
  const angle = ctx.b.kernelZip([phase, tauField], mulFn, floatFieldType);

  // x = cos(angle), y = sin(angle)
  const cosFn = ctx.b.opcode(OpCode.Cos);
  const sinFn = ctx.b.opcode(OpCode.Sin);
  const x = ctx.b.kernelMap(angle, cosFn, floatFieldType);
  const y = ctx.b.kernelMap(angle, sinFn, floatFieldType);

  // z = 0 (broadcast)
  const zero = ctx.b.constant({ kind: 'float', value: 0 }, canonicalSignal(FLOAT));
  const z = ctx.b.broadcast(zero, floatFieldType);

  return ctx.b.construct([x, y, z], outType);
}

/**
 * color field default: per-element rainbow that shifts over time.
 * hue = normalizedIndex + phaseA (each element different hue, all shift with time)
 * saturation = 0.8, lightness = 0.5, alpha = 1.0
 */
function fieldColorDefault(ctx: LowerCtx, outType: CanonicalType): ValueExprId {
  const floatFieldType = { ...canonicalSignal(FLOAT), extent: outType.extent };

  const hue = perElementPhase(ctx, outType);

  // Fixed HSL components → broadcast to field
  const sat = ctx.b.constant({ kind: 'float', value: 0.8 }, canonicalSignal(FLOAT));
  const light = ctx.b.constant({ kind: 'float', value: 0.5 }, canonicalSignal(FLOAT));
  const alpha = ctx.b.constant({ kind: 'float', value: 1.0 }, canonicalSignal(FLOAT));
  const satField = ctx.b.broadcast(sat, floatFieldType);
  const lightField = ctx.b.broadcast(light, floatFieldType);
  const alphaField = ctx.b.broadcast(alpha, floatFieldType);

  // Construct HSL color field
  const hslType: CanonicalType = { ...canonicalType(COLOR, unitHsl()), extent: outType.extent };
  const hsl = ctx.b.construct([hue, satField, lightField, alphaField], hslType);

  // Convert HSL → RGB
  return ctx.b.hslToRgb(hsl, outType);
}

/**
 * Generic field default: broadcast the signal-level constant to a field.
 */
function fieldBroadcastDefault(
  ctx: LowerCtx,
  signalId: ValueExprId,
  outType: CanonicalType
): ValueExprId {
  return ctx.b.broadcast(signalId, outType);
}

// ============================================================================
// Signal default helper (existing logic, extracted for reuse)
// ============================================================================

/**
 * Create a signal-cardinality default constant for the given payload.
 * Returns the expression ID.
 */
function signalDefault(
  ctx: LowerCtx,
  payload: PayloadType,
): ValueExprId {
  switch (payload.kind) {
    case 'float':
      return ctx.b.constant({ kind: 'float', value: 1.0 }, canonicalSignal(FLOAT));
    case 'int':
      return ctx.b.constant({ kind: 'int', value: 0 }, canonicalSignal(payload));
    case 'bool':
      return ctx.b.constant({ kind: 'bool', value: false }, canonicalSignal(payload));
    case 'vec2':
      return ctx.b.constant({ kind: 'vec2', value: [0, 0] }, canonicalSignal(payload));
    case 'vec3':
      return ctx.b.constant({ kind: 'vec3', value: [0, 0, 0] }, canonicalSignal(payload));
    case 'color': {
      // Handled separately (HueRainbow macro) — should not reach here
      throw new Error('DefaultSource: color signal default must use lowerColorSignal');
    }
    case 'cameraProjection':
      throw new Error(
        `DefaultSource: camera projection type requires explicit source (no meaningful default)`
      );
    default:
      throw new Error(`DefaultSource: unsupported payload type: ${(payload as any).kind}`);
  }
}

// ============================================================================
// Block registration
// ============================================================================

registerBlock({
  type: 'DefaultSource',
  label: 'Default Source',
  category: 'signal',
  description: 'Polymorphic default value source (type-indexed dispatch)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure', // Pure block (uses LowerSandbox for macro expansion)
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {},
  outputs: {
    // Polymorphic output — payload and unit resolve via constraint propagation
    // from the target port that this DefaultSource is wired to.
    out: {
      label: 'Output',
      type: inferType(payloadVar('ds_payload'), unitVar('ds_unit')),
    },
  },
  lower: ({ ctx }) => {
    const outType = ctx.outTypes[0];

    // Check if type is still unresolved (payload or unit var)
    if (isPayloadVar(outType.payload)) {
      throw new Error(
        `DefaultSource: output type is still unresolved (payload var). ` +
        `This indicates a type inference failure upstream.`
      );
    }

    const payload = outType.payload as PayloadType;
    const temporal = requireInst(outType.extent.temporality, 'temporality');
    const cardinality = requireInst(outType.extent.cardinality, 'cardinality');

    // ── Event path (discrete temporality) ──────────────────────────────
    if (temporal.kind === 'discrete') {
      const neverId = ctx.b.eventNever();
      return {
        outputsById: {
          out: { id: neverId, slot: undefined, type: outType, stride: 0 },
        },
      };
    }

    // ── Field path (cardinality many) ──────────────────────────────────
    // TODO(oscilla-animator-v2-cpc): Remove this branch when cardinality
    // typevars are fully implemented. DefaultSource should only emit signals;
    // the cardinality solver will handle broadcast/lift automatically.
    if (isMany(cardinality)) {
      // Create instance for field defaults (required by intrinsics like normalizedIndex)
      // Extract domain from cardinality's instance ref
      const card = requireInst(outType.extent.cardinality, 'cardinality');
      if (card.kind !== 'many') {
        throw new Error('DefaultSource: field path requires cardinality=many');
      }
      const domainTypeId = card.instance.domainTypeId;

      // Create a default circle shape for the instance using pure Ellipse block
      const sandbox = new LowerSandbox(ctx.b, ctx.blockType, ctx.instanceId, ctx.instances);

      // Create shape parameter constants (rx, ry, rotation)
      // These are just expression IDs - no slots needed (sandbox handles Ellipse's slot requests)
      const rxConst = ctx.b.constant({ kind: 'float', value: 0.05 }, canonicalSignal(FLOAT));
      const ryConst = ctx.b.constant({ kind: 'float', value: 0.05 }, canonicalSignal(FLOAT));
      const rotationConst = ctx.b.constant({ kind: 'float', value: 0 }, canonicalSignal(FLOAT));

      // Ellipse is pure, so we can lower it directly without DefaultSource recursion
      const shapeOutputs = sandbox.lowerBlock('Ellipse', { rx: rxConst, ry: ryConst, rotation: rotationConst }, { rx: 0.05, ry: 0.05, rotation: 0 });
      const shapeId = shapeOutputs.shape;

      // Use a default count of 8 elements
      const defaultCount = ctx.b.constant({ kind: 'int', value: 8 }, canonicalSignal({ kind: 'int' }));
      const instanceId = ctx.b.createInstance(domainTypeId, defaultCount, shapeId);

      // Update output type with actual instance reference
      const ref = instanceRef(domainTypeId as string, instanceId as string);
      const actualOutType = withInstance(outType, ref);

      let id: ValueExprId;

      switch (payload.kind) {
        case 'vec3':
          id = fieldVec3Default(ctx, actualOutType);
          break;
        case 'color':
          id = fieldColorDefault(ctx, actualOutType);
          break;
        default: {
          // For other types, broadcast the signal-level default
          const sigId = signalDefault(ctx, payload);
          id = fieldBroadcastDefault(ctx, sigId, actualOutType);
          break;
        }
      }

      return {
        outputsById: {
          out: { id, type: actualOutType, stride: payloadStride(actualOutType.payload) },
        },
        instanceContext: instanceId,
      };
    }

    // ── Signal path (cardinality one) ──────────────────────────────────
    if (payload.kind === 'color') {
      // Color → HueRainbow(phaseA) via macro expansion
      const sandbox = new LowerSandbox(ctx.b, ctx.blockType, ctx.instanceId, ctx.instances);
      const phaseType = canonicalType(FLOAT);
      const phaseA = ctx.b.time('phaseA', phaseType);
      const rainbowOutputs = sandbox.lowerBlock('HueRainbow', { t: phaseA }, {});

      return {
        outputsById: {
          out: {
            id: rainbowOutputs.out,
            slot: undefined,
            type: outType,
            stride: payloadStride(outType.payload),
          },
        },
      };
    }

    const constId = signalDefault(ctx, payload);
    return {
      outputsById: {
        out: {
          id: constId,
          slot: undefined,
          type: outType,
          stride: payloadStride(outType.payload),
        },
      },
    };
  },
});
