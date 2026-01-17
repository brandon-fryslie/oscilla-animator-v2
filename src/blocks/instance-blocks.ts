/**
 * Instance Blocks
 *
 * Instance and layout blocks following three-stage architecture:
 * - Stage 2 blocks (Array) create instances
 * - Stage 3 blocks (layouts) apply spatial operations to fields
 */

import { registerBlock } from './registry';
import { signalType, signalTypeField } from '../core/canonical-types';
import { DOMAIN_CIRCLE } from '../core/domain-registry';
import { defaultSourceConstant } from '../types';
import type { LayoutSpec } from '../compiler/ir/types';

// =============================================================================
// Layout Blocks (Stage 3: Field Operations)
// =============================================================================

/**
 * GridLayout - Arranges field elements in a grid pattern
 *
 * Stage 3: Field operation block.
 * Takes Field<T> input and outputs Field<vec2> positions.
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
  inputs: [
    { id: 'elements', label: 'Elements', type: signalTypeField('???', 'default') },
    { id: 'rows', label: 'Rows', type: signalType('int'), defaultValue: 10 },
    { id: 'cols', label: 'Columns', type: signalType('int'), defaultValue: 10 },
  ],
  outputs: [
    { id: 'position', label: 'Position', type: signalTypeField('vec2', 'default') },
  ],
  params: {
    rows: 10,
    cols: 10,
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
    };
  },
});

/**
 * LinearLayout - Arranges field elements in a linear pattern
 *
 * Stage 3: Field operation block.
 * Takes Field<T> input and outputs Field<vec2> positions.
 */
registerBlock({
  type: 'LinearLayout',
  label: 'Linear Layout',
  category: 'layout',
  description: 'Arranges elements in a linear pattern',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'elements', label: 'Elements', type: signalTypeField('???', 'default') },
    { id: 'spacing', label: 'Spacing', type: signalType('float'), defaultValue: 0.1 },
  ],
  outputs: [
    { id: 'position', label: 'Position', type: signalTypeField('vec2', 'default') },
  ],
  params: {
    spacing: 0.1,
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
    };
  },
});

// =============================================================================
// DEPRECATED: CircleInstance (Replaced by Circle + Array + GridLayout)
// =============================================================================
//
// CircleInstance has been replaced by the three-stage architecture:
// 1. Circle (primitive) → Signal<float> (radius)
// 2. Array (cardinality) → Field<float> (many radii)
// 3. GridLayout (operation) → Field<vec2> (positions)
//
// This block will be removed in P5.
// For now, it's kept for backward compatibility with existing patches.

registerBlock({
  type: 'CircleInstance',
  label: 'Circle Instance (DEPRECATED)',
  category: 'instance',
  description: '[DEPRECATED] Use Circle → Array → GridLayout instead',
  form: 'primitive',
  capability: 'identity',
  inputs: [
    { id: 'count', label: 'Count', type: signalType('int'), defaultValue: 100, defaultSource: defaultSourceConstant(100) },
  ],
  outputs: [
    { id: 'position', label: 'Position', type: signalTypeField('vec2', 'default') },
    { id: 'radius', label: 'Radius', type: signalTypeField('float', 'default') },
    { id: 'index', label: 'Index', type: signalTypeField('int', 'default') },
    { id: 't', label: 'T (normalized)', type: signalTypeField('float', 'default') },
  ],
  params: {
    count: 100,
    layoutKind: 'grid',
    rows: 10,
    cols: 10,
  },
  lower: ({ ctx, config }) => {
    const count = (config?.count as number) ?? 100;
    const layoutKind = (config?.layoutKind as string) ?? 'grid';
    const rows = (config?.rows as number) ?? 10;
    const cols = (config?.cols as number) ?? 10;

    let layout: LayoutSpec;
    if (layoutKind === 'grid') {
      layout = { kind: 'grid', rows, cols };
    } else {
      layout = { kind: 'unordered' };
    }

    // Create instance using new IRBuilder method
    const instanceId = ctx.b.createInstance(DOMAIN_CIRCLE, count, layout);

    // Create field expressions for intrinsic properties
    const positionField = ctx.b.fieldIntrinsic(instanceId, 'position', signalTypeField('vec2', 'default'));
    const radiusField = ctx.b.fieldIntrinsic(instanceId, 'radius', signalTypeField('float', 'default'));
    const indexField = ctx.b.fieldIntrinsic(instanceId, 'index', signalTypeField('int', 'default'));
    const tField = ctx.b.fieldIntrinsic(instanceId, 'normalizedIndex', signalTypeField('float', 'default'));

    return {
      outputsById: {
        position: { k: 'field', id: positionField, slot: ctx.b.allocSlot() },
        radius: { k: 'field', id: radiusField, slot: ctx.b.allocSlot() },
        index: { k: 'field', id: indexField, slot: ctx.b.allocSlot() },
        t: { k: 'field', id: tField, slot: ctx.b.allocSlot() },
      },
    };
  },
});
