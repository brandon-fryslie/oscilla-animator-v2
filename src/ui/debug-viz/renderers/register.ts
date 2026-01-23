/**
 * Renderer registration - Wires concrete renderers into the registry.
 *
 * Import this module for side-effects to populate the ValueRenderer registry
 * with all built-in renderers.
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
registerRenderer('float:phase01', createFloatValueRenderer({ kind: 'phase01' }));
registerRenderer('float:norm01', createFloatValueRenderer({ kind: 'norm01' }));
registerRenderer('float:radians', createFloatValueRenderer({ kind: 'radians' }));
registerRenderer('float:degrees', createFloatValueRenderer({ kind: 'degrees' }));
registerRenderer('float:ms', createFloatValueRenderer({ kind: 'ms' }));
registerRenderer('float:seconds', createFloatValueRenderer({ kind: 'seconds' }));
