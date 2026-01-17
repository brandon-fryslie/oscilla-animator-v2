/**
 * Primitive Blocks
 *
 * Primitive blocks create Signal<T> values (Stage 1 of three-stage architecture).
 * These are NOT instances - they have cardinality ONE.
 */

import { registerBlock } from './registry';
import { signalType } from '../core/canonical-types';

// =============================================================================
// Circle Primitive
// =============================================================================

/**
 * Circle - Creates a circle primitive (Signal<circle>)
 *
 * Stage 1: Primitive block that outputs a single circle signal.
 * NOT a field - this has cardinality ONE.
 *
 * To create many circles:
 * 1. Circle → Signal<circle>
 * 2. Array → Field<circle>
 * 3. GridLayout → Field<vec2> (positions)
 */
registerBlock({
  type: 'Circle',
  label: 'Circle',
  category: 'primitive',
  description: 'Creates a circle primitive (ONE element)',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'radius', label: 'Radius', type: signalType('float'), defaultValue: 0.02 },
  ],
  outputs: [
    { id: 'circle', label: 'Circle', type: signalType('circle') },
  ],
  params: {
    radius: 0.02,
  },
  lower: ({ ctx, inputsById, config }) => {
    const radiusInput = inputsById.radius;
    const radius = radiusInput?.id ?? ctx.b.sigConst((config?.radius as number) ?? 0.02, signalType('float'));
    const slot = ctx.b.allocSlot();

    // For now, we pass through the radius signal as the "circle" signal
    // In a full implementation, this would be a struct/composite type
    return {
      outputsById: {
        circle: { k: 'sig', id: radius, slot },
      },
    };
  },
});
