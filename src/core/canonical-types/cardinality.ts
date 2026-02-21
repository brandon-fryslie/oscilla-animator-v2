/**
 * Cardinality Axis — How many instances exist?
 *
 * zero: compile-time constant (universal donor)
 * one: single-lane value
 * many: one value per instance
 */

import type { CardinalityVarId, DomainTypeId } from '../ids.js';
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

/**
 * Relationship between ports sharing the same cardinality var.
 *
 * - uniform: all ports in the group must resolve to the same cardinality
 * - promoteToMany: many evidence propagates; one-only ports may remain one
 */
export type CardinalityRelation = 'uniform' | 'promoteToMany';

/**
 * Per-port acceptance bounds for a cardinality var.
 *
 * - oneOrMany: flexible (solver can resolve to one or many)
 * - oneOnly: fixed one cardinality
 * - manyOnly: fixed many cardinality
 */
export type CardinalityAcceptance = 'oneOrMany' | 'oneOnly' | 'manyOnly';

/**
 * Instance binding rule for many-cardinality resolution.
 *
 * - inherit: keep upstream instance identity
 * - create: this port/group creates a new instance in the given domain
 */
export type CardinalityInstanceBinding =
  | 'inherit'
  | { readonly kind: 'create'; readonly domainType: DomainTypeId };

/**
 * Full cardinality behavior contract declared on a var axis.
 * // [LAW:one-source-of-truth] Cardinality flexibility and propagation live on CT/ICT.
 */
export interface CardinalityPolicy {
  readonly relation?: CardinalityRelation;
  readonly acceptance?: CardinalityAcceptance;
  readonly instanceBinding?: CardinalityInstanceBinding;
}

export interface ResolvedCardinalityPolicy {
  readonly relation: CardinalityRelation;
  readonly acceptance: CardinalityAcceptance;
  readonly instanceBinding: CardinalityInstanceBinding;
}

export type CardinalityVarAxis =
  & { readonly kind: 'var'; readonly var: CardinalityVarId }
  & CardinalityPolicy;

export type CardinalityInstAxis = { readonly kind: 'inst'; readonly value: CardinalityValue };
export type Cardinality = CardinalityVarAxis | CardinalityInstAxis;

export const DEFAULT_CARDINALITY_POLICY: ResolvedCardinalityPolicy = {
  relation: 'uniform',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
};

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

/**
 * Create a cardinality variable axis with explicit behavior policy.
 */
export function cardinalityVar(
  id: CardinalityVarId,
  policy?: CardinalityPolicy,
): Cardinality {
  return {
    kind: 'var',
    var: id,
    relation: policy?.relation,
    acceptance: policy?.acceptance,
    instanceBinding: policy?.instanceBinding,
  };
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

/**
 * Resolve effective cardinality policy for a var axis, applying defaults.
 */
export function resolveCardinalityPolicy(
  axis: Axis<CardinalityValue, CardinalityVarId>,
): ResolvedCardinalityPolicy | null {
  if (axis.kind !== 'var') return null;
  const cardAxis = axis as CardinalityVarAxis;
  return {
    relation: cardAxis.relation ?? DEFAULT_CARDINALITY_POLICY.relation,
    acceptance: cardAxis.acceptance ?? DEFAULT_CARDINALITY_POLICY.acceptance,
    instanceBinding: cardAxis.instanceBinding ?? DEFAULT_CARDINALITY_POLICY.instanceBinding,
  };
}
