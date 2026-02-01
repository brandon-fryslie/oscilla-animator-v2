/**
 * Instance Blocks
 *
 * Instance and layout blocks following three-stage architecture:
 * - Stage 2 blocks (Array) create instances
 * - Stage 3 blocks (layouts) apply spatial operations to fields using field kernels
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from './registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../core/ids';
import { canonicalType, canonicalField, unitPhase01, unitWorld3, strideOf, floatConst, intConst, requireInst } from '../core/canonical-types';
import { FLOAT, INT, VEC2, VEC3, SHAPE } from '../core/canonical-types';
import { defaultSourceConst } from '../types';

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

    // Get resolved output type first
    const posType = ctx.outTypes[0];
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

    // Apply circleLayoutUV kernel: uv + [radius, phase] → vec3 positions
    const positionField = ctx.b.kernelZipSig(
      uvField,
      [radiusSig, phaseSig],
      { kind: 'kernel', name: 'circleLayoutUV' },
      posType
    );

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

    // Apply lineLayoutUV kernel: uv + [x0, y0, x1, y1] → vec3 positions
    const positionField = ctx.b.kernelZipSig(
      uvField,
      [x0Sig, y0Sig, x1Sig, y1Sig],
      { kind: 'kernel', name: 'lineLayoutUV' },
      posType
    );

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

    // Get resolved output type first
    const posType = ctx.outTypes[0];
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

    // Apply gridLayoutUV kernel: uv + [cols, rows] → vec3 positions
    const positionField = ctx.b.kernelZipSig(
      uvField,
      [colsSig, rowsSig],
      { kind: 'kernel', name: 'gridLayoutUV' },
      posType
    );

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
