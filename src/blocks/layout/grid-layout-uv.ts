/**
 * GridLayoutUV Block
 *
 * Gauge-invariant grid layout using placement basis.
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../../core/ids';
import { canonicalType, canonicalField, unitWorld3, payloadStride, floatConst, intConst, requireInst } from '../../core/canonical-types';
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
    elements: { label: 'Elements', type: canonicalField(FLOAT, { kind: 'none' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
    cols: { label: 'Columns', type: canonicalType(INT), defaultValue: 5, defaultSource: defaultSourceConst(5), exposedAsPort: true, uiHint: { kind: 'slider', min: 1, max: 100, step: 1 } },
    rows: { label: 'Rows', type: canonicalType(INT), defaultValue: 5, defaultSource: defaultSourceConst(5), exposedAsPort: true, uiHint: { kind: 'slider', min: 1, max: 100, step: 1 } },
  },
  outputs: {
    position: { label: 'Position', type: canonicalField(VEC3, unitWorld3(), { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
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

    // Get cols and rows as signals
    const colsSig = ('type' in inputsById.cols! && requireInst(inputsById.cols!.type.extent.cardinality, 'cardinality').kind === 'one')
      ? inputsById.cols!.id
      : ctx.b.constant(intConst(5), canonicalType(INT));
    const rowsSig = ('type' in inputsById.rows! && requireInst(inputsById.rows!.type.extent.cardinality, 'cardinality').kind === 'one')
      ? inputsById.rows!.id
      : ctx.b.constant(intConst(5), canonicalType(INT));

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

    // Constants
    const const0 = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    const const1 = ctx.b.constant(floatConst(1), canonicalType(FLOAT));
    const const0_5 = ctx.b.constant(floatConst(0.5), canonicalType(FLOAT));

    // Broadcast constants and signals to fields
    const const0Broadcast = ctx.b.broadcast(const0, floatFieldType);
    const const1Broadcast = ctx.b.broadcast(const1, floatFieldType);
    const const0_5Broadcast = ctx.b.broadcast(const0_5, floatFieldType);
    const colsBroadcast = ctx.b.broadcast(colsSig, floatFieldType);
    const rowsBroadcast = ctx.b.broadcast(rowsSig, floatFieldType);

    // Opcodes
    const clamp = ctx.b.opcode(OpCode.Clamp);
    const mul = ctx.b.opcode(OpCode.Mul);
    const floor = ctx.b.opcode(OpCode.Floor);
    const min = ctx.b.opcode(OpCode.Min);
    const sub = ctx.b.opcode(OpCode.Sub);
    const div = ctx.b.opcode(OpCode.Div);
    const select = ctx.b.opcode(OpCode.Select);

    // u_clamped = clamp(u, 0, 1), v_clamped = clamp(v, 0, 1)
    const u_clamped = ctx.b.kernelZip([u, const0Broadcast, const1Broadcast], clamp, floatFieldType);
    const v_clamped = ctx.b.kernelZip([v, const0Broadcast, const1Broadcast], clamp, floatFieldType);

    // u_scaled = mul(u_clamped, cols), v_scaled = mul(v_clamped, rows)
    const u_scaled = ctx.b.kernelZip([u_clamped, colsBroadcast], mul, floatFieldType);
    const v_scaled = ctx.b.kernelZip([v_clamped, rowsBroadcast], mul, floatFieldType);

    // col = floor(u_scaled), row = floor(v_scaled)
    const col = ctx.b.kernelMap(u_scaled, floor, floatFieldType);
    const row = ctx.b.kernelMap(v_scaled, floor, floatFieldType);

    // cols_m1 = sub(cols, 1), rows_m1 = sub(rows, 1)
    const cols_m1 = ctx.b.kernelZip([colsBroadcast, const1Broadcast], sub, floatFieldType);
    const rows_m1 = ctx.b.kernelZip([rowsBroadcast, const1Broadcast], sub, floatFieldType);

    // col_safe = min(col, cols_m1), row_safe = min(row, rows_m1)
    const col_safe = ctx.b.kernelZip([col, cols_m1], min, floatFieldType);
    const row_safe = ctx.b.kernelZip([row, rows_m1], min, floatFieldType);

    // x_ratio = div(col_safe, cols_m1), y_ratio = div(row_safe, rows_m1)
    const x_ratio = ctx.b.kernelZip([col_safe, cols_m1], div, floatFieldType);
    const y_ratio = ctx.b.kernelZip([row_safe, rows_m1], div, floatFieldType);

    // x = select(cols_m1 > 0, x_ratio, 0.5) - use cols_m1 as condition (truthy if > 0)
    const x = ctx.b.kernelZip([cols_m1, x_ratio, const0_5Broadcast], select, floatFieldType);

    // y = select(rows_m1 > 0, y_ratio, 0.5) - use rows_m1 as condition (truthy if > 0)
    const y = ctx.b.kernelZip([rows_m1, y_ratio, const0_5Broadcast], select, floatFieldType);

    // z = broadcast(0)
    const z = const0Broadcast;

    // pos = construct([x, y, z]) → vec3
    const positionField = ctx.b.construct([x, y, z], posType);

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
