/**
 * Render Blocks
 *
 * Blocks that render visual output (sinks in the execution graph).
 *
 * Shape encoding (for shape input):
 *   0 = circle
 *   1 = square
 *   2 = triangle
 */

import { registerBlock } from './registry';
import { signalType, signalTypeField } from '../core/canonical-types';
import { defaultSourceConst } from '../types';

// =============================================================================
// RenderCircle
// =============================================================================

registerBlock({
  type: 'RenderCircle',
  label: 'Render Circle',
  category: 'render',
  description: 'Renders circles at positions with color and size',
  form: 'primitive',
  capability: 'render',
  inputs: {
    pos: { label: 'Position', type: signalTypeField('vec2', 'default') },
    color: { label: 'Color', type: signalTypeField('color', 'default') },
    size: { label: 'Size', type: signalTypeField('float', 'default'), defaultSource: defaultSourceConst(5) },
  },
  outputs: {},
  lower: ({ ctx, inputsById, config }) => {
    const pos = inputsById.pos;
    const color = inputsById.color;
    const size = inputsById.size;

    if (!pos || pos.k !== 'field') {
      throw new Error('RenderCircle pos input must be a field');
    }
    if (!color || color.k !== 'field') {
      throw new Error('RenderCircle color input must be a field');
    }

    // Get instance from field inputs (NEW - Domain Refactor Sprint 5)
    const instance = ctx.inferredInstance;
    if (!instance) {
      throw new Error('RenderCircle requires field inputs with instance context');
    }

    // Render blocks don't produce outputs - they're sinks
    // The actual rendering will be handled by the runtime
    // For now, just validate inputs and return empty outputs

    return {
      outputsById: {},
    };
  },
});

// =============================================================================
// RenderRect
// =============================================================================

registerBlock({
  type: 'RenderRect',
  label: 'Render Rectangle',
  category: 'render',
  description: 'Renders rectangles at positions with color and size',
  form: 'primitive',
  capability: 'render',
  inputs: {
    pos: { label: 'Position', type: signalTypeField('vec2', 'default') },
    color: { label: 'Color', type: signalTypeField('color', 'default') },
    width: { label: 'Width', type: signalTypeField('float', 'default'), defaultSource: defaultSourceConst(10) },
    height: { label: 'Height', type: signalTypeField('float', 'default'), defaultSource: defaultSourceConst(10) },
  },
  outputs: {},
  lower: ({ ctx, inputsById, config }) => {
    const pos = inputsById.pos;
    const color = inputsById.color;
    const width = inputsById.width;
    const height = inputsById.height;

    if (!pos || pos.k !== 'field') {
      throw new Error('RenderRect pos input must be a field');
    }
    if (!color || color.k !== 'field') {
      throw new Error('RenderRect color input must be a field');
    }

    // Get instance from field inputs (NEW - Domain Refactor Sprint 5)
    const instance = ctx.inferredInstance;
    if (!instance) {
      throw new Error('RenderRect requires field inputs with instance context');
    }

    // Render blocks don't produce outputs - they're sinks
    // The actual rendering will be handled by the runtime
    // For now, just validate inputs and return empty outputs

    return {
      outputsById: {},
    };
  },
});

// =============================================================================
// RenderInstances2D
// =============================================================================

registerBlock({
  type: 'RenderInstances2D',
  label: 'Render Instances 2D',
  category: 'render',
  description: 'Renders 2D instances at positions with color. Shape comes from wired element.',
  form: 'primitive',
  capability: 'render',
  inputs: {
    pos: { label: 'Position', type: signalTypeField('vec2', 'default') },
    color: { label: 'Color', type: signalTypeField('color', 'default') },
    shape: { label: 'Shape', type: signalType('shape') },
    scale: {
      label: 'Scale',
      type: signalType('float'),
      value: 1.0,
      defaultSource: defaultSourceConst(1.0),
      uiHint: { kind: 'slider', min: 0.1, max: 10, step: 0.1 },
    },
  },
  outputs: {},
  lower: ({ ctx, inputsById }) => {
    const pos = inputsById.pos;
    const color = inputsById.color;

    if (!pos || pos.k !== 'field') {
      throw new Error('RenderInstances2D pos input must be a field');
    }
    if (!color || color.k !== 'field') {
      throw new Error('RenderInstances2D color input must be a field');
    }

    // Get instance from field inputs (NEW - Domain Refactor Sprint 5)
    const instance = ctx.inferredInstance;
    if (!instance) {
      throw new Error('RenderInstances2D requires field inputs with instance context');
    }

    // Render blocks don't produce outputs - they're sinks
    // The actual rendering will be handled by the runtime

    return {
      outputsById: {},
    };
  },
});
