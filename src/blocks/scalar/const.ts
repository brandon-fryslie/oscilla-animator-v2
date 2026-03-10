/**
 * Const Block
 *
 * Outputs a constant value (type inferred from target).
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';
import { canonicalType, type PayloadType, type CameraProjection, payloadStride, floatConst, intConst, boolConst, vec2Const, vec3Const, vec4Const, colorConst, cameraProjectionConst } from '../../core/canonical-types';
import { FLOAT, INT, BOOL, CAMERA_PROJECTION } from '../../core/canonical-types';
import { inferType, payloadVar, unitVar, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Const cardinality behavior is declared on CT/ICT.
const CONST_OUT_CARD = cardinalityVar(cardinalityVarId('const_out_cardinality'), {
  acceptance: 'oneOnly',
  instanceBinding: 'inherit',
});

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
export function register(): void {
  registerBlock({
    type: 'Const',
    label: 'Constant',
    category: 'scalar',
    description: 'Outputs a constant value (type inferred from target)',
    form: 'primitive',
    capability: 'pure',
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
      out: { label: 'Output', type: inferType(payloadVar('const_payload'), unitVar('const_out'), { cardinality: CONST_OUT_CARD }) },
    },
    lower: ({ ctx, config }) => {
      // Get resolved payload type from ctx.outTypes (populated from pass1 portTypes)
      const outType = ctx.outTypes[0];
      if (!outType) {
        throw new Error(`Const block missing resolved output type from pass1`);
      }
      const payloadType = outType.payload as PayloadType;
      const cfg = config as Readonly<Record<string, unknown>>;
      const hasValue = Object.prototype.hasOwnProperty.call(cfg, 'value');
      const rawValue = cfg.value;
  
      if (!hasValue || rawValue === undefined) {
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
          if (!Array.isArray(rawValue) || rawValue.length !== 2 ||
            typeof rawValue[0] !== 'number' || typeof rawValue[1] !== 'number') {
            throw new Error(`Const<vec2> requires [x, y] array of numbers, got ${JSON.stringify(rawValue)}`);
          }
          const val = rawValue;
  
          // Pure lowering: construct multi-component one value from scalar components
          const xSig = ctx.b.constantWithKey(floatConst(val[0]), canonicalType(FLOAT), ctx.instanceId);
          const ySig = ctx.b.constantWithKey(floatConst(val[1]), canonicalType(FLOAT), ctx.instanceId);
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
        case 'vec3': {
          if (!Array.isArray(rawValue) || rawValue.length !== 3 ||
            typeof rawValue[0] !== 'number' || typeof rawValue[1] !== 'number' || typeof rawValue[2] !== 'number') {
            throw new Error(`Const<vec3> requires [x, y, z] array of numbers, got ${JSON.stringify(rawValue)}`);
          }
          const val = rawValue;
  
          const x3Sig = ctx.b.constantWithKey(floatConst(val[0]), canonicalType(FLOAT), ctx.instanceId);
          const y3Sig = ctx.b.constantWithKey(floatConst(val[1]), canonicalType(FLOAT), ctx.instanceId);
          const z3Sig = ctx.b.constantWithKey(floatConst(val[2]), canonicalType(FLOAT), ctx.instanceId);
          const vec3Sig = ctx.b.construct([x3Sig, y3Sig, z3Sig], outType);
  
          return {
            outputsById: {
              out: { id: vec3Sig, slot: undefined, type: outType, stride, components: [x3Sig, y3Sig, z3Sig] },
            },
            effects: {
              slotRequests: [{ portId: 'out', type: outType }],
            },
          };
        }
        case 'vec4': {
          if (!Array.isArray(rawValue) || rawValue.length !== 4 ||
            typeof rawValue[0] !== 'number' || typeof rawValue[1] !== 'number' ||
            typeof rawValue[2] !== 'number' || typeof rawValue[3] !== 'number') {
            throw new Error(`Const<vec4> requires [x, y, z, w] array of numbers, got ${JSON.stringify(rawValue)}`);
          }
          const val = rawValue;
  
          const x4Sig = ctx.b.constantWithKey(floatConst(val[0]), canonicalType(FLOAT), ctx.instanceId);
          const y4Sig = ctx.b.constantWithKey(floatConst(val[1]), canonicalType(FLOAT), ctx.instanceId);
          const z4Sig = ctx.b.constantWithKey(floatConst(val[2]), canonicalType(FLOAT), ctx.instanceId);
          const w4Sig = ctx.b.constantWithKey(floatConst(val[3]), canonicalType(FLOAT), ctx.instanceId);
          const vec4Sig = ctx.b.construct([x4Sig, y4Sig, z4Sig, w4Sig], outType);
  
          return {
            outputsById: {
              out: { id: vec4Sig, slot: undefined, type: outType, stride, components: [x4Sig, y4Sig, z4Sig, w4Sig] },
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
  
          // Pure lowering: construct multi-component one value from scalar components
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
          const payloadKind: PayloadType['kind'] = payloadType.kind;
          throw new Error(`Unsupported payload type for Const: ${payloadKind}`);
        }
      }
    },
  });
}
