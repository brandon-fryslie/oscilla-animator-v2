/**
 * Axis Pattern — Variable or Instantiated
 *
 * Generic discriminated union supporting polymorphic type inference (var)
 * and resolved types (inst). Enables constraint solving during type inference,
 * then resolves to instantiated values.
 *
 * T = value type (e.g., CardinalityValue)
 * V = variable ID type (e.g., CardinalityVarId)
 */

// =============================================================================
// Axis<T, V>
// =============================================================================

export type Axis<T, V> =
  | { readonly kind: 'var'; readonly var: V }
  | { readonly kind: 'inst'; readonly value: T };

// =============================================================================
// Constructors
// =============================================================================

/** Create a type variable axis. */
export function axisVar<T, V>(v: V): Axis<T, V> {
  return { kind: 'var', var: v };
}

/** Create an instantiated axis. */
export function axisInst<T, V>(value: T): Axis<T, V> {
  return { kind: 'inst', value };
}

// =============================================================================
// Type Guards
// =============================================================================

/** Check if an axis is a type variable. */
export function isAxisVar<T, V>(a: Axis<T, V>): a is { kind: 'var'; var: V } {
  return a.kind === 'var';
}

/** Check if an axis is instantiated. */
export function isAxisInst<T, V>(a: Axis<T, V>): a is { kind: 'inst'; value: T } {
  return a.kind === 'inst';
}

/** Extract instantiated value from axis, or throw if variable. */
export function requireInst<T, V>(a: Axis<T, V>, name: string): T {
  if (isAxisInst(a)) return a.value;
  throw new Error(`Expected instantiated ${name}, got var: ${JSON.stringify(a)}`);
}
