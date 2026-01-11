/**
 * Render Blocks
 *
 * Blocks that render visual output (sinks in the execution graph).
 */

import { registerBlock } from './registry';
import { registerBlockType } from '../compiler/ir/lowerTypes';
import { signalType, signalTypeField } from '../core/canonical-types';

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
    { id: 'domain', label: 'Domain', type: signalType('float') },
    { id: 'pos', label: 'Position', type: signalTypeField('vec2', 'default') },
    { id: 'color', label: 'Color', type: signalTypeField('color', 'default') },
    { id: 'size', label: 'Size', type: signalTypeField('float', 'default') },
  ],
  outputs: [],
  params: {
    defaultSize: 10,
  },
});

registerBlockType({
  type: 'RenderCircle',
  inputs: [
    { portId: 'domain', type: signalType('float') },
    { portId: 'pos', type: signalTypeField('vec2', 'default') },
    { portId: 'color', type: signalTypeField('color', 'default') },
    { portId: 'size', type: signalTypeField('float', 'default') },
  ],
  outputs: [],
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
    { id: 'domain', label: 'Domain', type: signalType('float') },
    { id: 'pos', label: 'Position', type: signalTypeField('vec2', 'default') },
    { id: 'color', label: 'Color', type: signalTypeField('color', 'default') },
    { id: 'width', label: 'Width', type: signalTypeField('float', 'default') },
    { id: 'height', label: 'Height', type: signalTypeField('float', 'default') },
  ],
  outputs: [],
  params: {
    defaultWidth: 10,
    defaultHeight: 10,
  },
});

registerBlockType({
  type: 'RenderRect',
  inputs: [
    { portId: 'domain', type: signalType('float') },
    { portId: 'pos', type: signalTypeField('vec2', 'default') },
    { portId: 'color', type: signalTypeField('color', 'default') },
    { portId: 'width', type: signalTypeField('float', 'default') },
    { portId: 'height', type: signalTypeField('float', 'default') },
  ],
  outputs: [],
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

    // Render blocks don't produce outputs - they're sinks
    // The actual rendering will be handled by the runtime
    // For now, just validate inputs and return empty outputs

    return {
      outputsById: {},
    };
  },
});
