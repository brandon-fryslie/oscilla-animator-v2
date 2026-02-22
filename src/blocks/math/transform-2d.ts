/**
 * Transform2D Block
 *
 * Translate/scale/rotate vec3 positions in XY around a pivot.
 */

import { registerBlock } from '../registry';
import { defaultSourceConst } from '../../types';
import { canonicalType, payloadStride, floatConst, unitDegrees, unitNone, cardinalityVar, FLOAT, VEC3 } from '../../core/canonical-types';
import { inferType, unitVar } from '../../core/inference-types';
import { OpCode } from '../../compiler/ir/types';
import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Per-port cardinality behavior is declared on CT/ICT.
const TRANSFORM_2D_CARD = cardinalityVar(cardinalityVarId('transform_2d_cardinality'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'Transform2D',
  label: 'Transform 2D',
  category: 'math',
  description: 'Translate/scale/rotate vec3 position XY',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  inputs: {
    position: { label: 'Position', type: inferType(VEC3, unitVar('xform2d_pos_U'), { cardinality: TRANSFORM_2D_CARD }) },
    translateX: {
      label: 'Translate X',
      type: inferType(FLOAT, unitVar('xform2d_pos_U'), { cardinality: TRANSFORM_2D_CARD }),
      defaultValue: 0,
      defaultSource: defaultSourceConst(0),
      exposedAsPort: true,
    },
    translateY: {
      label: 'Translate Y',
      type: inferType(FLOAT, unitVar('xform2d_pos_U'), { cardinality: TRANSFORM_2D_CARD }),
      defaultValue: 0,
      defaultSource: defaultSourceConst(0),
      exposedAsPort: true,
    },
    scaleX: {
      label: 'Scale X',
      type: canonicalType(FLOAT, unitNone(), { cardinality: TRANSFORM_2D_CARD }),
      defaultValue: 1,
      defaultSource: defaultSourceConst(1),
      exposedAsPort: true,
      uiHint: { kind: 'slider', min: 0, max: 4, step: 0.01 },
    },
    scaleY: {
      label: 'Scale Y',
      type: canonicalType(FLOAT, unitNone(), { cardinality: TRANSFORM_2D_CARD }),
      defaultValue: 1,
      defaultSource: defaultSourceConst(1),
      exposedAsPort: true,
      uiHint: { kind: 'slider', min: 0, max: 4, step: 0.01 },
    },
    angleDeg: {
      label: 'Angle',
      type: canonicalType(FLOAT, unitDegrees(), { cardinality: TRANSFORM_2D_CARD }),
      defaultValue: 0,
      defaultSource: defaultSourceConst(0),
      exposedAsPort: true,
      uiHint: { kind: 'slider', min: -360, max: 360, step: 1 },
    },
    pivotX: {
      label: 'Pivot X',
      type: inferType(FLOAT, unitVar('xform2d_pos_U'), { cardinality: TRANSFORM_2D_CARD }),
      defaultValue: 0.5,
      defaultSource: defaultSourceConst(0.5),
      exposedAsPort: true,
    },
    pivotY: {
      label: 'Pivot Y',
      type: inferType(FLOAT, unitVar('xform2d_pos_U'), { cardinality: TRANSFORM_2D_CARD }),
      defaultValue: 0.5,
      defaultSource: defaultSourceConst(0.5),
      exposedAsPort: true,
    },
  },
  outputs: {
    out: { label: 'Out', type: inferType(VEC3, unitVar('xform2d_pos_U'), { cardinality: TRANSFORM_2D_CARD }) },
  },
  lower: ({ ctx, inputsById }) => {
    const position = inputsById.position;
    const translateX = inputsById.translateX;
    const translateY = inputsById.translateY;
    const scaleX = inputsById.scaleX;
    const scaleY = inputsById.scaleY;
    const angleDeg = inputsById.angleDeg;
    const pivotX = inputsById.pivotX;
    const pivotY = inputsById.pivotY;

    if (!position || !translateX || !translateY || !scaleX || !scaleY || !angleDeg || !pivotX || !pivotY) {
      throw new Error('Transform2D requires all inputs');
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

    const xScaled = ctx.b.zipAuto([xRel, scaleX.id], mul, scalarType);
    const yScaled = ctx.b.zipAuto([yRel, scaleY.id], mul, scalarType);

    const xRot = ctx.b.zipAuto([
      ctx.b.zipAuto([xScaled, c], mul, scalarType),
      ctx.b.zipAuto([yScaled, s], mul, scalarType),
    ], sub, scalarType);
    const yRot = ctx.b.zipAuto([
      ctx.b.zipAuto([xScaled, s], mul, scalarType),
      ctx.b.zipAuto([yScaled, c], mul, scalarType),
    ], add, scalarType);

    const xOut = ctx.b.zipAuto([ctx.b.zipAuto([xRot, pivotX.id], add, scalarType), translateX.id], add, scalarType);
    const yOut = ctx.b.zipAuto([ctx.b.zipAuto([yRot, pivotY.id], add, scalarType), translateY.id], add, scalarType);

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
