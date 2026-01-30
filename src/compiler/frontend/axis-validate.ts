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
 * - **Avoid over-enforcing**: payload/unit combos unless genuinely non-negotiable
 */

import {
  type CanonicalType,
  assertEventType,
  assertFieldType,
  assertSignalType,
  deriveKind,
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

  // Enforce family invariants
  if (k === 'signal') assertSignalType(t);
  else if (k === 'field') assertFieldType(t);
  else assertEventType(t);
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
