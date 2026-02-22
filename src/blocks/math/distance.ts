/**
 * Distance Block
 *
 * Euclidean distance between vec3 points A and B.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, cardinalityVar, FLOAT, VEC3 } from '../../core/canonical-types';
import { inferType, unitVar } from '../../core/inference-types';
import { OpCode } from '../../compiler/ir/types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const DISTANCE_CARD = cardinalityVar(cardinalityVarId('distance_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'Distance',
    label: 'Distance',
    category: 'math',
    description: 'Distance between vec3 points A and B',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      a: { label: 'A', type: inferType(VEC3, unitVar('distance_U'), { cardinality: DISTANCE_CARD }) },
      b: { label: 'B', type: inferType(VEC3, unitVar('distance_U'), { cardinality: DISTANCE_CARD }) },
    },
    outputs: {
      out: { label: 'Out', type: inferType(FLOAT, unitVar('distance_U'), { cardinality: DISTANCE_CARD }) },
    },
    lower: ({ ctx, inputsById }) => {
      const a = inputsById.a;
      const b = inputsById.b;
      if (!a || !b) throw new Error('Distance requires a and b inputs');
  
      const outType = ctx.outTypes[0];
      const sub = ctx.b.opcode(OpCode.Sub);
      const mul = ctx.b.opcode(OpCode.Mul);
      const add = ctx.b.opcode(OpCode.Add);
      const sqrt = ctx.b.opcode(OpCode.Sqrt);
  
      const ax = ctx.b.extract(a.id, 0, outType);
      const ay = ctx.b.extract(a.id, 1, outType);
      const az = ctx.b.extract(a.id, 2, outType);
      const bx = ctx.b.extract(b.id, 0, outType);
      const by = ctx.b.extract(b.id, 1, outType);
      const bz = ctx.b.extract(b.id, 2, outType);
  
      const dx = ctx.b.zipAuto([ax, bx], sub, outType);
      const dy = ctx.b.zipAuto([ay, by], sub, outType);
      const dz = ctx.b.zipAuto([az, bz], sub, outType);
  
      const dx2 = ctx.b.zipAuto([dx, dx], mul, outType);
      const dy2 = ctx.b.zipAuto([dy, dy], mul, outType);
      const dz2 = ctx.b.zipAuto([dz, dz], mul, outType);
  
      const sum = ctx.b.zipAuto([ctx.b.zipAuto([dx2, dy2], add, outType), dz2], add, outType);
      const result = ctx.b.mapAuto(sum, sqrt, outType);
  
      return {
        outputsById: {
          out: { id: result, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
        },
        effects: {
          slotRequests: [{ portId: 'out', type: outType }],
        },
      };
    },
  });
}
