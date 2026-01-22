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
import { defaultSourceConst } from '../types';
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
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  inputs: {
    elements: { label: 'Elements', type: signalTypeField('???', 'default') },
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
  inputs: {
    elements: { label: 'Elements', type: signalTypeField('???', 'default') },
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

// NOTE: CircleInstance was removed in P5 (2026-01-19).
// Use the three-stage architecture instead:
// 1. Circle (primitive) → Signal<float> (radius)
// 2. Array (cardinality) → Field<float> (many radii)
// 3. GridLayout (operation) → Field<vec2> (positions)
