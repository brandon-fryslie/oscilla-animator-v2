/**
 * Reflect Block
 *
 * Reflect incident vector I around normal N.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, cardinalityVar, FLOAT, VEC3 } from '../../core/canonical-types';
import { inferType, unitVar } from '../../core/inference-types';
import { OpCode } from '../../compiler/ir/types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const REFLECT_CARD = cardinalityVar(cardinalityVarId('reflect_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'Reflect',
    label: 'Reflect',
    category: 'math',
    description: 'Reflect incident vec3 around normal vec3',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      incident: { label: 'Incident', type: inferType(VEC3, unitVar('reflect_U'), { cardinality: REFLECT_CARD }) },
      normal: { label: 'Normal', type: inferType(VEC3, unitVar('reflect_U'), { cardinality: REFLECT_CARD }) },
    },
    outputs: {
      out: { label: 'Out', type: inferType(VEC3, unitVar('reflect_U'), { cardinality: REFLECT_CARD }) },
    },
    lower: ({ ctx, inputsById }) => {
      const incident = inputsById.incident;
      const normal = inputsById.normal;
      if (!incident || !normal) throw new Error('Reflect requires incident and normal inputs');
  
      const outType = ctx.outTypes[0];
      const scalarType = { ...outType, payload: FLOAT };
  
      const mul = ctx.b.opcode(OpCode.Mul);
      const sub = ctx.b.opcode(OpCode.Sub);
      const add = ctx.b.opcode(OpCode.Add);
  
      const ix = ctx.b.extract(incident.id, 0, scalarType);
      const iy = ctx.b.extract(incident.id, 1, scalarType);
      const iz = ctx.b.extract(incident.id, 2, scalarType);
      const nx = ctx.b.extract(normal.id, 0, scalarType);
      const ny = ctx.b.extract(normal.id, 1, scalarType);
      const nz = ctx.b.extract(normal.id, 2, scalarType);
  
      const dot = ctx.b.zipAuto([
        ctx.b.zipAuto([ctx.b.zipAuto([ix, nx], mul, scalarType), ctx.b.zipAuto([iy, ny], mul, scalarType)], add, scalarType),
        ctx.b.zipAuto([iz, nz], mul, scalarType),
      ], add, scalarType);
  
      const two = ctx.b.constant({ kind: 'float', value: 2 }, canonicalType(FLOAT));
      const scale = ctx.b.zipAuto([dot, two], mul, scalarType);
  
      const rx = ctx.b.zipAuto([ix, ctx.b.zipAuto([nx, scale], mul, scalarType)], sub, scalarType);
      const ry = ctx.b.zipAuto([iy, ctx.b.zipAuto([ny, scale], mul, scalarType)], sub, scalarType);
      const rz = ctx.b.zipAuto([iz, ctx.b.zipAuto([nz, scale], mul, scalarType)], sub, scalarType);
  
      const result = ctx.b.constructAuto([rx, ry, rz], outType);
  
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
