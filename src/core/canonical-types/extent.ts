/**
 * Extent — Complete 5-axis where/when/about-what specification
 *
 * Assembles the 5 independent axes into a single interface.
 */

import type { Cardinality } from './cardinality';
import type { Temporality } from './temporality';
import type { Binding } from './binding';
import type { Perspective } from './perspective';
import type { Branch } from './branch';

// =============================================================================
// Extent
// =============================================================================

export interface Extent {
  readonly cardinality: Cardinality;
  readonly temporality: Temporality;
  readonly binding: Binding;
  readonly perspective: Perspective;
  readonly branch: Branch;
}
