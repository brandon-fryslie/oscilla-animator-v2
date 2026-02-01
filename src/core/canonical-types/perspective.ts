/**
 * Perspective Axis — From whose point of view?
 *
 * default: standard perspective
 * specific: from a particular instance's perspective
 */

import type { PerspectiveVarId } from '../ids.js';
import type { Axis } from './axis';
import type { InstanceRef } from './instance-ref';

// =============================================================================
// Types
// =============================================================================

export type PerspectiveValue =
  | { readonly kind: 'default' }
  | { readonly kind: 'specific'; readonly instance: InstanceRef };

export type Perspective = Axis<PerspectiveValue, PerspectiveVarId>;

export const DEFAULT_PERSPECTIVE: PerspectiveValue = { kind: 'default' };
