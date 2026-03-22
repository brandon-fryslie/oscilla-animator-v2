/**
 * GridLayoutUV Block
 *
 * Arranges elements in a grid using placement basis (gauge-invariant).
 * Convenience block built on the domain topology primitives.
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';
import { canonicalType, payloadStride, floatConst, requireInst } from '../../core/canonical-types';
import { FLOAT, INT, VEC2 } from '../../core/canonical-types';
import { inferType, payloadVar, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { defaultSourceConst } from '../../types';
import { OpCode } from '../../compiler/ir/types';
import { rewriteFieldType } from './_helpers';
import { promoteToMany } from '../lower-utils';

// [LAW:one-source-of-truth] Field cardinality behavior is declared on CT/ICT port types.
const GRID_FIELD_CARD = cardinalityVar(cardinalityVarId('grid_fields'), {
  relation: 'promoteToMany',
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'GridLayoutUV',
    label: 'Grid Layout (UV)',
    category: 'layout',
    description: 'Arranges elements in a grid using UV placement basis (gauge-invariant)',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    payload: {
      allowedPayloads: {
        elements: ALL_CONCRETE_PAYLOADS,
      },
      semantics: 'typeSpecific',
    },
    inputs: {
      elements: { label: 'Elements', type: inferType(payloadVar('grid_elements_payload'), { kind: 'none' }, { cardinality: GRID_FIELD_CARD }) },
      cols: { label: 'Columns', type: canonicalType(INT), defaultValue: 5, defaultSource: defaultSourceConst(5), exposedAsPort: true, uiHint: { kind: 'slider', min: 1, max: 16, step: 1 } },
      rows: { label: 'Rows', type: canonicalType(INT), defaultValue: 5, defaultSource: defaultSourceConst(5), exposedAsPort: true, uiHint: { kind: 'slider', min: 1, max: 16, step: 1 } },
    },
    outputs: {
      rotation: { label: 'Rotation', type: inferType(FLOAT, { kind: 'none' }, { cardinality: GRID_FIELD_CARD }) },
      scale: { label: 'Scale', type: inferType(FLOAT, { kind: 'none' }, { cardinality: GRID_FIELD_CARD }) },
      controlPoints: { label: 'Control Points', type: inferType(VEC2, { kind: 'none' }, { cardinality: GRID_FIELD_CARD }) },
    },
    lower: ({ ctx, inputsById }) => {
      const elementsInput = inputsById.elements;

      if (!elementsInput || !('type' in elementsInput && requireInst(elementsInput.type.extent.cardinality, 'cardinality').kind === 'many')) {
        throw new Error('GridLayoutUV requires a field input (from Array block)');
      }

      const instanceId = ctx.inferredInstance;
      if (!instanceId) {
        throw new Error('GridLayoutUV requires instance context from upstream Array block');
      }

      const rotationType = rewriteFieldType(ctx.outTypes[0], instanceId, ctx.instances);
      const scaleType = rewriteFieldType(ctx.outTypes[1], instanceId, ctx.instances);
      const controlPointsType = rewriteFieldType(ctx.outTypes[2], instanceId, ctx.instances);
      const floatFieldType = rotationType;
      const vec2FieldType = controlPointsType;

      const colsInput = inputsById.cols;
      if (!colsInput) throw new Error('GridLayoutUV: cols input not wired — normalization bug');
      const rowsInput = inputsById.rows;
      if (!rowsInput) throw new Error('GridLayoutUV: rows input not wired — normalization bug');

      // Create UV field from grid placement basis
      const uvField = ctx.b.placement('uv', 'grid', vec2FieldType);

      // u = extract(uvField, 0), v = extract(uvField, 1)
      const u = ctx.b.extract(uvField, 0, floatFieldType);
      const v = ctx.b.extract(uvField, 1, floatFieldType);

      const const0 = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
      const const1 = ctx.b.constant(floatConst(1), canonicalType(FLOAT));
      const const0_5 = ctx.b.constant(floatConst(0.5), canonicalType(FLOAT));

      const clamp = ctx.b.opcode(OpCode.Clamp);
      const mul = ctx.b.opcode(OpCode.Mul);
      const floor = ctx.b.opcode(OpCode.Floor);
      const min = ctx.b.opcode(OpCode.Min);
      const sub = ctx.b.opcode(OpCode.Sub);
      const div = ctx.b.opcode(OpCode.Div);
      const select = ctx.b.opcode(OpCode.Select);

      const u_clamped = ctx.b.zipAuto([u, const0, const1], clamp, floatFieldType);
      const v_clamped = ctx.b.zipAuto([v, const0, const1], clamp, floatFieldType);

      const u_scaled = ctx.b.zipAuto([u_clamped, colsInput.id], mul, floatFieldType);
      const v_scaled = ctx.b.zipAuto([v_clamped, rowsInput.id], mul, floatFieldType);

      const col = ctx.b.mapAuto(u_scaled, floor, floatFieldType);
      const row = ctx.b.mapAuto(v_scaled, floor, floatFieldType);

      const cols_m1 = ctx.b.zipAuto([colsInput.id, const1], sub, floatFieldType);
      const rows_m1 = ctx.b.zipAuto([rowsInput.id, const1], sub, floatFieldType);

      const col_safe = ctx.b.zipAuto([col, cols_m1], min, floatFieldType);
      const row_safe = ctx.b.zipAuto([row, rows_m1], min, floatFieldType);

      const x_ratio = ctx.b.zipAuto([col_safe, cols_m1], div, floatFieldType);
      const y_ratio = ctx.b.zipAuto([row_safe, rows_m1], div, floatFieldType);

      const x = ctx.b.zipAuto([cols_m1, x_ratio, const0_5], select, floatFieldType);
      const y = ctx.b.zipAuto([rows_m1, y_ratio, const0_5], select, floatFieldType);

      const controlPointsField = ctx.b.constructAuto([x, y], controlPointsType);

      const rotationField = promoteToMany(const0, floatFieldType, ctx.b);
      const scaleField = promoteToMany(const1, floatFieldType, ctx.b);

      return {
        outputsById: {
          rotation: { id: rotationField, slot: undefined, type: rotationType, stride: 1 },
          scale: { id: scaleField, slot: undefined, type: scaleType, stride: 1 },
          controlPoints: { id: controlPointsField, slot: undefined, type: controlPointsType, stride: payloadStride(controlPointsType.payload) },
        },
        effects: {
          slotRequests: [
            { portId: 'rotation', type: rotationType },
            { portId: 'scale', type: scaleType },
            { portId: 'controlPoints', type: controlPointsType },
          ],
        },
        instanceContext: instanceId,
      };
    },
  });
}
