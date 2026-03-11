/**
 * DefaultSource Block
 *
 * Polymorphic source block inserted by normalization for unconnected inputs.
 * Output type resolves to match target port type via constraint propagation.
 * Lowering dispatches on resolved type to produce appropriate default values.
 *
 * // [LAW:one-source-of-truth] DefaultSource declares acceptance:'oneOnly' — the cardinality solver
 * // inserts Broadcast adapters when connecting to field ports.
 *
 * Policy table (one-cardinality values):
 * - float (scalar) → const(1) [identity for multiplication]
 * - int → const(0)
 * - bool → const(false)
 * - vec2 → const(0, 0)
 * - vec3 → const(0, 0, 0)
 * - color → HueRainbow(phaseA) [cycling rainbow via macro expansion]
 * - event (discrete) → eventNever [never fires]
 * - unresolved generic → error
 * - camera projection, shape handle → error
 */

import { registerBlock, requireBlockDef } from '../registry';
import type { LowerCtx } from '../registry';
import {
  canonicalType,
  canonicalScalar,
  payloadStride,
  FLOAT,
  COLOR,
  unitTurns,
  unitOklch,
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
// One-cardinality default helper
// ============================================================================

/**
 * Create a one-cardinality default constant for the given payload.
 * Returns the expression ID.
 */
function oneDefault(
  ctx: LowerCtx,
  payload: PayloadType,
): ValueExprId {
  switch (payload.kind) {
    case 'float':
      return ctx.b.constant({ kind: 'float', value: 1.0 }, canonicalScalar(FLOAT));
    case 'int':
      return ctx.b.constant({ kind: 'int', value: 0 }, canonicalScalar(payload));
    case 'bool':
      return ctx.b.constant({ kind: 'bool', value: false }, canonicalScalar(payload));
    case 'vec2':
      return ctx.b.constant({ kind: 'vec2', value: [0, 0] }, canonicalScalar(payload));
    case 'vec3':
      return ctx.b.constant({ kind: 'vec3', value: [0, 0, 0] }, canonicalScalar(payload));
    case 'color': {
      // Handled separately (HueRainbow macro) — should not reach here
      throw new Error('DefaultSource: color one-cardinality default must use lowerColorOne');
    }
    case 'cameraProjection':
      throw new Error(
        `DefaultSource: camera projection type requires explicit source (no meaningful default)`
      );
    default: {
      throw new Error(`DefaultSource: unsupported payload type: ${payload.kind}`);
    }
  }
}

// ============================================================================
// Block registration
// ============================================================================

export function register(): void {
  registerBlock({
    type: 'DefaultSource',
    label: 'Default Source',
    category: 'scalar',
    description: 'Polymorphic default value source (type-indexed dispatch)',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure', // Pure block (uses LowerSandbox for macro expansion)
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
  
      const payload: PayloadType = outType.payload;
      const temporal = requireInst(outType.extent.temporality, 'temporality');
  
      // Event-typed defaults are represented as "never fire" event streams.
      // [LAW:one-source-of-truth] Event semantics are declared on CanonicalType
      // (temporality=discrete, payload=bool, unit=none).
      if (temporal.kind === 'discrete') {
        if (payload.kind !== 'bool' || outType.unit.kind !== 'none') {
          throw new Error(
            `DefaultSource: invalid discrete output type (expected event bool+none, got payload=${payload.kind}, unit=${outType.unit.kind})`
          );
        }
        const neverId = ctx.b.eventNever();
        return {
          outputsById: {
            out: { id: neverId, slot: undefined, type: outType, stride: 0 },
          },
          effects: {
            slotRequests: [{ portId: 'out', type: outType }],
          },
        };
      }
  
      // ── One-cardinality path ───────────────────────────────────────────
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
          effects: {
            slotRequests: [{ portId: 'out', type: outType }],
          },
        };
      }
  
      const constId = oneDefault(ctx, payload);
      return {
        outputsById: {
          out: {
            id: constId,
            slot: undefined,
            type: outType,
            stride: payloadStride(outType.payload),
          },
        },
        effects: {
          slotRequests: [{ portId: 'out', type: outType }],
        },
      };
    },
  });
}
