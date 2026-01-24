/**
 * Instance Blocks
 *
 * Instance and layout blocks following three-stage architecture:
 * - Stage 2 blocks (Array) create instances
 * - Stage 3 blocks (layouts) apply spatial operations to fields using field kernels
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from './registry';
import { signalType, signalTypeField, unitPhase01, type PayloadType } from '../core/canonical-types';
import { DOMAIN_CIRCLE } from '../core/domain-registry';
import { defaultSourceConst } from '../types';

// =============================================================================
// Layout Blocks (Stage 3: Field Operations) - Payload-Generic
// =============================================================================

/**
 * GridLayout - Arranges field elements in a grid pattern
 *
 * Stage 3: Field operation block.
 * Takes Field<T> input and outputs Field<vec3> positions.
 *
 * Payload-Generic: Accepts any concrete payload type for elements input.
 *
 * Example:
 * Array (Field<float>) → GridLayout → Field<vec3> (grid positions)
 *
 * Uses the gridLayout field kernel per 15-layout.md spec.
 */
registerBlock({
  type: 'GridLayout',
  label: 'Grid Layout',
  category: 'layout',
  description: 'Arranges elements in a grid pattern',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  payload: {
    allowedPayloads: {
      elements: ALL_CONCRETE_PAYLOADS,
    },
    semantics: 'typeSpecific',
  },
  inputs: {
    elements: { label: 'Elements', type: signalTypeField('shape', 'default') },
    rows: { label: 'Rows', type: signalType('int'), value: 10, defaultSource: defaultSourceConst(10), exposedAsPort: false },
    cols: { label: 'Columns', type: signalType('int'), value: 10, defaultSource: defaultSourceConst(10), exposedAsPort: false },
  },
  outputs: {
    position: { label: 'Position', type: signalTypeField('vec3', 'default') },
  },
  lower: ({ ctx, inputsById, config }) => {
    const elementsInput = inputsById.elements;

    if (!elementsInput || elementsInput.k !== 'field') {
      throw new Error('GridLayout requires a field input (from Array block)');
    }

    const instanceId = ctx.inferredInstance;
    if (!instanceId) {
      throw new Error('GridLayout requires instance context from upstream Array block');
    }

    // Get grid dimensions as signals
    const rowsSig = inputsById.rows?.k === 'sig'
      ? inputsById.rows.id
      : ctx.b.sigConst((config?.rows as number) ?? 10, signalType('int'));
    const colsSig = inputsById.cols?.k === 'sig'
      ? inputsById.cols.id
      : ctx.b.sigConst((config?.cols as number) ?? 10, signalType('int'));

    // Create index field for the instance (gridLayout expects integer indices)
    const indexField = ctx.b.fieldIntrinsic(
      instanceId,
      'index',
      signalTypeField('float', 'default')
    );

    // Apply gridLayout kernel: index + [cols, rows] → vec3 positions
    const positionField = ctx.b.fieldZipSig(
      indexField,
      [colsSig, rowsSig],
      { kind: 'kernel', name: 'gridLayout' },
      signalTypeField('vec3', 'default')
    );

    return {
      outputsById: {
        position: { k: 'field', id: positionField, slot: ctx.b.allocSlot() },
      },
      // Propagate instance context downstream
      instanceContext: instanceId,
    };
  },
});

/**
 * LinearLayout - Arranges field elements in a vertical line
 *
 * Stage 3: Field operation block.
 * Takes Field<T> input and outputs Field<vec3> positions along a vertical line.
 *
 * Uses the lineLayout field kernel per 15-layout.md spec.
 * For more control over line direction, use LineLayout instead.
 */
