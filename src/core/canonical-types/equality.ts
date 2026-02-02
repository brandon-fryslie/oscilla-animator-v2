/**
 * Type Equality — Deep structural comparison
 *
 * All equality functions require instantiated axes (no var support).
 */

import { requireInst } from './axis';
import type { CardinalityValue } from './cardinality';
import type { TemporalityValue } from './temporality';
import type { BindingValue } from './binding';
import type { PerspectiveValue } from './perspective';
import type { BranchValue } from './branch';
import type { Extent } from './extent';
import type { CanonicalType } from './canonical-type';
import { payloadsEqual } from './payloads';
import { unitsEqual } from './units';
import { contractsEqual } from './contract';

// =============================================================================
// Per-Axis Equality
// =============================================================================

/** Check if two CardinalityValue objects are equal. */
export function cardinalitiesEqual(a: CardinalityValue, b: CardinalityValue): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'zero' || a.kind === 'one') return true;
  const aMany = a as Extract<CardinalityValue, { kind: 'many' }>;
  const bMany = b as Extract<CardinalityValue, { kind: 'many' }>;
  return (
    aMany.instance.domainTypeId === bMany.instance.domainTypeId &&
    aMany.instance.instanceId === bMany.instance.instanceId
  );
}

/** Check if two TemporalityValue objects are equal. */
export function temporalitiesEqual(a: TemporalityValue, b: TemporalityValue): boolean {
  return a.kind === b.kind;
}

/** Check if two BindingValue objects are equal. */
export function bindingsEqual(a: BindingValue, b: BindingValue): boolean {
  return a.kind === b.kind;
}

/** Check if two PerspectiveValue objects are equal. */
export function perspectivesEqual(a: PerspectiveValue, b: PerspectiveValue): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'default') return true;
  const aSpec = a as Extract<PerspectiveValue, { kind: 'specific' }>;
  const bSpec = b as Extract<PerspectiveValue, { kind: 'specific' }>;
  return (
    aSpec.instance.domainTypeId === bSpec.instance.domainTypeId &&
    aSpec.instance.instanceId === bSpec.instance.instanceId
  );
}

/** Check if two BranchValue objects are equal. */
export function branchesEqual(a: BranchValue, b: BranchValue): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'default') return true;
  const aSpec = a as Extract<BranchValue, { kind: 'specific' }>;
  const bSpec = b as Extract<BranchValue, { kind: 'specific' }>;
  return (
    aSpec.instance.domainTypeId === bSpec.instance.domainTypeId &&
    aSpec.instance.instanceId === bSpec.instance.instanceId
  );
}

// =============================================================================
// Compound Equality
// =============================================================================

/**
 * Check if two Extent objects are equal (all 5 axes must match).
 * Does NOT support vars - both must be fully instantiated.
 */
export function extentsEqual(a: Extent, b: Extent): boolean {
  const aCard = requireInst(a.cardinality, 'cardinality');
  const bCard = requireInst(b.cardinality, 'cardinality');
  if (!cardinalitiesEqual(aCard, bCard)) return false;

  const aTempo = requireInst(a.temporality, 'temporality');
  const bTempo = requireInst(b.temporality, 'temporality');
  if (!temporalitiesEqual(aTempo, bTempo)) return false;

  const aBind = requireInst(a.binding, 'binding');
  const bBind = requireInst(b.binding, 'binding');
  if (!bindingsEqual(aBind, bBind)) return false;

  const aPersp = requireInst(a.perspective, 'perspective');
  const bPersp = requireInst(b.perspective, 'perspective');
  if (!perspectivesEqual(aPersp, bPersp)) return false;

  const aBranch = requireInst(a.branch, 'branch');
  const bBranch = requireInst(b.branch, 'branch');
  if (!branchesEqual(aBranch, bBranch)) return false;

  return true;
}

/**
 * Check if two CanonicalType objects are equal (deep structural equality).
 * Does NOT support vars - both must be fully instantiated.
 * Treats undefined contract as 'none'.
 */
export function typesEqual(a: CanonicalType, b: CanonicalType): boolean {
  return (
    payloadsEqual(a.payload, b.payload) &&
    unitsEqual(a.unit, b.unit) &&
    extentsEqual(a.extent, b.extent) &&
    contractsEqual(a.contract, b.contract)
  );
}
