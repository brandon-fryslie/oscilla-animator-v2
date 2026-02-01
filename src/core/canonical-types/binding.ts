/**
 * Binding Axis — What instance does this value belong to?
 *
 * unbound: not associated with any instance
 * weak: loosely associated
 * strong: tightly associated
 * identity: IS the instance identity
 */

import type { BindingVarId } from '../ids.js';
import type { Axis } from './axis';
import { axisInst } from './axis';

// =============================================================================
// Types
// =============================================================================

export type BindingValue =
  | { readonly kind: 'unbound' }
  | { readonly kind: 'weak' }
  | { readonly kind: 'strong' }
  | { readonly kind: 'identity' };

export type Binding = Axis<BindingValue, BindingVarId>;

export const DEFAULT_BINDING: BindingValue = { kind: 'unbound' };

// =============================================================================
// Constructors
// =============================================================================

export function bindingUnbound(): Binding {
  return axisInst({ kind: 'unbound' });
}

export function bindingWeak(): Binding {
  return axisInst({ kind: 'weak' });
}

export function bindingStrong(): Binding {
  return axisInst({ kind: 'strong' });
}

export function bindingIdentity(): Binding {
  return axisInst({ kind: 'identity' });
}
