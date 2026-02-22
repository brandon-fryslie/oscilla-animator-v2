/**
 * AngleBetween Block
 *
 * Angle between vec3 vectors A and B (radians).
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, cardinalityVar, FLOAT, VEC3, unitRadians } from '../../core/canonical-types';
import { inferType, unitVar } from '../../core/inference-types';
import { OpCode } from '../../compiler/ir/types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const ANGLE_BETWEEN_CARD = cardinalityVar(cardinalityVarId('angle_between_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'AngleBetween',
    label: 'Angle Between',
    category: 'math',
    description: 'Angle between vec3 vectors (radians)',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      a: { label: 'A', type: inferType(VEC3, unitVar('angle_between_U'), { cardinality: ANGLE_BETWEEN_CARD }) },
      b: { label: 'B', type: inferType(VEC3, unitVar('angle_between_U'), { cardinality: ANGLE_BETWEEN_CARD }) },
    },
    outputs: {
      out: { label: 'Out', type: canonicalType(FLOAT, unitRadians(), { cardinality: ANGLE_BETWEEN_CARD }) },
    },
    lower: ({ ctx, inputsById }) => {
      const a = inputsById.a;
      const b = inputsById.b;
      if (!a || !b) throw new Error('AngleBetween requires a and b inputs');
  
      const outType = ctx.outTypes[0];
      const scalarType = { ...outType, payload: FLOAT, unit: a.type.unit };
  
      const mul = ctx.b.opcode(OpCode.Mul);
      const sub = ctx.b.opcode(OpCode.Sub);
      const add = ctx.b.opcode(OpCode.Add);
      const sqrt = ctx.b.opcode(OpCode.Sqrt);
      const atan2 = ctx.b.opcode(OpCode.Atan2);
  
      const ax = ctx.b.extract(a.id, 0, scalarType);
      const ay = ctx.b.extract(a.id, 1, scalarType);
      const az = ctx.b.extract(a.id, 2, scalarType);
      const bx = ctx.b.extract(b.id, 0, scalarType);
      const by = ctx.b.extract(b.id, 1, scalarType);
      const bz = ctx.b.extract(b.id, 2, scalarType);
  
      const dot = ctx.b.zipAuto([
        ctx.b.zipAuto([ctx.b.zipAuto([ax, bx], mul, scalarType), ctx.b.zipAuto([ay, by], mul, scalarType)], add, scalarType),
        ctx.b.zipAuto([az, bz], mul, scalarType),
      ], add, scalarType);
  
      const cx = ctx.b.zipAuto([ctx.b.zipAuto([ay, bz], mul, scalarType), ctx.b.zipAuto([az, by], mul, scalarType)], sub, scalarType);
      const cy = ctx.b.zipAuto([ctx.b.zipAuto([az, bx], mul, scalarType), ctx.b.zipAuto([ax, bz], mul, scalarType)], sub, scalarType);
      const cz = ctx.b.zipAuto([ctx.b.zipAuto([ax, by], mul, scalarType), ctx.b.zipAuto([ay, bx], mul, scalarType)], sub, scalarType);
  
      const crossMagSq = ctx.b.zipAuto([
        ctx.b.zipAuto([ctx.b.zipAuto([cx, cx], mul, scalarType), ctx.b.zipAuto([cy, cy], mul, scalarType)], add, scalarType),
        ctx.b.zipAuto([cz, cz], mul, scalarType),
      ], add, scalarType);
      const crossMag = ctx.b.mapAuto(crossMagSq, sqrt, scalarType);
  
      const angle = ctx.b.zipAuto([crossMag, dot], atan2, outType);
  
      return {
        outputsById: {
          out: { id: angle, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
        },
        effects: {
          slotRequests: [{ portId: 'out', type: outType }],
        },
      };
    },
  });
}