registerBlock({
  type: 'LinearLayout',
  label: 'Linear Layout',
  category: 'layout',
  description: 'Arranges elements in a vertical line',
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
    elements: { label: 'Elements', type: signalTypeField('shape', 'default') },
    spacing: { label: 'Length', type: signalType('float'), value: 0.8, defaultSource: defaultSourceConst(0.8), exposedAsPort: true },
  },
  outputs: {
    position: { label: 'Position', type: signalTypeField('vec3', 'default') },
  },
  lower: ({ ctx, inputsById, config }) => {
    const elementsInput = inputsById.elements;

    if (!elementsInput || elementsInput.k !== 'field') {
      throw new Error('LinearLayout requires a field input (from Array block)');
    }

    // Get instance context from the field input
    const instanceId = ctx.inferredInstance;
    if (!instanceId) {
      throw new Error('LinearLayout requires instance context from upstream Array block');
    }

    // Get length parameter (renamed from spacing for clarity)
    const length = (config?.spacing as number) ?? 0.8;

    // Create vertical line: center X, Y spans from (1-length)/2 to (1+length)/2
    const x0Sig = ctx.b.sigConst(0.5, signalType('float'));
    const y0Sig = ctx.b.sigConst((1 - length) / 2, signalType('float'));
    const x1Sig = ctx.b.sigConst(0.5, signalType('float'));
    const y1Sig = ctx.b.sigConst((1 + length) / 2, signalType('float'));

    // Create normalizedIndex field for the instance
    const normalizedIndexField = ctx.b.fieldIntrinsic(
      instanceId,
      'normalizedIndex',
      signalTypeField('float', 'default')
    );

    // Apply lineLayout kernel: normalizedIndex + [x0, y0, x1, y1] → vec3 positions
    const positionField = ctx.b.fieldZipSig(
      normalizedIndexField,
      [x0Sig, y0Sig, x1Sig, y1Sig],
      { kind: 'kernel', name: 'lineLayout' },
      signalTypeField('vec3', 'default')
    );

    return {
      outputsById: {
        position: { k: 'field', id: positionField, slot: ctx.b.allocSlot() },
      },
      // Propagate instance context downstream
      instanceContext: instanceId,
    };
  },
});

// =============================================================================
// NEW LAYOUT BLOCKS (Using Field Kernels - Phase 6 Migration)
// =============================================================================

/**
 * CircleLayout - Arranges field elements in a circle using circleLayout kernel
 *
 * Stage 3: Field operation block.
 * Takes Field<T> input and outputs Field<vec3> positions on a circle.
 *
 * This uses the circleLayout field kernel directly instead of LayoutSpec.
 * From .agent_planning/_future/_now/15-layout.md spec.
 */
registerBlock({
  type: 'CircleLayout',
  label: 'Circle Layout',
  category: 'layout',
  description: 'Arranges elements in a circle pattern',
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
    elements: { label: 'Elements', type: signalTypeField('shape', 'default') },
    radius: { label: 'Radius', type: signalType('float'), value: 0.3, defaultSource: defaultSourceConst(0.3), exposedAsPort: true },
    phase: { label: 'Phase', type: signalType('float', unitPhase01()), value: 0, defaultSource: defaultSourceConst(0), exposedAsPort: true },
  },
  outputs: {
    position: { label: 'Position', type: signalTypeField('vec3', 'default') },
  },
  lower: ({ ctx, inputsById, config }) => {
    const elementsInput = inputsById.elements;

    if (!elementsInput || elementsInput.k !== 'field') {
      throw new Error('CircleLayout requires a field input (from Array block)');
    }

    const instanceId = ctx.inferredInstance;
    if (!instanceId) {
      throw new Error('CircleLayout requires instance context from upstream Array block');
    }

    // Get radius and phase as signals
    const radiusSig = inputsById.radius?.k === 'sig'
      ? inputsById.radius.id
      : ctx.b.sigConst((config?.radius as number) ?? 0.3, signalType('float'));
    const phaseSig = inputsById.phase?.k === 'sig'
      ? inputsById.phase.id
      : ctx.b.sigConst((config?.phase as number) ?? 0, signalType('float'));

    // Create normalizedIndex field for the instance
    const normalizedIndexField = ctx.b.fieldIntrinsic(
      instanceId,
      'normalizedIndex',
      signalTypeField('float', 'default')
    );

    // Apply circleLayout kernel: normalizedIndex + [radius, phase] → vec3 positions
    const positionField = ctx.b.fieldZipSig(
      normalizedIndexField,
      [radiusSig, phaseSig],
      { kind: 'kernel', name: 'circleLayout' },
      signalTypeField('vec3', 'default')
    );

    return {
      outputsById: {
        position: { k: 'field', id: positionField, slot: ctx.b.allocSlot() },
      },
      instanceContext: instanceId,
    };
  },
});

