/**
 * DefaultSource Block
 *
 * Polymorphic source block inserted by normalization for unconnected inputs.
 * Output type resolves to match target port type via constraint propagation.
 * Lowering dispatches on resolved type to produce appropriate default values.
 *
 * // [LAW:one-source-of-truth] DefaultSource is signalOnly — the cardinality solver
 * // inserts Broadcast adapters when connecting to field ports.
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
 */

import { registerBlock, requireBlockDef } from '../registry';
import type { LowerCtx } from '../registry';
import {
  canonicalType,
  canonicalSignal,
  payloadStride,
  FLOAT,
  COLOR,
  unitTurns,
  unitHsl,
  requireInst,
} from '../../core/canonical-types';
import type { PayloadType, CanonicalType } from '../../core/canonical-types';
import { isPayloadVar, payloadVar, unitVar, inferType, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { LowerSandbox } from '../../compiler/ir/LowerSandbox';
import type { ValueExprId } from '../../compiler/ir/value-expr';

// [LAW:one-source-of-truth] DefaultSource cardinality policy is declared on CT/ICT.
const DEFAULT_SOURCE_OUT_CARD = cardinalityVar(cardinalityVarId('default_source_out_cardinality'), {
  acceptance: 'oneOnly',
  instanceBinding: 'inherit',
});

// ============================================================================
// Signal default helper
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
    cardinalityMode: 'signalOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  inputs: {},
  outputs: {
    // Polymorphic output — payload and unit resolve via constraint propagation
    // from the target port that this DefaultSource is wired to.
    out: {
      label: 'Output',
      type: inferType(payloadVar('ds_payload'), unitVar('ds_unit'), { cardinality: DEFAULT_SOURCE_OUT_CARD }),
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

    // TODO: REMOVE THIS
    if (temporal.kind === 'discrete') {
      const neverId = ctx.b.eventNever();
      return {
        outputsById: {
          out: { id: neverId, slot: undefined, type: outType, stride: 0 },
        },
      };
    }

    // ── Signal path (cardinality one) ──────────────────────────────────
    if (payload.kind === 'color') {
      // Color → HueRainbow(phaseA) via macro expansion
      const sandbox = new LowerSandbox(ctx.b, ctx.instanceId, ctx.instances);
      const phaseType = canonicalType(FLOAT);
      const phaseA = ctx.b.time('phaseA', phaseType);
      // [LAW:one-source-of-truth] Use solver-resolved output type from ctx, not raw block-def types.
      requireBlockDef('HueRainbow');
      const rainbowOutTypes = [outType];
      const rainbowOutputs = sandbox.lowerBlock('HueRainbow', { t: phaseA }, {}, rainbowOutTypes);

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
