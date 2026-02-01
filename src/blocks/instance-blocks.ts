/**
 * Instance Blocks
 *
 * Instance and layout blocks following three-stage architecture:
 * - Stage 2 blocks (Array) create instances
 * - Stage 3 blocks (layouts) apply spatial operations to fields using field kernels
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from './registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../core/ids';
import { canonicalType, canonicalField, unitPhase01, unitWorld3, strideOf, floatConst, intConst, requireInst, withInstance, instanceRef } from '../core/canonical-types';
import { FLOAT, INT, VEC2, VEC3, SHAPE } from '../core/canonical-types';
import { defaultSourceConst } from '../types';
import { OpCode } from '../compiler/ir/types';
import type { InstanceId } from '../compiler/ir/Indices';
import type { IRBuilder } from '../compiler/ir/IRBuilder';
import type { CanonicalType } from '../core/canonical-types';

/**
 * Rewrite placeholder 'default' instance in a field output type with the actual instance.
 * Used by layout blocks that preserve cardinality from upstream Array blocks.
 */
function rewriteFieldType(outType: CanonicalType, instId: InstanceId, builder: IRBuilder): CanonicalType {
  const decl = builder.getInstances().get(instId);
  if (!decl) return outType;
  const ref = instanceRef(decl.domainType as string, instId as string);
  return withInstance(outType, ref);
}

// =============================================================================
// UV Layout Blocks (Gauge-Invariant)
// =============================================================================
// Legacy non-UV layout blocks (GridLayout, LinearLayout, CircleLayout, LineLayout)
// have been removed. Use the UV variants below instead.

/**
 * CircleLayoutUV - Gauge-invariant circle layout using placement basis
 *
 * Stage 3: Field operation block.
 * Takes Field<T> input and outputs Field<vec3> positions on a circle.
 * Uses UV placement basis instead of normalizedIndex for gauge invariance.
 */
