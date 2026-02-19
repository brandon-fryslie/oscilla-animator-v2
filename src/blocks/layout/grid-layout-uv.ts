/**
 * GridLayoutUV Block
 *
 * Gauge-invariant grid layout using placement basis.
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';

import { canonicalType, canonicalFieldDef, unitWorld3, payloadStride, floatConst, requireInst } from '../../core/canonical-types';
import { FLOAT, INT, VEC3 } from '../../core/canonical-types';
import { defaultSourceConst } from '../../types';
import { OpCode } from '../../compiler/ir/types';
import { rewriteFieldType } from './_helpers';

/**
 * GridLayoutUV - Gauge-invariant grid layout using placement basis
 *
 * Stage 3: Field operation block.
 * Takes Field<T> input and outputs Field<vec3> positions in a grid.
 * Uses UV placement basis instead of index for gauge invariance.
 */
registerBlock({
  type: 'GridLayoutUV',
  label: 'Grid Layout (UV)',
  category: 'layout',
  description: 'Arranges elements in a grid using UV placement basis (gauge-invariant)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  payload: {
    allowedPayloads: {
      elements: ALL_CONCRETE_PAYLOADS,
    },
    semantics: 'typeSpecific',
  },
  inputs: {
    elements: { label: 'Elements', type: canonicalFieldDef(FLOAT, { kind: 'none' }) },
    cols: { label: 'Columns', type: canonicalType(INT), defaultValue: 5, defaultSource: defaultSourceConst(5), exposedAsPort: true, uiHint: { kind: 'slider', min: 1, max: 100, step: 1 } },
    rows: { label: 'Rows', type: canonicalType(INT), defaultValue: 5, defaultSource: defaultSourceConst(5), exposedAsPort: true, uiHint: { kind: 'slider', min: 1, max: 100, step: 1 } },
  },
  outputs: {
    position: { label: 'Position', type: canonicalFieldDef(VEC3, unitWorld3()) },
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

    // Rewrite output type with actual instance (ctx.outTypes has placeholder 'default')
    const posType = rewriteFieldType(ctx.outTypes[0], instanceId, ctx.instances);
    const floatFieldType = { ...posType, payload: FLOAT, unit: { kind: 'none' as const } };
    const vec2FieldType = { ...posType, payload: { kind: 'vec2' as const }, unit: { kind: 'none' as const } };

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

    // Constants (signal — zipAuto/constructAuto handle signal→field broadcasting)
    const const0 = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    const const1 = ctx.b.constant(floatConst(1), canonicalType(FLOAT));
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

    // x = select(cols_m1 > 0, x_ratio, 0.5)
    const x = ctx.b.zipAuto([cols_m1, x_ratio, const0_5], select, floatFieldType);

    // y = select(rows_m1 > 0, y_ratio, 0.5)
    const y = ctx.b.zipAuto([rows_m1, y_ratio, const0_5], select, floatFieldType);

    // pos = constructAuto([x, y, 0]) → vec3 (auto-broadcasts const0 signal)
    const positionField = ctx.b.constructAuto([x, y, const0], posType);

    // Slot will be allocated by orchestrator

    return {
      outputsById: {
        position: { id: positionField, slot: undefined, type: posType, stride: payloadStride(posType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'position', type: posType },
        ],
      },
      instanceContext: instanceId,
    };
  },
});
