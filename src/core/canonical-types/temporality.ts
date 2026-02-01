/**
 * Temporality Axis — Does it vary over time?
 *
 * continuous: varies every frame (signals, fields)
 * discrete: fires at specific moments (events)
 */

import type { TemporalityVarId } from '../ids.js';
import type { Axis } from './axis';
import { axisInst } from './axis';

// =============================================================================
// Types
// =============================================================================

export type TemporalityValue =
  | { readonly kind: 'continuous' }
  | { readonly kind: 'discrete' };

export type Temporality = Axis<TemporalityValue, TemporalityVarId>;

// =============================================================================
// Constructors
// =============================================================================

export function temporalityContinuous(): Temporality {
  return axisInst({ kind: 'continuous' });
}

export function temporalityDiscrete(): Temporality {
  return axisInst({ kind: 'discrete' });
}
