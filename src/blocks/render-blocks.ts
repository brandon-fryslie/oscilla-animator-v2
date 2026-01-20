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
  inputs: [
    { id: 'pos', label: 'Position', type: signalTypeField('vec2', 'default') },
    { id: 'color', label: 'Color', type: signalTypeField('color', 'default') },
    { id: 'size', label: 'Size', type: signalTypeField('float', 'default'), defaultSource: defaultSourceConst(5) },
  ],
  outputs: [],
  params: {
    defaultSize: 10,
  },
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
  inputs: [
    { id: 'pos', label: 'Position', type: signalTypeField('vec2', 'default') },
    { id: 'color', label: 'Color', type: signalTypeField('color', 'default') },
    { id: 'width', label: 'Width', type: signalTypeField('float', 'default'), defaultSource: defaultSourceConst(10) },
    { id: 'height', label: 'Height', type: signalTypeField('float', 'default'), defaultSource: defaultSourceConst(10) },
  ],
  outputs: [],
  params: {
    defaultWidth: 10,
    defaultHeight: 10,
  },
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
  description: 'Renders 2D instances (particles/sprites) at positions with color and size',
  form: 'primitive',
  capability: 'render',
  inputs: [
    { id: 'pos', label: 'Position', type: signalTypeField('vec2', 'default') },
    { id: 'color', label: 'Color', type: signalTypeField('color', 'default') },
    { id: 'size', label: 'Size', type: signalTypeField('float', 'default'), defaultSource: defaultSourceConst(5) },
    { id: 'shape', label: 'Shape', type: signalType('int'), defaultSource: defaultSourceConst(0) }, // 0=circle, 1=square, 2=triangle
  ],
  outputs: [],
  lower: ({ ctx, inputsById }) => {
    const pos = inputsById.pos;
    const color = inputsById.color;
    const size = inputsById.size;

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
