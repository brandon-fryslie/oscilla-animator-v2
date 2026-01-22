/**
 * Instance Blocks
 *
 * Instance and layout blocks following three-stage architecture:
 * - Stage 2 blocks (Array) create instances
 * - Stage 3 blocks (layouts) apply spatial operations to fields
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from './registry';
import { signalType, signalTypeField, type PayloadType } from '../core/canonical-types';
import { DOMAIN_CIRCLE } from '../core/domain-registry';
import { defaultSourceConst } from '../types';
import type { LayoutSpec } from '../compiler/ir/types';

// =============================================================================
// Layout Blocks (Stage 3: Field Operations) - Payload-Generic
// =============================================================================

/**
 * GridLayout - Arranges field elements in a grid pattern
 *
 * Stage 3: Field operation block.
 * Takes Field<T> input and outputs Field<vec2> positions.
 *
 * Payload-Generic: Accepts any concrete payload type for elements input.
 *
 * Example:
 * Array (Field<float>) → GridLayout → Field<vec2> (grid positions)
 *
 * This is NOT a metadata hack - it uses ctx.b.fieldLayout() to create
 * a proper layout field expression in the IR.
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
    elements: { label: 'Elements', type: signalTypeField('float', 'default') },
    rows: { label: 'Rows', type: signalType('int'), value: 10, defaultSource: defaultSourceConst(10), exposedAsPort: false },
    cols: { label: 'Columns', type: signalType('int'), value: 10, defaultSource: defaultSourceConst(10), exposedAsPort: false },
  },
  outputs: {
    position: { label: 'Position', type: signalTypeField('vec2', 'default') },
  },
  lower: ({ ctx, inputsById, config }) => {
    const elementsInput = inputsById.elements;

    if (!elementsInput || elementsInput.k !== 'field') {
      throw new Error('GridLayout requires a field input (from Array block)');
    }

    const rows = (config?.rows as number) ?? 10;
    const cols = (config?.cols as number) ?? 10;
    const layout: LayoutSpec = { kind: 'grid', rows, cols };

    // Get instance context from the field input
    // The instance context should be set by the Array block
    const instanceId = ctx.inferredInstance;
    if (!instanceId) {
      throw new Error('GridLayout requires instance context from upstream Array block');
    }

    // Create layout field using fieldLayout()
    const positionField = ctx.b.fieldLayout(
      elementsInput.id,
      layout,
      instanceId,
      signalTypeField('vec2', 'default')
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
 * LinearLayout - Arranges field elements in a linear pattern
 *
 * Stage 3: Field operation block.
 * Takes Field<T> input and outputs Field<vec2> positions.
 *
 * Payload-Generic: Accepts any concrete payload type for elements input.
 */
registerBlock({
  type: 'LinearLayout',
  label: 'Linear Layout',
  category: 'layout',
  description: 'Arranges elements in a linear pattern',
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
    elements: { label: 'Elements', type: signalTypeField('float', 'default') },
    spacing: { label: 'Spacing', type: signalType('float'), value: 0.1, defaultSource: defaultSourceConst(0.1), exposedAsPort: false },
  },
  outputs: {
    position: { label: 'Position', type: signalTypeField('vec2', 'default') },
  },
  lower: ({ ctx, inputsById, config }) => {
    const elementsInput = inputsById.elements;

    if (!elementsInput || elementsInput.k !== 'field') {
      throw new Error('LinearLayout requires a field input (from Array block)');
    }

    const spacing = (config?.spacing as number) ?? 0.1;
    const layout: LayoutSpec = { kind: 'linear', spacing };

    // Get instance context from the field input
    const instanceId = ctx.inferredInstance;
    if (!instanceId) {
      throw new Error('LinearLayout requires instance context from upstream Array block');
    }

    // Create layout field using fieldLayout()
    const positionField = ctx.b.fieldLayout(
      elementsInput.id,
      layout,
      instanceId,
      signalTypeField('vec2', 'default')
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
 * Takes Field<T> input and outputs Field<vec2> positions on a circle.
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
    elements: { label: 'Elements', type: signalTypeField('float', 'default') },
    radius: { label: 'Radius', type: signalType('float'), value: 0.3, defaultSource: defaultSourceConst(0.3), exposedAsPort: true },
    phase: { label: 'Phase', type: signalType('float'), value: 0, defaultSource: defaultSourceConst(0), exposedAsPort: true },
  },
  outputs: {
    position: { label: 'Position', type: signalTypeField('vec2', 'default') },
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

    // Apply circleLayout kernel: normalizedIndex + [radius, phase] → vec2 positions
    const positionField = ctx.b.fieldZipSig(
      normalizedIndexField,
      [radiusSig, phaseSig],
      { kind: 'kernel', name: 'circleLayout' },
      signalTypeField('vec2', 'default')
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
 * Takes Field<T> input and outputs Field<vec2> positions along a line.
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
    elements: { label: 'Elements', type: signalTypeField('float', 'default') },
    x0: { label: 'Start X', type: signalType('float'), value: 0.1, defaultSource: defaultSourceConst(0.1), exposedAsPort: true },
    y0: { label: 'Start Y', type: signalType('float'), value: 0.5, defaultSource: defaultSourceConst(0.5), exposedAsPort: true },
    x1: { label: 'End X', type: signalType('float'), value: 0.9, defaultSource: defaultSourceConst(0.9), exposedAsPort: true },
    y1: { label: 'End Y', type: signalType('float'), value: 0.5, defaultSource: defaultSourceConst(0.5), exposedAsPort: true },
  },
  outputs: {
    position: { label: 'Position', type: signalTypeField('vec2', 'default') },
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

    // Apply lineLayout kernel: normalizedIndex + [x0, y0, x1, y1] → vec2 positions
    const positionField = ctx.b.fieldZipSig(
      normalizedIndexField,
      [x0Sig, y0Sig, x1Sig, y1Sig],
      { kind: 'kernel', name: 'lineLayout' },
      signalTypeField('vec2', 'default')
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
// 3. CircleLayout (operation) → Field<vec2> (circular positions)
