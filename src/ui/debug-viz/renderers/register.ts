/**
 * Renderer registration - Wires concrete renderers into the registry.
 *
 * Import this module for side-effects to populate the ValueRenderer registry
 * with all built-in renderers.
 *
 * Updated for structured UnitType (#18).
 */

import { registerRenderer } from '../ValueRenderer';
import { genericNumericRenderer } from './GenericNumericRenderer';
import { floatValueRenderer, createFloatValueRenderer } from './FloatValueRenderer';
import { colorValueRenderer } from './ColorValueRenderer';

// Category fallbacks (tier 3)
registerRenderer('category:numeric', genericNumericRenderer);
registerRenderer('category:color', colorValueRenderer);
registerRenderer('category:shape', genericNumericRenderer); // shape uses generic for now

// Payload-level (tier 2)
registerRenderer('float', floatValueRenderer);
registerRenderer('color', colorValueRenderer);

// Exact matches (tier 1) — unit-specific float renderers
// Use structured unit constructors
registerRenderer('float:phase01', createFloatValueRenderer({ kind: 'angle', unit: 'phase01' }));
registerRenderer('float:norm01', createFloatValueRenderer({ kind: 'norm01' }));
registerRenderer('float:radians', createFloatValueRenderer({ kind: 'angle', unit: 'radians' }));
registerRenderer('float:degrees', createFloatValueRenderer({ kind: 'angle', unit: 'degrees' }));
registerRenderer('float:ms', createFloatValueRenderer({ kind: 'time', unit: 'ms' }));
registerRenderer('float:seconds', createFloatValueRenderer({ kind: 'time', unit: 'seconds' }));
