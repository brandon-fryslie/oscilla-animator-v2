/**
 * Axis Validation Pass
 *
 * Single enforcement point for canonical type axis invariants.
 * This is the "belt buckle" that prevents nonsense from reaching the backend.
 *
 * ENFORCEMENT SCOPE (D4):
 * - **Hard invariants (enforce)**:
 *   - Event: payload=bool, unit=none, temporality=discrete
 *   - Field: cardinality=many(instance), temporality=continuous
 *   - Signal: cardinality=one, temporality=continuous
 *   - Const: cardinality=zero, temporality=continuous (Item #14)
 * - **Avoid over-enforcing**: payload/unit combos unless genuinely non-negotiable
 */

import {
  type CanonicalType,
  assertEventType,
  assertFieldType,
  assertSignalType,
  deriveKind,
  isAxisVar,
} from '../../core/canonical-types';

/**
 * Diagnostic for axis validation violation.
 */
export interface AxisViolation {
  readonly nodeKind: string;
  readonly nodeIndex: number;
  readonly kind: string;
  readonly message: string;
}

/**
 * Validate a collection of canonical types.
 * Returns violations; empty array means all valid.
 */
export function validateTypes(types: readonly CanonicalType[]): AxisViolation[] {
  const out: AxisViolation[] = [];

  for (let i = 0; i < types.length; i++) {
    const t = types[i];

    try {
      validateType(t);
    } catch (err) {
      out.push({
        nodeKind: "CanonicalType",
        nodeIndex: i,
        kind: deriveKind(t),
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return out;
}

/**
 * Validate a single canonical type.
 * Throws if invariants are violated.
 */
export function validateType(t: CanonicalType): void {
  // Core family invariants are derived from CanonicalType
  const k = deriveKind(t);

  // Enforce family invariants (Item #14: handle 'const')
  if (k === 'signal') assertSignalType(t);
  else if (k === 'field') assertFieldType(t);
  else if (k === 'event') assertEventType(t);
  else if (k === 'const') assertConstType(t);
  else {
    // Exhaustiveness check
    const _exhaustive: never = k;
    throw new Error(`Unknown derived kind: ${_exhaustive}`);
  }
}

/**
 * Assert type is a const (zero + continuous).
 * Item #14 / T03-C-1: Handle const types.
 */
export function assertConstType(t: CanonicalType): void {
  const k = deriveKind(t);
  if (k !== 'const') throw new Error(`Expected const type, got ${k}`);

  const card = t.extent.cardinality;
  if (card.kind !== 'inst' || card.value.kind !== 'zero') {
    throw new Error('Const types must have cardinality=zero (instantiated)');
  }
  const tempo = t.extent.temporality;
  if (tempo.kind !== 'inst' || tempo.value.kind !== 'continuous') {
    throw new Error('Const types must have temporality=continuous (instantiated)');
  }
}

/**
 * Validate that no type has var axes (all axes must be instantiated).
 * Item #21 / T03-U-2: Axis var escape check.
 *
 * This enforces guardrail #4: "Vars" are inference-only and must not
 * escape the frontend boundary into backend/runtime/renderer.
 *
 * @param types - Collection of CanonicalTypes to validate
 * @returns Array of violations (empty if all valid)
 */
export function validateNoVarAxes(types: readonly CanonicalType[]): AxisViolation[] {
  const violations: AxisViolation[] = [];

  for (let i = 0; i < types.length; i++) {
    const t = types[i];
    const varAxes: string[] = [];

    // Check all 5 axes
    if (isAxisVar(t.extent.cardinality)) varAxes.push('cardinality');
    if (isAxisVar(t.extent.temporality)) varAxes.push('temporality');
    if (isAxisVar(t.extent.binding)) varAxes.push('binding');
    if (isAxisVar(t.extent.perspective)) varAxes.push('perspective');
    if (isAxisVar(t.extent.branch)) varAxes.push('branch');

    if (varAxes.length > 0) {
      violations.push({
        nodeKind: 'CanonicalType',
        nodeIndex: i,
        kind: 'var-escape',
        message: `Type has uninstantiated axes: ${varAxes.join(', ')}. All axes must be instantiated before backend compilation.`,
      });
    }
  }

  return violations;
}

/**
 * Validate that a type is a valid signal.
 * Throws if not.
 */
export function validateSignal(t: CanonicalType): void {
  assertSignalType(t);
}

/**
 * Validate that a type is a valid field.
 * Throws if not.
 */
export function validateField(t: CanonicalType): void {
  assertFieldType(t);
}

/**
 * Validate that a type is a valid event.
 * Throws if not.
 */
export function validateEvent(t: CanonicalType): void {
  assertEventType(t);
}
