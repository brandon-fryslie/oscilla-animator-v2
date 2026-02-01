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
 *   - Const: cardinality=zero, temporality=continuous (no const events)
 * - **Avoid over-enforcing**: payload/unit combos unless genuinely non-negotiable
 */

import {
  type CanonicalType,
  type BindingValue,
  requireInst,
  isAxisVar,
  isAxisInst,
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
 * Binding mismatch error with structured left/right values and remedy suggestions.
 * Item #17 / Q9: Structured BindingMismatchError
 *
 * This provides typed diagnostic information for binding unification failures,
 * enabling UI to suggest appropriate remedies.
 */
export interface BindingMismatchError {
  readonly left: BindingValue;
  readonly right: BindingValue;
  readonly location: {
    readonly leftBlockId?: string;
    readonly leftPortId?: string;
    readonly rightBlockId?: string;
    readonly rightPortId?: string;
  };
  readonly remedy: BindingMismatchRemedy;
  readonly message: string;
}

/**
 * Remedies for binding mismatches.
 * Item #17: Structured remedy suggestions.
 */
export type BindingMismatchRemedy =
  | 'insert-state-op'        // Insert stateful boundary (e.g., UnitDelay)
  | 'insert-continuity-op'   // Insert continuity operator (e.g., Lag, Slew)
  | 'rewire';                // Rewire to avoid binding conflict

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
        kind: derivedKindLabel(t),
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return out;
}

/**
 * Derive a kind label from extent axes (local to this module, not exported).
 * Used for diagnostics only. Zero-cardinality → 'const'.
 */
function derivedKindLabel(t: CanonicalType): string {
  const card = requireInst(t.extent.cardinality, 'cardinality');
  const tempo = requireInst(t.extent.temporality, 'temporality');
  if (tempo.kind === 'discrete') return 'event';
  if (card.kind === 'many') return 'field';
  if (card.kind === 'zero') return 'const';
  return 'signal';
}

/**
 * Validate a single canonical type.
 * Throws if invariants are violated.
 * Dispatches on extent axes directly (no deriveKind dependency).
 */
export function validateType(t: CanonicalType): void {
  const card = requireInst(t.extent.cardinality, 'cardinality');
  const tempo = requireInst(t.extent.temporality, 'temporality');

  if (tempo.kind === 'discrete') {
    assertEventInvariants(t);
  } else if (card.kind === 'many') {
    assertFieldInvariants(t);
  } else if (card.kind === 'zero') {
    assertConstInvariants(t);
  } else {
    // one cardinality + continuous = signal
    assertSignalInvariants(t);
  }
}

/**
 * Assert signal type invariants (one + continuous).
 */
function assertSignalInvariants(t: CanonicalType): void {
  const card = t.extent.cardinality;
  const tempo = t.extent.temporality;

  if (!isAxisInst(card) || card.value.kind !== 'one') {
    throw new Error('Signal types must have cardinality=one (instantiated)');
  }
  if (!isAxisInst(tempo) || tempo.value.kind !== 'continuous') {
    throw new Error('Signal types must have temporality=continuous (instantiated)');
  }
}

/**
 * Assert field type invariants (many + continuous).
 */
function assertFieldInvariants(t: CanonicalType): void {
  const card = t.extent.cardinality;
  const tempo = t.extent.temporality;

  if (!isAxisInst(card) || card.value.kind !== 'many') {
    throw new Error('Field types must have cardinality=many(instance) (instantiated)');
  }
  if (!isAxisInst(tempo) || tempo.value.kind !== 'continuous') {
    throw new Error('Field types must have temporality=continuous (instantiated)');
  }
}

/**
 * Assert const type invariants (zero + continuous).
 * TYPE-SYSTEM-INVARIANTS #P2: zero-cardinality + discrete is forbidden (no const events).
 */
function assertConstInvariants(t: CanonicalType): void {
  const card = t.extent.cardinality;
  const tempo = t.extent.temporality;

  if (!isAxisInst(card) || card.value.kind !== 'zero') {
    throw new Error('Const types must have cardinality=zero (instantiated)');
  }
  if (!isAxisInst(tempo) || tempo.value.kind !== 'continuous') {
    throw new Error('Const types must have temporality=continuous (zero-cardinality events are forbidden)');
  }
}

/**
 * Assert event type invariants (discrete + bool + none unit).
 */
function assertEventInvariants(t: CanonicalType): void {
  const tempo = t.extent.temporality;
  const card = t.extent.cardinality;

  // Hard invariant: temporality must be discrete
  if (!isAxisInst(tempo) || tempo.value.kind !== 'discrete') {
    throw new Error('Event types must have temporality=discrete (instantiated)');
  }

  // Hard invariant: cardinality must be one (not zero - no const events)
  if (!isAxisInst(card) || card.value.kind !== 'one') {
    throw new Error('Event types must have cardinality=one (const events are forbidden)');
  }

  // Hard invariant: payload must be bool
  if (t.payload.kind !== 'bool') {
    throw new Error('Event types must have payload=bool');
  }

  // Hard invariant: unit must be none
  if (t.unit.kind !== 'none') {
    throw new Error('Event types must have unit=none');
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
 * Create a BindingMismatchError from binding values.
 * Item #17: Structured binding mismatch diagnostics.
 *
 * @param left - Left binding value
 * @param right - Right binding value
 * @param location - Source location information
 * @returns Structured binding mismatch error
 */
export function createBindingMismatchError(
  left: BindingValue,
  right: BindingValue,
  location: BindingMismatchError['location']
): BindingMismatchError {
  const remedy = determineBindingRemedy(left, right);
  const message = formatBindingMismatch(left, right, remedy);

  return {
    left,
    right,
    location,
    remedy,
    message,
  };
}

/**
 * Determine the appropriate remedy for a binding mismatch.
 */
function determineBindingRemedy(left: BindingValue, right: BindingValue): BindingMismatchRemedy {
  // If one is unbound and the other is bound, suggest continuity
  if (left.kind === 'unbound' && right.kind !== 'unbound') {
    return 'insert-continuity-op';
  }
  if (left.kind !== 'unbound' && right.kind === 'unbound') {
    return 'insert-continuity-op';
  }

  // If both are bound but to different strengths, need state boundary
  if (left.kind !== 'unbound' && right.kind !== 'unbound' && left.kind !== right.kind) {
    return 'insert-state-op';
  }

  // Default fallback
  return 'rewire';
}

/**
 * Format binding mismatch message with remedy suggestion.
 */
function formatBindingMismatch(
  left: BindingValue,
  right: BindingValue,
  remedy: BindingMismatchRemedy
): string {
  const leftStr = JSON.stringify(left);
  const rightStr = JSON.stringify(right);

  const remedyText = {
    'insert-state-op': 'Insert a stateful block (e.g., UnitDelay) to break the binding cycle.',
    'insert-continuity-op': 'Insert a continuity operator (e.g., Lag, Slew) to align binding semantics.',
    'rewire': 'Rewire connections to avoid binding conflict.',
  }[remedy];

  return `Binding mismatch: cannot unify ${leftStr} with ${rightStr}. Remedy: ${remedyText}`;
}

/**
 * Validate that a type is a valid signal.
 * Throws if not.
 */
export function validateSignal(t: CanonicalType): void {
  assertSignalInvariants(t);
}

/**
 * Validate that a type is a valid field.
 * Throws if not.
 */
export function validateField(t: CanonicalType): void {
  assertFieldInvariants(t);
}

/**
 * Validate that a type is a valid event.
 * Throws if not.
 */
export function validateEvent(t: CanonicalType): void {
  assertEventInvariants(t);
}
