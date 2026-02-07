/**
 * Const Block
 *
 * Outputs a constant value (type inferred from target).
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';
import { canonicalType, type PayloadType, type CameraProjection, payloadStride, floatConst, intConst, boolConst, vec2Const, colorConst, cameraProjectionConst } from '../../core/canonical-types';
import { FLOAT, INT, BOOL, CAMERA_PROJECTION } from '../../core/canonical-types';
import { inferType, payloadVar, unitVar } from '../../core/inference-types';

/**
 * Payload-Generic constant block.
 *
 * This block outputs a constant value with type determined by context.
 * The payload type and unit are resolved by pass1 constraint solver
 * through constraint propagation from connected ports.
 *
 * Payload-Generic Contract (per spec §1):
 * - Closed admissible payload set: float, int, bool, vec2, color
 * - Per-payload specialization is total (see lower function)
 * - No implicit coercions
 * - Deterministic resolution via payloadType param
 *
 * Semantics: typeSpecific (each payload has different value structure)
 */
registerBlock({
  type: 'Const',
  label: 'Constant',
  category: 'signal',
  description: 'Outputs a constant value (type inferred from target)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  payload: {
    allowedPayloads: {
      out: ALL_CONCRETE_PAYLOADS,
    },
    // Const has no inputs that affect output type - it's a source block
    // The output type is determined by context (what it connects to)
    combinations: ALL_CONCRETE_PAYLOADS.map(p => ({
      inputs: [] as PayloadType[],
      output: p,
    })),
    semantics: 'typeSpecific',
  },
  inputs: {
    value: {
      type: canonicalType(FLOAT),
      defaultValue: 0,
      exposedAsPort: false,
    },
  },
  outputs: {
    // Unit is polymorphic (UnitVar) - resolved by pass1 constraint solver
    // Payload is polymorphic (payloadVar) - resolved by pass1 constraint solver
    out: { label: 'Output', type: inferType(payloadVar('const_payload'), unitVar('const_out')) },
  },
  lower: ({ ctx, config }) => {
    // Get resolved payload type from ctx.outTypes (populated from pass1 portTypes)
    const outType = ctx.outTypes[0];
    if (!outType) {
      throw new Error(`Const block missing resolved output type from pass1`);
    }
    const payloadType = outType.payload as PayloadType;
    const rawValue = config?.value;

    if (rawValue === undefined) {
      throw new Error(
        `Const block missing value. Value must be provided.`
      );
    }

    const stride = payloadStride(outType.payload);

    switch (payloadType.kind) {
      case 'float': {
        if (typeof rawValue !== 'number') {
          throw new Error(`Const<float> requires number value, got ${typeof rawValue}`);
        }
        const id = ctx.b.constantWithKey(floatConst(rawValue), outType, ctx.instanceId);
        return {
          outputsById: {
            out: { id, slot: undefined, type: outType, stride },
          },
          effects: {
            slotRequests: [{ portId: 'out', type: outType }],
          },
        };
      }
      case 'int': {
        if (typeof rawValue !== 'number') {
          throw new Error(`Const<${payloadType.kind}> requires number value, got ${typeof rawValue}`);
        }
        const id = ctx.b.constantWithKey(intConst(Math.floor(rawValue)), outType, ctx.instanceId);
        return {
          outputsById: {
            out: { id, slot: undefined, type: outType, stride },
          },
          effects: {
            slotRequests: [{ portId: 'out', type: outType }],
          },
        };
      }
      case 'bool': {
        if (typeof rawValue !== 'boolean' && typeof rawValue !== 'number') {
          throw new Error(`Const<bool> requires boolean or number value, got ${typeof rawValue}`);
        }
        const id = ctx.b.constantWithKey(boolConst(Boolean(rawValue)), outType, ctx.instanceId);
        return {
          outputsById: {
            out: { id, slot: undefined, type: outType, stride },
          },
          effects: {
            slotRequests: [{ portId: 'out', type: outType }],
          },
        };
      }
      case 'vec2': {
        const val = rawValue as { x?: number; y?: number };
        if (typeof val !== 'object' || val === null) {
          throw new Error(`Const<vec2> requires {x, y} object, got ${typeof rawValue}`);
        }
        if (typeof val.x !== 'number' || typeof val.y !== 'number') {
          throw new Error(`Const<vec2> requires {x: number, y: number}, got {x: ${typeof val.x}, y: ${typeof val.y}}`);
        }

        // Pure lowering: construct multi-component signal from scalar components
        const xSig = ctx.b.constantWithKey(floatConst(val.x), canonicalType(FLOAT), ctx.instanceId);
        const ySig = ctx.b.constantWithKey(floatConst(val.y), canonicalType(FLOAT), ctx.instanceId);
        const vec2Sig = ctx.b.construct([xSig, ySig], outType);

        return {
          outputsById: {
            out: { id: vec2Sig, slot: undefined, type: outType, stride, components: [xSig, ySig] },
          },
          effects: {
            slotRequests: [{ portId: 'out', type: outType }],
          },
        };
      }
      case 'color': {
        const val = rawValue as { r?: number; g?: number; b?: number; a?: number };
        if (typeof val !== 'object' || val === null) {
          throw new Error(`Const<color> requires {r, g, b, a} object, got ${typeof rawValue}`);
        }
        if (typeof val.r !== 'number' || typeof val.g !== 'number' ||
          typeof val.b !== 'number' || typeof val.a !== 'number') {
          throw new Error(`Const<color> requires {r, g, b, a} as numbers`);
        }

        // Pure lowering: construct multi-component signal from scalar components
        const rSig = ctx.b.constantWithKey(floatConst(val.r), canonicalType(FLOAT), ctx.instanceId);
        const gSig = ctx.b.constantWithKey(floatConst(val.g), canonicalType(FLOAT), ctx.instanceId);
        const bSig = ctx.b.constantWithKey(floatConst(val.b), canonicalType(FLOAT), ctx.instanceId);
        const aSig = ctx.b.constantWithKey(floatConst(val.a), canonicalType(FLOAT), ctx.instanceId);
        const colorSig = ctx.b.construct([rSig, gSig, bSig, aSig], outType);

        return {
          outputsById: {
            out: { id: colorSig, slot: undefined, type: outType, stride, components: [rSig, gSig, bSig, aSig] },
          },
          effects: {
            slotRequests: [{ portId: 'out', type: outType }],
          },
        };
      }
      case 'cameraProjection': {
        if (typeof rawValue !== 'string') {
          throw new Error(`Const<cameraProjection> requires string value, got ${typeof rawValue}`);
        }
        const id = ctx.b.constantWithKey(cameraProjectionConst(rawValue as CameraProjection), outType, ctx.instanceId);
        return {
          outputsById: {
            out: { id, slot: undefined, type: outType, stride },
          },
          effects: {
            slotRequests: [{ portId: 'out', type: outType }],
          },
        };
      }
      default: {
        throw new Error(`Unsupported payload type for Const: ${(payloadType as any).kind}`);
      }
    }
  },
});
