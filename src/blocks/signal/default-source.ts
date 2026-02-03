/**
 * DefaultSource Block
 *
 * Polymorphic source block inserted by normalization for unconnected inputs.
 * Output type resolves to match target port type via constraint propagation.
 * Lowering dispatches on resolved type to produce appropriate default values.
 *
 * Policy table:
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

import { registerBlock } from '../registry';
import {
  canonicalType,
  payloadStride,
  FLOAT,
  requireInst,
} from '../../core/canonical-types';
import { isPayloadVar } from '../../core/inference-types';
import { LowerSandbox } from '../../compiler/ir/LowerSandbox';
import type { PayloadType } from '../../core/canonical-types';

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
    // Generic output type — resolves via constraint propagation from target port
    // Using canonicalType with generic payload/unit (inference will handle vars)
    out: {
      label: 'Output',
      type: canonicalType(FLOAT), // Will be overridden by type inference
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

    // Dispatch on resolved payload type
    const payload = outType.payload as PayloadType;
    const temporal = requireInst(outType.extent.temporality, 'temporality');

    // Check for event type (discrete temporality)
    if (temporal.kind === 'discrete') {
      // Event — return eventNever (never fires)
      const neverId = ctx.b.eventNever();
      return {
        outputsById: {
          out: { id: neverId, slot: undefined, type: outType, stride: 0 },
        },
      };
    }

    // Dispatch on payload kind
    switch (payload.kind) {
      case 'float': {
        // Float → const(1) [identity for multiplication]
        const constId = ctx.b.constant({ kind: 'float', value: 1.0 }, outType);
        return {
          outputsById: {
            out: { id: constId, slot: undefined, type: outType, stride: 1 },
          },
        };
      }

      case 'int': {
        // Int → const(0)
        const constId = ctx.b.constant({ kind: 'int', value: 0 }, outType);
        return {
          outputsById: {
            out: { id: constId, slot: undefined, type: outType, stride: 1 },
          },
        };
      }

      case 'bool': {
        // Bool → const(false)
        const constId = ctx.b.constant({ kind: 'bool', value: false }, outType);
        return {
          outputsById: {
            out: { id: constId, slot: undefined, type: outType, stride: 1 },
          },
        };
      }

      case 'vec2': {
        // Vec2 → const(0, 0)
        const constId = ctx.b.constant({ kind: 'vec2', value: [0, 0] }, outType);
        return {
          outputsById: {
            out: { id: constId, slot: undefined, type: outType, stride: 2 },
          },
        };
      }

      case 'vec3': {
        // Vec3 → const(0, 0, 0)
        const constId = ctx.b.constant({ kind: 'vec3', value: [0, 0, 0] }, outType);
        return {
          outputsById: {
            out: { id: constId, slot: undefined, type: outType, stride: 3 },
          },
        };
      }

      case 'color': {
        // Color → HueRainbow(phaseA) via macro expansion
        const sandbox = new LowerSandbox(
          ctx.b,
          ctx.blockType,
          ctx.instanceId
        );

        // Get phaseA rail as input to HueRainbow
        const phaseType = canonicalType(FLOAT);
        const phaseA = ctx.b.time('phaseA', phaseType);

        // Invoke HueRainbow as a pure macro
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

      case 'cameraProjection': {
        // Camera projection → error (no sensible default)
        throw new Error(
          `DefaultSource: camera projection type requires explicit source ` +
          `(no meaningful default)`
        );
      }

      default: {
        // Unknown/unsupported payload type → error
        throw new Error(
          `DefaultSource: unsupported payload type: ${(payload as any).kind}`
        );
      }
    }
  },
});
