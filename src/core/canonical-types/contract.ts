/**
 * ValueContract — Runtime value guarantees
 *
 * Contracts declare what range/property guarantees a value provides.
 * They enable safe composition (connecting outputs to inputs that expect
 * specific ranges) and guide automatic adapter insertion.
 *
 * Contracts are EXPLICIT declarations, never inferred. A value without
 * a contract makes no range guarantees (contract: none).
 *
 * Design Reference: .agent_planning/value-contract-migration/
 */

// =============================================================================
// ValueContract Type
// =============================================================================

export type ValueContract =
  | { readonly kind: 'none' }      // No guarantee (default for all values)
  | { readonly kind: 'clamp01' }   // [0,1] clamped (unipolar phase)
  | { readonly kind: 'wrap01' }    // [0,1) cyclic wrap (modulo 1)
  | { readonly kind: 'clamp11' }   // [-1,1] clamped (bipolar)

// =============================================================================
// Constructors
// =============================================================================

/** Create a 'none' contract (no range guarantee). */
export function contractNone(): ValueContract {
  return { kind: 'none' };
}

/** Create a 'clamp01' contract ([0,1] clamped). */
export function contractClamp01(): ValueContract {
  return { kind: 'clamp01' };
}

/** Create a 'wrap01' contract ([0,1) cyclic wrap). */
export function contractWrap01(): ValueContract {
  return { kind: 'wrap01' };
}

/** Create a 'clamp11' contract ([-1,1] clamped). */
export function contractClamp11(): ValueContract {
  return { kind: 'clamp11' };
}

// =============================================================================
// Equality
// =============================================================================

/**
 * Check if two contracts are equal.
 * Treats undefined as 'none' for backward compatibility.
 */
export function contractsEqual(
  a: ValueContract | undefined,
  b: ValueContract | undefined
): boolean {
  const aKind = a?.kind ?? 'none';
  const bKind = b?.kind ?? 'none';
  return aKind === bKind;
}

// =============================================================================
// Compatibility
// =============================================================================

/**
 * Check if a source contract is compatible with a target contract.
 *
 * Compatibility rules:
 * - Target expects no contract (none)? Always compatible (dropping guarantee is OK).
 * - Target expects a specific contract? Source must provide the SAME guarantee.
 *
 * Examples:
 * - clamp01 → none: OK (dropping guarantee)
 * - none → clamp01: NOT OK (needs Clamp01 adapter)
 * - wrap01 → clamp01: NOT OK (different guarantees, needs adapter)
 * - clamp01 → clamp01: OK (same guarantee)
 *
 * This implements a strength ordering where:
 * - 'none' is the weakest (accepts anything, provides nothing)
 * - All other contracts are strong (provide specific guarantees)
 * - Strong → weak (none) is OK
 * - Weak (none) → strong needs adapter
 * - Different strong → different strong needs adapter
 */
export function contractsCompatible(
  source: ValueContract | undefined,
  target: ValueContract | undefined
): boolean {
  const sourceKind = source?.kind ?? 'none';
  const targetKind = target?.kind ?? 'none';

  // Target expects nothing? Always compatible.
  if (targetKind === 'none') return true;

  // Target expects something specific? Source must provide the same guarantee.
  return sourceKind === targetKind;
}
