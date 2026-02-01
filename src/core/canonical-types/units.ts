/**
 * Unit Types (Spec §A3)
 *
 * Closed discriminated union of 8 structured unit kinds.
 * Every typed value has (payload, unit, extent). Unit is ALWAYS present.
 * Units are semantic, not representational: phase01 != scalar even though
 * both are float32 at runtime.
 */

// =============================================================================
// UnitType
// =============================================================================

export type UnitType =
  | { readonly kind: 'none' }
  | { readonly kind: 'scalar' }
  | { readonly kind: 'norm01' }
  | { readonly kind: 'count' }
  | { readonly kind: 'angle'; readonly unit: 'radians' | 'degrees' | 'phase01' }
  | { readonly kind: 'time'; readonly unit: 'ms' | 'seconds' }
  | { readonly kind: 'space'; readonly unit: 'ndc' | 'world' | 'view'; readonly dims: 2 | 3 }
  | { readonly kind: 'color'; readonly unit: 'rgba01' };

// =============================================================================
// Constructors
// =============================================================================

/** Unitless (bool, enums) */
export function unitNone(): UnitType {
  return { kind: 'none' };
}

/** Dimensionless numeric scalar */
export function unitScalar(): UnitType {
  return { kind: 'scalar' };
}

/** Normalized [0,1] */
export function unitNorm01(): UnitType {
  return { kind: 'norm01' };
}

/** Integer count/index */
export function unitCount(): UnitType {
  return { kind: 'count' };
}

/** Angle in phase [0,1) with wrap semantics */
export function unitPhase01(): UnitType {
  return { kind: 'angle', unit: 'phase01' };
}

/** Angle in radians */
export function unitRadians(): UnitType {
  return { kind: 'angle', unit: 'radians' };
}

/** Angle in degrees (no 'deg' - only 'degrees' per #19) */
export function unitDegrees(): UnitType {
  return { kind: 'angle', unit: 'degrees' };
}

/** Time in milliseconds */
export function unitMs(): UnitType {
  return { kind: 'time', unit: 'ms' };
}

/** Time in seconds */
export function unitSeconds(): UnitType {
  return { kind: 'time', unit: 'seconds' };
}

/** Normalized device coordinates vec2 [0,1]^2 */
export function unitNdc2(): UnitType {
  return { kind: 'space', unit: 'ndc', dims: 2 };
}

/** Normalized device coordinates vec3 [0,1]^3 */
export function unitNdc3(): UnitType {
  return { kind: 'space', unit: 'ndc', dims: 3 };
}

/** World-space vec2 */
export function unitWorld2(): UnitType {
  return { kind: 'space', unit: 'world', dims: 2 };
}

/** World-space vec3 */
export function unitWorld3(): UnitType {
  return { kind: 'space', unit: 'world', dims: 3 };
}

/** Float color RGBA each in [0,1] */
export function unitRgba01(): UnitType {
  return { kind: 'color', unit: 'rgba01' };
}

// =============================================================================
// Equality
// =============================================================================

/**
 * Compare two units for deep structural equality.
 * Updated for #18 to handle nested unit and dims fields.
 */
export function unitsEqual(a: UnitType, b: UnitType): boolean {
  if (a.kind !== b.kind) return false;

  // Structural comparison for kinds with nested fields
  switch (a.kind) {
    case 'angle':
      return (b as Extract<UnitType, { kind: 'angle' }>).unit === a.unit;
    case 'time':
      return (b as Extract<UnitType, { kind: 'time' }>).unit === a.unit;
    case 'space': {
      const bSpace = b as Extract<UnitType, { kind: 'space' }>;
      return bSpace.unit === a.unit && bSpace.dims === a.dims;
    }
    case 'color':
      return (b as Extract<UnitType, { kind: 'color' }>).unit === a.unit;
    case 'none':
    case 'scalar':
    case 'norm01':
    case 'count':
      return true; // Kind match is sufficient for simple units
    default: {
      const _exhaustive: never = a;
      throw new Error(`Unknown unit kind in unitsEqual: ${(_exhaustive as UnitType).kind}`);
    }
  }
}
