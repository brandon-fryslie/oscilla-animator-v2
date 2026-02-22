/**
 * Dot Block
 *
 * Dot product of two vec3 inputs.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, cardinalityVar, FLOAT, VEC3 } from '../../core/canonical-types';
import { inferType, unitVar } from '../../core/inference-types';
import { OpCode } from '../../compiler/ir/types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const DOT_CARD = cardinalityVar(cardinalityVarId('dot_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'Dot',
  label: 'Dot',
  category: 'math',
  description: 'Dot product of vec3 A and B',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  inputs: {
    a: { label: 'A', type: inferType(VEC3, unitVar('dot_U'), { cardinality: DOT_CARD }) },
    b: { label: 'B', type: inferType(VEC3, unitVar('dot_U'), { cardinality: DOT_CARD }) },
  },
  outputs: {
    out: { label: 'Out', type: inferType(FLOAT, unitVar('dot_U'), { cardinality: DOT_CARD }) },
  },
  lower: ({ ctx, inputsById }) => {
    const a = inputsById.a;
    const b = inputsById.b;
    if (!a || !b) throw new Error('Dot requires a and b inputs');

    const outType = ctx.outTypes[0];
    const mul = ctx.b.opcode(OpCode.Mul);
    const add = ctx.b.opcode(OpCode.Add);

    const ax = ctx.b.extract(a.id, 0, outType);
    const ay = ctx.b.extract(a.id, 1, outType);
    const az = ctx.b.extract(a.id, 2, outType);
    const bx = ctx.b.extract(b.id, 0, outType);
    const by = ctx.b.extract(b.id, 1, outType);
    const bz = ctx.b.extract(b.id, 2, outType);

    const x = ctx.b.zipAuto([ax, bx], mul, outType);
    const y = ctx.b.zipAuto([ay, by], mul, outType);
    const z = ctx.b.zipAuto([az, bz], mul, outType);

    const xy = ctx.b.zipAuto([x, y], add, outType);
    const result = ctx.b.zipAuto([xy, z], add, outType);

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