registerBlock({
  type: 'CircleLayoutUV',
  label: 'Circle Layout (UV)',
  category: 'layout',
  description: 'Arranges elements in a circle pattern using UV placement basis (gauge-invariant)',
  form: 'primitive',
  capability: 'pure',
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
    elements: { label: 'Elements', type: canonicalField(SHAPE, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
    radius: { label: 'Radius', type: canonicalType(FLOAT), value: 0.3, defaultSource: defaultSourceConst(0.3), exposedAsPort: true, uiHint: { kind: 'slider', min: 0.01, max: 0.5, step: 0.01 } },
    phase: { label: 'Phase', type: canonicalType(FLOAT, unitPhase01()), value: 0, defaultSource: defaultSourceConst(0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
  },
  outputs: {
    position: { label: 'Position', type: canonicalField(VEC3, unitWorld3(), { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
  },
  // NOTE: basisKind configuration will be added when BlockDef supports config.
  // For now, using 'halton2D' as the default basis kind for gauge-invariant layouts.
  lower: ({ ctx, inputsById }) => {
    const elementsInput = inputsById.elements;

    if (!elementsInput || !('type' in elementsInput && requireInst(elementsInput.type.extent.cardinality, 'cardinality').kind === 'many')) {
      throw new Error('CircleLayoutUV requires a field input (from Array block)');
    }

    const instanceId = ctx.inferredInstance;
    if (!instanceId) {
      throw new Error('CircleLayoutUV requires instance context from upstream Array block');
    }

    // Rewrite output type with actual instance (ctx.outTypes has placeholder 'default')
    const posType = rewriteFieldType(ctx.outTypes[0], instanceId, ctx.b);
    const floatFieldType = { ...posType, payload: FLOAT, unit: { kind: 'scalar' as const } };
    const vec2FieldType = { ...posType, payload: VEC2, unit: { kind: 'scalar' as const } };

    // Get radius and phase as signals
    const radiusSig = ('type' in inputsById.radius! && requireInst(inputsById.radius!.type.extent.cardinality, 'cardinality').kind === 'one')
      ? inputsById.radius!.id
      : ctx.b.constant(floatConst(0.3), canonicalType(FLOAT));
    const phaseSig = ('type' in inputsById.phase! && requireInst(inputsById.phase!.type.extent.cardinality, 'cardinality').kind === 'one')
      ? inputsById.phase!.id
      : ctx.b.constant(floatConst(0), canonicalType(FLOAT));

    // Use halton2D as default basis kind (user-configurable when BlockDef supports config)
    const basisKind: import('../compiler/ir/types').BasisKind = 'halton2D';

    // Create UV field from placement basis
    const uvField = ctx.b.placement('uv',
      basisKind,
      vec2FieldType
    );

    // Decompose circleLayoutUV into opcode sequence:
    // u = extract(uvField, 0) — component 0 = X
    const u = ctx.b.extract(uvField, 0, floatFieldType);

    // Constants
    const const0 = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    const const1 = ctx.b.constant(floatConst(1), canonicalType(FLOAT));
    const const0_5 = ctx.b.constant(floatConst(0.5), canonicalType(FLOAT));
    const twoPi = ctx.b.constant(floatConst(Math.PI * 2), canonicalType(FLOAT));

    // Broadcast constants and signals to fields
    const const0Broadcast = ctx.b.broadcast(const0, floatFieldType);
    const const1Broadcast = ctx.b.broadcast(const1, floatFieldType);
    const const0_5Broadcast = ctx.b.broadcast(const0_5, floatFieldType);
    const twoPiBroadcast = ctx.b.broadcast(twoPi, floatFieldType);
    const phaseBroadcast = ctx.b.broadcast(phaseSig, floatFieldType);
    const radiusBroadcast = ctx.b.broadcast(radiusSig, floatFieldType);

    // Opcodes
    const clamp = ctx.b.opcode(OpCode.Clamp);
    const add = ctx.b.opcode(OpCode.Add);
    const mul = ctx.b.opcode(OpCode.Mul);
    const cos = ctx.b.opcode(OpCode.Cos);
    const sin = ctx.b.opcode(OpCode.Sin);

    // u_clamped = clamp(u, 0, 1)
    const u_clamped = ctx.b.kernelZip([u, const0Broadcast, const1Broadcast], clamp, floatFieldType);

    // angle_base = add(u_clamped, phase_field)
    const angle_base = ctx.b.kernelZip([u_clamped, phaseBroadcast], add, floatFieldType);

    // angle = mul(angle_base, twoPi)
    const angle = ctx.b.kernelZip([angle_base, twoPiBroadcast], mul, floatFieldType);

    // x_raw = cos(angle), y_raw = sin(angle)
    const x_raw = ctx.b.kernelMap(angle, cos, floatFieldType);
    const y_raw = ctx.b.kernelMap(angle, sin, floatFieldType);

    // x_scaled = mul(x_raw, radius), y_scaled = mul(y_raw, radius)
    const x_scaled = ctx.b.kernelZip([x_raw, radiusBroadcast], mul, floatFieldType);
    const y_scaled = ctx.b.kernelZip([y_raw, radiusBroadcast], mul, floatFieldType);

    // x = add(x_scaled, 0.5), y = add(y_scaled, 0.5)
    const x = ctx.b.kernelZip([x_scaled, const0_5Broadcast], add, floatFieldType);
    const y = ctx.b.kernelZip([y_scaled, const0_5Broadcast], add, floatFieldType);

    // z = broadcast(0)
    const z = const0Broadcast;

    // pos = construct([x, y, z]) → vec3
    const positionField = ctx.b.construct([x, y, z], posType);

    const posSlot = ctx.b.allocSlot();

    return {
      outputsById: {
        position: { id: positionField, slot: posSlot, type: posType, stride: strideOf(posType.payload) },
      },
      instanceContext: instanceId,
    };
  },
});

/**
 * LineLayoutUV - Gauge-invariant line layout using placement basis
 *
 * Stage 3: Field operation block.
 * Takes Field<T> input and outputs Field<vec3> positions along a line.
 * Uses UV placement basis instead of normalizedIndex for gauge invariance.
 */
registerBlock({
  type: 'LineLayoutUV',
  label: 'Line Layout (UV)',
  category: 'layout',
  description: 'Arranges elements along a line using UV placement basis (gauge-invariant)',
  form: 'primitive',
  capability: 'pure',
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
    elements: { label: 'Elements', type: canonicalField(SHAPE, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
    x0: { label: 'Start X', type: canonicalType(FLOAT), value: 0.2, defaultSource: defaultSourceConst(0.2), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    y0: { label: 'Start Y', type: canonicalType(FLOAT), value: 0.2, defaultSource: defaultSourceConst(0.2), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    x1: { label: 'End X', type: canonicalType(FLOAT), value: 0.8, defaultSource: defaultSourceConst(0.8), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    y1: { label: 'End Y', type: canonicalType(FLOAT), value: 0.8, defaultSource: defaultSourceConst(0.8), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
  },
  outputs: {
    position: { label: 'Position', type: canonicalField(VEC3, unitWorld3(), { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
  },
  // NOTE: basisKind configuration will be added when BlockDef supports config.
  // For now, using 'halton2D' as the default basis kind for gauge-invariant layouts.
  lower: ({ ctx, inputsById }) => {
    const elementsInput = inputsById.elements;

    if (!elementsInput || !('type' in elementsInput && requireInst(elementsInput.type.extent.cardinality, 'cardinality').kind === 'many')) {
      throw new Error('LineLayoutUV requires a field input (from Array block)');
    }

    const instanceId = ctx.inferredInstance;
    if (!instanceId) {
      throw new Error('LineLayoutUV requires instance context from upstream Array block');
    }

    // Get resolved output type first
    const posType = ctx.outTypes[0];
    const floatFieldType = { ...posType, payload: FLOAT, unit: { kind: 'scalar' as const } };
    const vec2FieldType = { ...posType, payload: VEC2, unit: { kind: 'scalar' as const } };

    // Get line endpoints as signals
    const x0Sig = ('type' in inputsById.x0! && requireInst(inputsById.x0!.type.extent.cardinality, 'cardinality').kind === 'one')
      ? inputsById.x0!.id
      : ctx.b.constant(floatConst(0.2), canonicalType(FLOAT));
    const y0Sig = ('type' in inputsById.y0! && requireInst(inputsById.y0!.type.extent.cardinality, 'cardinality').kind === 'one')
      ? inputsById.y0!.id
      : ctx.b.constant(floatConst(0.2), canonicalType(FLOAT));
    const x1Sig = ('type' in inputsById.x1! && requireInst(inputsById.x1!.type.extent.cardinality, 'cardinality').kind === 'one')
      ? inputsById.x1!.id
      : ctx.b.constant(floatConst(0.8), canonicalType(FLOAT));
    const y1Sig = ('type' in inputsById.y1! && requireInst(inputsById.y1!.type.extent.cardinality, 'cardinality').kind === 'one')
      ? inputsById.y1!.id
      : ctx.b.constant(floatConst(0.8), canonicalType(FLOAT));

    // Use halton2D as default basis kind (user-configurable when BlockDef supports config)
    const basisKind: import('../compiler/ir/types').BasisKind = 'halton2D';

    // Create UV field from placement basis
    const uvField = ctx.b.placement('uv',
      basisKind,
      vec2FieldType
    );

    // Decompose lineLayoutUV into opcode sequence:
    // u = extract(uvField, 0) — component 0 = X
    const u = ctx.b.extract(uvField, 0, floatFieldType);

    // Constants
    const const0 = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    const const1 = ctx.b.constant(floatConst(1), canonicalType(FLOAT));

    // Broadcast constants and signals to fields
    const const0Broadcast = ctx.b.broadcast(const0, floatFieldType);
    const const1Broadcast = ctx.b.broadcast(const1, floatFieldType);
    const x0Broadcast = ctx.b.broadcast(x0Sig, floatFieldType);
    const y0Broadcast = ctx.b.broadcast(y0Sig, floatFieldType);
    const x1Broadcast = ctx.b.broadcast(x1Sig, floatFieldType);
    const y1Broadcast = ctx.b.broadcast(y1Sig, floatFieldType);

    // Opcodes
    const clamp = ctx.b.opcode(OpCode.Clamp);
    const lerp = ctx.b.opcode(OpCode.Lerp);

    // u_clamped = clamp(u, 0, 1)
    const u_clamped = ctx.b.kernelZip([u, const0Broadcast, const1Broadcast], clamp, floatFieldType);

    // x = lerp(x0, x1, u_clamped)
    const x = ctx.b.kernelZip([x0Broadcast, x1Broadcast, u_clamped], lerp, floatFieldType);

    // y = lerp(y0, y1, u_clamped)
    const y = ctx.b.kernelZip([y0Broadcast, y1Broadcast, u_clamped], lerp, floatFieldType);

    // z = broadcast(0)
    const z = const0Broadcast;

    // pos = construct([x, y, z]) → vec3
    const positionField = ctx.b.construct([x, y, z], posType);

    const posSlot = ctx.b.allocSlot();

    return {
      outputsById: {
        position: { id: positionField, slot: posSlot, type: posType, stride: strideOf(posType.payload) },
      },
      instanceContext: instanceId,
    };
  },
});

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
    elements: { label: 'Elements', type: canonicalField(SHAPE, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
    cols: { label: 'Columns', type: canonicalType(INT), value: 5, defaultSource: defaultSourceConst(5), exposedAsPort: true, uiHint: { kind: 'slider', min: 1, max: 20, step: 1 } },
    rows: { label: 'Rows', type: canonicalType(INT), value: 5, defaultSource: defaultSourceConst(5), exposedAsPort: true, uiHint: { kind: 'slider', min: 1, max: 20, step: 1 } },
  },
  outputs: {
    position: { label: 'Position', type: canonicalField(VEC3, unitWorld3(), { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
  },
  // NOTE: basisKind configuration will be added when BlockDef supports config.
  // For GridLayoutUV, using 'grid' as the default basis kind for proper grid alignment.
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
    const posType = rewriteFieldType(ctx.outTypes[0], instanceId, ctx.b);
    const floatFieldType = { ...posType, payload: FLOAT, unit: { kind: 'scalar' as const } };
    const vec2FieldType = { ...posType, payload: VEC2, unit: { kind: 'scalar' as const } };

    // Get cols and rows as signals
    const colsSig = ('type' in inputsById.cols! && requireInst(inputsById.cols!.type.extent.cardinality, 'cardinality').kind === 'one')
      ? inputsById.cols!.id
      : ctx.b.constant(intConst(5), canonicalType(INT));
    const rowsSig = ('type' in inputsById.rows! && requireInst(inputsById.rows!.type.extent.cardinality, 'cardinality').kind === 'one')
      ? inputsById.rows!.id
      : ctx.b.constant(intConst(5), canonicalType(INT));

    // Use 'grid' as default basis kind for proper grid alignment
    const basisKind: import('../compiler/ir/types').BasisKind = 'grid';

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

    const posSlot = ctx.b.allocSlot();

    return {
      outputsById: {
        position: { id: positionField, slot: posSlot, type: posType, stride: strideOf(posType.payload) },
      },
      instanceContext: instanceId,
    };
  },
});

// NOTE: CircleInstance was removed in P5 (2026-01-19).
// Use the three-stage architecture instead:
// 1. Circle (primitive) → Signal<float> (radius)
// 2. Array (cardinality) → Field<float> (many radii)
// 3. CircleLayout (operation) → Field<vec3> (circular positions)
