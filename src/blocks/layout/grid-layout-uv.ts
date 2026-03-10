/**
 * GridLayoutUV Block
 *
 * Gauge-invariant grid layout using placement basis.
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';

import { canonicalType, payloadStride, floatConst, requireInst } from '../../core/canonical-types';
import { FLOAT, INT, VEC2 } from '../../core/canonical-types';
import { inferType, payloadVar, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { defaultSourceConst } from '../../types';
import { OpCode } from '../../compiler/ir/types';
import { rewriteFieldType } from './_helpers';

// [LAW:one-source-of-truth] Field cardinality behavior is declared on CT/ICT port types.
const GRID_FIELD_CARD = cardinalityVar(cardinalityVarId('grid_fields'), {
  relation: 'promoteToMany',
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});

/**
 * GridLayoutUV - Gauge-invariant grid layout using placement basis
 *
 * Stage 3: Field operation block.
 * Takes Field<T> input and outputs Field<vec2> control points in a grid.
 * Uses UV placement basis instead of index for gauge invariance.
 */
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
      cols: { label: 'Columns', type: canonicalType(INT), defaultValue: 5, defaultSource: defaultSourceConst(5), exposedAsPort: true, uiHint: { kind: 'slider', min: 1, max: 100, step: 1 } },
      rows: { label: 'Rows', type: canonicalType(INT), defaultValue: 5, defaultSource: defaultSourceConst(5), exposedAsPort: true, uiHint: { kind: 'slider', min: 1, max: 100, step: 1 } },
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
  
      // [LAW:one-source-of-truth] Layout emits only controlPoints; rotation/scale derive from the same instance.
      const rotationType = rewriteFieldType(ctx.outTypes[0], instanceId, ctx.instances);
      const scaleType = rewriteFieldType(ctx.outTypes[1], instanceId, ctx.instances);
      const controlPointsType = rewriteFieldType(ctx.outTypes[2], instanceId, ctx.instances);
      const floatFieldType = rotationType;
      const vec2FieldType = controlPointsType;
  
      // Post-normalization: all inputs guaranteed wired — no fallback needed
      // [LAW:one-source-of-truth] inputs are the single source; config was a dead fallback
      const colsInput = inputsById.cols;
      if (!colsInput) throw new Error('GridLayoutUV: cols input not wired — normalization bug');
      const rowsInput = inputsById.rows;
      if (!rowsInput) throw new Error('GridLayoutUV: rows input not wired — normalization bug');
  
      // Use 'grid' as default basis kind for proper grid alignment
      const basisKind: import('../../compiler/ir/types').BasisKind = 'grid';
  
      // Create UV field from placement basis
      const uvField = ctx.b.placement('uv',
        basisKind,
        vec2FieldType
      );
  
      // Decompose gridLayoutUV into opcode sequence:
      // u = extract(uvField, 0), v = extract(uvField, 1)
      const u = ctx.b.extract(uvField, 0, floatFieldType);
      const v = ctx.b.extract(uvField, 1, floatFieldType);
  
      // Constants (one-cardinality — zipAuto/constructAuto handle one→many broadcasting)
      const const0 = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
      const const1 = ctx.b.constant(floatConst(1), canonicalType(FLOAT));
      const const2 = ctx.b.constant(floatConst(2), canonicalType(FLOAT));
      const const0_5 = ctx.b.constant(floatConst(0.5), canonicalType(FLOAT));
  
      // Opcodes
      const clamp = ctx.b.opcode(OpCode.Clamp);
      const mul = ctx.b.opcode(OpCode.Mul);
      const floor = ctx.b.opcode(OpCode.Floor);
      const min = ctx.b.opcode(OpCode.Min);
      const sub = ctx.b.opcode(OpCode.Sub);
      const div = ctx.b.opcode(OpCode.Div);
      const select = ctx.b.opcode(OpCode.Select);
  
      // u_clamped = clamp(u, 0, 1), v_clamped = clamp(v, 0, 1)
      const u_clamped = ctx.b.zipAuto([u, const0, const1], clamp, floatFieldType);
      const v_clamped = ctx.b.zipAuto([v, const0, const1], clamp, floatFieldType);
  
      // u_scaled = mul(u_clamped, cols), v_scaled = mul(v_clamped, rows)
      const u_scaled = ctx.b.zipAuto([u_clamped, colsInput.id], mul, floatFieldType);
      const v_scaled = ctx.b.zipAuto([v_clamped, rowsInput.id], mul, floatFieldType);
  
      // col = floor(u_scaled), row = floor(v_scaled)
      const col = ctx.b.mapAuto(u_scaled, floor, floatFieldType);
      const row = ctx.b.mapAuto(v_scaled, floor, floatFieldType);
  
      // cols_m1 = sub(cols, 1), rows_m1 = sub(rows, 1)
      const cols_m1 = ctx.b.zipAuto([colsInput.id, const1], sub, floatFieldType);
      const rows_m1 = ctx.b.zipAuto([rowsInput.id, const1], sub, floatFieldType);
  
      // col_safe = min(col, cols_m1), row_safe = min(row, rows_m1)
      const col_safe = ctx.b.zipAuto([col, cols_m1], min, floatFieldType);
      const row_safe = ctx.b.zipAuto([row, rows_m1], min, floatFieldType);
  
      // x_ratio = div(col_safe, cols_m1), y_ratio = div(row_safe, rows_m1)
      const x_ratio = ctx.b.zipAuto([col_safe, cols_m1], div, floatFieldType);
      const y_ratio = ctx.b.zipAuto([row_safe, rows_m1], div, floatFieldType);
  
      // x_unit = select(cols_m1 > 0, x_ratio, 0.5)
      const x_unit = ctx.b.zipAuto([cols_m1, x_ratio, const0_5], select, floatFieldType);

      // y_unit = select(rows_m1 > 0, y_ratio, 0.5)
      const y_unit = ctx.b.zipAuto([rows_m1, y_ratio, const0_5], select, floatFieldType);

      // [LAW:one-source-of-truth] Layout world-space is zero-centered;
      // map basis-space unit ratios [0,1] to world-space [-1,1].
      const x_scaled = ctx.b.zipAuto([x_unit, const2], mul, floatFieldType);
      const y_scaled = ctx.b.zipAuto([y_unit, const2], mul, floatFieldType);
      const x = ctx.b.zipAuto([x_scaled, const1], sub, floatFieldType);
      const y = ctx.b.zipAuto([y_scaled, const1], sub, floatFieldType);
  
      const controlPointsField = ctx.b.constructAuto([x, y], controlPointsType);
  
      // rotation = broadcast constant 0.0 (grid has no inherent rotation)
      const rotationField = ctx.b.broadcast(const0, floatFieldType);
  
      // scale = broadcast constant 1.0
      const scaleField = ctx.b.broadcast(const1, floatFieldType);
  
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
