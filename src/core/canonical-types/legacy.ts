/**
 * Legacy/Deprecated Exports — For Migration Only
 */

import { axisInst } from './axis';
import type { Extent } from './extent';
import { FLOAT } from './payloads';

// =============================================================================
// Defaults
// =============================================================================

/**
 * Default extent for v0 compatibility.
 * All axes instantiated to defaults: one, continuous, default binding/perspective/branch.
 */
export const DEFAULTS_V0: Extent = {
  cardinality: axisInst({ kind: 'one' }),
  temporality: axisInst({ kind: 'continuous' }),
  binding: axisInst({ kind: 'unbound' }),
  perspective: axisInst({ kind: 'default' }),
  branch: axisInst({ kind: 'default' }),
};

// =============================================================================
// Deprecated
// =============================================================================

/**
 * The three derived runtime kinds: signal, field, event.
 * Per spec, these are NOT stored but derived from extent axes.
 *
 * DEPRECATED: Slated for removal when ValueExpr unification lands.
 * Consumers should dispatch on CanonicalType directly instead of this
 * lossy projection. Zero-cardinality (const) maps to 'signal' here,
 * but check `type.extent.cardinality` directly if you need to distinguish.
 */
export type DerivedKind = 'signal' | 'field' | 'event';

/**
 * Placeholder for shape migration (Q6).
 * Shape payloads removed; shapes will be modeled as resources.
 * Use FLOAT for now where shape was previously used.
 */
export const SHAPE = FLOAT;
