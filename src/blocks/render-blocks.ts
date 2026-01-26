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
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION } from '../core/canonical-types';
import { defaultSourceConst } from '../types';

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
  cardinality: {
    cardinalityMode: 'fieldOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    pos: { label: 'Position', type: signalTypeField(VEC3, 'default') },
    color: { label: 'Color', type: signalTypeField(COLOR, 'default') },
    shape: { label: 'Shape', type: signalType(SHAPE) },
    scale: {
      label: 'Scale',
      type: signalType(FLOAT),
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
