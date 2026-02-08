/**
 * Unit Types (Spec §A3)
 *
 * Closed discriminated union of 8 structured unit kinds.
 * Every typed value has (payload, unit, extent). Unit is ALWAYS present.
 * Units are semantic, not representational: turns != none even though
 * both are float32 at runtime.
 *
 * Migration Note (ValueContract Sprint 2):
 * - Removed 'norm01' kind (replaced by none + contract:clamp01)
 * - Removed 'scalar' kind (unified with 'none' — one dimensionless concept)
 * - Renamed angle unit 'phase01' → 'turns' (clearer name for [0,1) cyclic angle)
 */

// =============================================================================
// UnitType
// =============================================================================

export type UnitType =
  | { readonly kind: 'none' }
  | { readonly kind: 'count' }
  | { readonly kind: 'angle'; readonly unit: 'radians' | 'degrees' | 'turns' }
  | { readonly kind: 'time'; readonly unit: 'ms' | 'seconds' }
  | { readonly kind: 'space'; readonly unit: 'ndc' | 'world' | 'view'; readonly dims: 2 | 3 }
  | { readonly kind: 'color'; readonly unit: 'rgba01' | 'hsl' };

// =============================================================================
// Constructors
// =============================================================================

/** Unitless (bool, enums) */
export function unitNone(): UnitType {
  return { kind: 'none' };
}

/** Integer count/index */
export function unitCount(): UnitType {
  return { kind: 'none' };
}

/** Angle in turns [0,1) with wrap semantics (one full rotation = 1.0) */
export function unitTurns(): UnitType {
  return { kind: 'angle', unit: 'turns' };
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

/** Float color RGBA each in [0,1] (sRGB-encoded) */
export function unitRgba01(): UnitType {
  return { kind: 'color', unit: 'rgba01' };
}

/** HSL+A color: h ∈ [0,1) wrap, s/l/a ∈ [0,1] clamp */
export function unitHsl(): UnitType {
  return { kind: 'color', unit: 'hsl' };
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
    case 'count':
      return true; // Kind match is sufficient for simple units
    default: {
      const _exhaustive: never = a;
      throw new Error(`Unknown unit kind in unitsEqual: ${(_exhaustive as UnitType).kind}`);
    }
  }
}
