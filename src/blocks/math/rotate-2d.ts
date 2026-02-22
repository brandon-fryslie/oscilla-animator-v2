/**
 * Rotate2D Block
 *
 * Rotate vec3 positions in XY around a pivot (degrees).
 */

import { registerBlock } from '../registry';
import { defaultSourceConst } from '../../types';
import { canonicalType, payloadStride, floatConst, unitDegrees, cardinalityVar, FLOAT, VEC3 } from '../../core/canonical-types';
import { inferType, unitVar } from '../../core/inference-types';
import { OpCode } from '../../compiler/ir/types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const ROTATE_2D_CARD = cardinalityVar(cardinalityVarId('rotate_2d_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'Rotate2D',
  label: 'Rotate 2D',
  category: 'math',
  description: 'Rotate vec3 position XY around pivot by angle (degrees)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  inputs: {
    position: { label: 'Position', type: inferType(VEC3, unitVar('rot2d_pos_U'), { cardinality: ROTATE_2D_CARD }) },
    angleDeg: {
      label: 'Angle',
      type: canonicalType(FLOAT, unitDegrees(), { cardinality: ROTATE_2D_CARD }),
      defaultValue: 0,
      defaultSource: defaultSourceConst(0),
      exposedAsPort: true,
      uiHint: { kind: 'slider', min: -360, max: 360, step: 1 },
    },
    pivotX: {
      label: 'Pivot X',
      type: inferType(FLOAT, unitVar('rot2d_pos_U'), { cardinality: ROTATE_2D_CARD }),
      defaultValue: 0.5,
      defaultSource: defaultSourceConst(0.5),
      exposedAsPort: true,
    },
    pivotY: {
      label: 'Pivot Y',
      type: inferType(FLOAT, unitVar('rot2d_pos_U'), { cardinality: ROTATE_2D_CARD }),
      defaultValue: 0.5,
      defaultSource: defaultSourceConst(0.5),
      exposedAsPort: true,
    },
  },
  outputs: {
    out: { label: 'Out', type: inferType(VEC3, unitVar('rot2d_pos_U'), { cardinality: ROTATE_2D_CARD }) },
  },
  lower: ({ ctx, inputsById }) => {
    const position = inputsById.position;
    const angleDeg = inputsById.angleDeg;
    const pivotX = inputsById.pivotX;
    const pivotY = inputsById.pivotY;
    if (!position || !angleDeg || !pivotX || !pivotY) {
      throw new Error('Rotate2D requires position, angleDeg, pivotX, and pivotY inputs');
    }

    const outType = ctx.outTypes[0];
    const scalarType = { ...outType, payload: FLOAT };

    const add = ctx.b.opcode(OpCode.Add);
    const sub = ctx.b.opcode(OpCode.Sub);
    const mul = ctx.b.opcode(OpCode.Mul);
    const sin = ctx.b.opcode(OpCode.Sin);
    const cos = ctx.b.opcode(OpCode.Cos);

    const x = ctx.b.extract(position.id, 0, scalarType);
    const y = ctx.b.extract(position.id, 1, scalarType);
    const z = ctx.b.extract(position.id, 2, scalarType);

    const degToRad = ctx.b.constant(floatConst(Math.PI / 180), canonicalType(FLOAT));
    const angleRad = ctx.b.zipAuto([angleDeg.id, degToRad], mul, scalarType);
    const c = ctx.b.mapAuto(angleRad, cos, scalarType);
    const s = ctx.b.mapAuto(angleRad, sin, scalarType);

    const xRel = ctx.b.zipAuto([x, pivotX.id], sub, scalarType);
    const yRel = ctx.b.zipAuto([y, pivotY.id], sub, scalarType);

    const xRot = ctx.b.zipAuto([
      ctx.b.zipAuto([xRel, c], mul, scalarType),
      ctx.b.zipAuto([yRel, s], mul, scalarType),
    ], sub, scalarType);
    const yRot = ctx.b.zipAuto([
      ctx.b.zipAuto([xRel, s], mul, scalarType),
      ctx.b.zipAuto([yRel, c], mul, scalarType),
    ], add, scalarType);

    const xOut = ctx.b.zipAuto([xRot, pivotX.id], add, scalarType);
    const yOut = ctx.b.zipAuto([yRot, pivotY.id], add, scalarType);

    const result = ctx.b.constructAuto([xOut, yOut, z], outType);

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
