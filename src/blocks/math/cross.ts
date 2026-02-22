/**
 * Cross Block
 *
 * Cross product of two vec3 inputs.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, cardinalityVar, FLOAT, VEC3 } from '../../core/canonical-types';
import { inferType, unitVar } from '../../core/inference-types';
import { OpCode } from '../../compiler/ir/types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const CROSS_CARD = cardinalityVar(cardinalityVarId('cross_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'Cross',
    label: 'Cross',
    category: 'math',
    description: 'Cross product of vec3 A and B',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      a: { label: 'A', type: inferType(VEC3, unitVar('cross_U'), { cardinality: CROSS_CARD }) },
      b: { label: 'B', type: inferType(VEC3, unitVar('cross_U'), { cardinality: CROSS_CARD }) },
    },
    outputs: {
      out: { label: 'Out', type: inferType(VEC3, unitVar('cross_U'), { cardinality: CROSS_CARD }) },
    },
    lower: ({ ctx, inputsById }) => {
      const a = inputsById.a;
      const b = inputsById.b;
      if (!a || !b) throw new Error('Cross requires a and b inputs');
  
      const outType = ctx.outTypes[0];
      const scalarType = { ...outType, payload: FLOAT };
      const mul = ctx.b.opcode(OpCode.Mul);
      const sub = ctx.b.opcode(OpCode.Sub);
  
      const ax = ctx.b.extract(a.id, 0, scalarType);
      const ay = ctx.b.extract(a.id, 1, scalarType);
      const az = ctx.b.extract(a.id, 2, scalarType);
      const bx = ctx.b.extract(b.id, 0, scalarType);
      const by = ctx.b.extract(b.id, 1, scalarType);
      const bz = ctx.b.extract(b.id, 2, scalarType);
  
      const aybz = ctx.b.zipAuto([ay, bz], mul, scalarType);
      const azby = ctx.b.zipAuto([az, by], mul, scalarType);
      const azbx = ctx.b.zipAuto([az, bx], mul, scalarType);
      const axbz = ctx.b.zipAuto([ax, bz], mul, scalarType);
      const axby = ctx.b.zipAuto([ax, by], mul, scalarType);
      const aybx = ctx.b.zipAuto([ay, bx], mul, scalarType);
  
      const x = ctx.b.zipAuto([aybz, azby], sub, scalarType);
      const y = ctx.b.zipAuto([azbx, axbz], sub, scalarType);
      const z = ctx.b.zipAuto([axby, aybx], sub, scalarType);
  
      const result = ctx.b.constructAuto([x, y, z], outType);
  
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