/**
 * LineLayout - Arranges field elements along a line using lineLayout kernel
 *
 * Stage 3: Field operation block.
 * Takes Field<T> input and outputs Field<vec3> positions along a line.
 *
 * This uses the lineLayout field kernel directly instead of LayoutSpec.
 * From .agent_planning/_future/_now/15-layout.md spec.
 */
registerBlock({
  type: 'LineLayout',
  label: 'Line Layout',
  category: 'layout',
  description: 'Arranges elements along a line from start to end',
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
    elements: { label: 'Elements', type: signalTypeField('shape', 'default') },
    x0: { label: 'Start X', type: signalType('float'), value: 0.1, defaultSource: defaultSourceConst(0.1), exposedAsPort: true },
    y0: { label: 'Start Y', type: signalType('float'), value: 0.5, defaultSource: defaultSourceConst(0.5), exposedAsPort: true },
    x1: { label: 'End X', type: signalType('float'), value: 0.9, defaultSource: defaultSourceConst(0.9), exposedAsPort: true },
    y1: { label: 'End Y', type: signalType('float'), value: 0.5, defaultSource: defaultSourceConst(0.5), exposedAsPort: true },
  },
  outputs: {
    position: { label: 'Position', type: signalTypeField('vec3', 'default') },
  },
  lower: ({ ctx, inputsById, config }) => {
    const elementsInput = inputsById.elements;

    if (!elementsInput || elementsInput.k !== 'field') {
      throw new Error('LineLayout requires a field input (from Array block)');
    }

    const instanceId = ctx.inferredInstance;
    if (!instanceId) {
      throw new Error('LineLayout requires instance context from upstream Array block');
    }

    // Get line endpoints as signals
    const x0Sig = inputsById.x0?.k === 'sig'
      ? inputsById.x0.id
      : ctx.b.sigConst((config?.x0 as number) ?? 0.1, signalType('float'));
    const y0Sig = inputsById.y0?.k === 'sig'
      ? inputsById.y0.id
      : ctx.b.sigConst((config?.y0 as number) ?? 0.5, signalType('float'));
    const x1Sig = inputsById.x1?.k === 'sig'
      ? inputsById.x1.id
      : ctx.b.sigConst((config?.x1 as number) ?? 0.9, signalType('float'));
    const y1Sig = inputsById.y1?.k === 'sig'
      ? inputsById.y1.id
      : ctx.b.sigConst((config?.y1 as number) ?? 0.5, signalType('float'));

    // Create normalizedIndex field for the instance
    const normalizedIndexField = ctx.b.fieldIntrinsic(
      instanceId,
      'normalizedIndex',
      signalTypeField('float', 'default')
    );

    // Apply lineLayout kernel: normalizedIndex + [x0, y0, x1, y1] → vec3 positions
    const positionField = ctx.b.fieldZipSig(
      normalizedIndexField,
      [x0Sig, y0Sig, x1Sig, y1Sig],
      { kind: 'kernel', name: 'lineLayout' },
      signalTypeField('vec3', 'default')
    );

    return {
      outputsById: {
        position: { k: 'field', id: positionField, slot: ctx.b.allocSlot() },
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
