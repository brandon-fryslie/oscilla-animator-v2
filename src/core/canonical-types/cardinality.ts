/**
 * Cardinality Axis — How many instances exist?
 *
 * zero: compile-time constant (universal donor)
 * one: signal (single value)
 * many: field (one value per instance)
 */

import type { CardinalityVarId } from '../ids.js';
import type { Axis } from './axis';
import { axisInst } from './axis';
import type { InstanceRef } from './instance-ref';

// =============================================================================
// Types
// =============================================================================

export type CardinalityValue =
  | { readonly kind: 'zero' }
  | { readonly kind: 'one' }
  | { readonly kind: 'many'; readonly instance: InstanceRef };

export type Cardinality = Axis<CardinalityValue, CardinalityVarId>;

// =============================================================================
// Constructors
// =============================================================================

export function cardinalityZero(): Cardinality {
  return axisInst({ kind: 'zero' });
}

export function cardinalityOne(): Cardinality {
  return axisInst({ kind: 'one' });
}

export function cardinalityMany(instance: InstanceRef): Cardinality {
  return axisInst({ kind: 'many', instance });
}

// =============================================================================
// Type Guards
// =============================================================================

export function isMany(c: CardinalityValue): c is { readonly kind: 'many'; readonly instance: InstanceRef } {
  return c.kind === 'many';
}

export function isOne(c: CardinalityValue): c is { readonly kind: 'one' } {
  return c.kind === 'one';
}

export function isZero(c: CardinalityValue): c is { readonly kind: 'zero' } {
  return c.kind === 'zero';
}
