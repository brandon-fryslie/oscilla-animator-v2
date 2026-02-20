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
import { vec2ValueRenderer } from './Vec2ValueRenderer';
import { vec3ValueRenderer } from './Vec3ValueRenderer';
import { vec4ValueRenderer } from './Vec4ValueRenderer';
import { cameraProjectionRenderer } from './CameraProjectionRenderer';
import { boolValueRenderer, eventValueRenderer } from './BoolEventValueRenderer';

// Category fallbacks (tier 3)
registerRenderer('category:numeric', genericNumericRenderer);
registerRenderer('category:color', colorValueRenderer);

// Payload-level (tier 2)
registerRenderer('float', floatValueRenderer);
registerRenderer('color', colorValueRenderer);
registerRenderer('vec2', vec2ValueRenderer);
registerRenderer('vec3', vec3ValueRenderer);
registerRenderer('vec4', vec4ValueRenderer);
registerRenderer('cameraProjection', cameraProjectionRenderer);
registerRenderer('bool', boolValueRenderer);
// Note: 'event' is not a payload type in the current system, events are bool-valued

// Exact matches (tier 1) — unit-specific float renderers
// Use structured unit constructors
registerRenderer('float:turns', createFloatValueRenderer({ kind: 'angle', unit: 'turns' }));
registerRenderer('float:radians', createFloatValueRenderer({ kind: 'angle', unit: 'radians' }));
registerRenderer('float:degrees', createFloatValueRenderer({ kind: 'angle', unit: 'degrees' }));
registerRenderer('float:ms', createFloatValueRenderer({ kind: 'time', unit: 'ms' }));
registerRenderer('float:seconds', createFloatValueRenderer({ kind: 'time', unit: 'seconds' }));
