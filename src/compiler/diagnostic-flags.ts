/**
 * Diagnostic Flag System (GCC-Style)
 *
 * Configurable severity overrides for compiler diagnostic codes.
 * Each diagnostic code can be set to 'error', 'warn', or 'ignore'.
 *
 * // [LAW:one-source-of-truth] DIAGNOSTIC_FLAGS is the single source of truth
 * for default severity and human description of every configurable fixpoint diagnostic.
 * // [LAW:single-enforcer] convertFixpointDiagnostics in frontend/index.ts is the
 * single enforcer that applies these defaults + user overrides.
 *
 * To add a new flag: add one entry to the array + ensure the solver emits
 * a FixpointDiagnostic with a matching diagnosticFlagCode.
 */

export type DiagnosticSeverityOverride = 'error' | 'warn' | 'info' | 'ignore';

export interface DiagnosticFlagDef {
  readonly code: string;
  readonly label: string;
  readonly description: string;
  readonly defaultSeverity: DiagnosticSeverityOverride;
  readonly category: string;
}

/**
 * All configurable fixpoint diagnostic codes.
 *
 * Codes match `diagnosticFlagCode` values emitted by solvers and policies.
 * Defaults are strict: everything is 'error' except structural resolutions ('ignore').
 */
export const DIAGNOSTIC_FLAGS: readonly DiagnosticFlagDef[] = Object.freeze([
  // --- Payload/Unit Solver Errors ---
  {
    code: 'ConflictingPayloads',
    label: 'Conflicting Payloads',
    description: 'Payload type mismatch across connected ports (e.g., float vs vec3)',
    defaultSeverity: 'error',
    category: 'payload-unit',
  },
  {
    code: 'ConflictingUnits',
    label: 'Conflicting Units',
    description: 'Unit mismatch across connected ports (e.g., radians vs degrees)',
    defaultSeverity: 'error',
    category: 'payload-unit',
  },
  {
    code: 'PayloadNotInAllowedSet',
    label: 'Payload Not Allowed',
    description: 'Resolved payload not in block\'s allowed set',
    defaultSeverity: 'error',
    category: 'payload-unit',
  },
  {
    code: 'UnitlessMismatch',
    label: 'Unitless Mismatch',
    description: 'Port requires unitless but has a concrete unit',
    defaultSeverity: 'error',
    category: 'payload-unit',
  },
  {
    code: 'EmptyAllowedSet',
    label: 'Empty Allowed Set',
    description: 'No common payload type across constraints',
    defaultSeverity: 'error',
    category: 'payload-unit',
  },
  {
    code: 'UnresolvedPayload',
    label: 'Unresolved Payload',
    description: 'Cannot infer payload type for a port',
    defaultSeverity: 'error',
    category: 'payload-unit',
  },
  {
    code: 'UnresolvedUnit',
    label: 'Unresolved Unit',
    description: 'Cannot infer unit for a port',
    defaultSeverity: 'error',
    category: 'payload-unit',
  },
  {
    code: 'PostSolveEdgeTypeMismatch',
    label: 'Post-solve Edge Type Mismatch',
    description: 'Resolved edge endpoint types are incompatible after payload/unit solve',
    defaultSeverity: 'error',
    category: 'payload-unit',
  },

  // --- Cardinality Solver Errors ---
  {
    code: 'ClampManyConflict',
    label: 'Clamp/Many Conflict',
    description: 'Port forced to both one and many cardinality',
    defaultSeverity: 'error',
    category: 'cardinality',
  },
  {
    code: 'InstanceConflict',
    label: 'Instance Conflict',
    description: 'Incompatible instance references in same cardinality group',
    defaultSeverity: 'error',
    category: 'cardinality',
  },
  {
    code: 'UnresolvedInstanceVar',
    label: 'Unresolved Instance Var',
    description: 'Instance variable has no resolution',
    defaultSeverity: 'error',
    category: 'cardinality',
  },
  {
    code: 'ConflictingCardinalityRelation',
    label: 'Conflicting Relation',
    description: 'Ports sharing a cardinality var declare contradictory relation policies (e.g., uniform vs promoteToMany)',
    defaultSeverity: 'error',
    category: 'cardinality',
  },
  {
    code: 'ConflictingInstanceBinding',
    label: 'Conflicting Instance Binding',
    description: 'Ports sharing a cardinality var declare contradictory instanceBinding policies (e.g., inherit vs create)',
    defaultSeverity: 'error',
    category: 'cardinality',
  },

  // --- Escape Hatch Diagnostics (currently silent — now configurable) ---
  {
    code: 'UnitDefaultedToNone',
    label: 'Unit Defaulted to None',
    description: 'Polymorphic chain with no unit evidence defaulted to unitless',
    defaultSeverity: 'ignore',
    category: 'escape-hatch',
  },
  {
    code: 'CardinalityDefaultedToOne',
    label: 'Cardinality Defaulted to One',
    description: 'Evidence-free cardinality group defaulted to one',
    defaultSeverity: 'ignore',
    category: 'escape-hatch',
  },

  // --- Structural Resolution Diagnostics ---
  {
    code: 'CardinalityAdapterInserted',
    label: 'Broadcast Inserted',
    description: 'Broadcast adapter auto-inserted for one-to-many boundary',
    defaultSeverity: 'info',
    category: 'structural',
  },
  {
    code: 'CheaterAdapterUsed',
    label: 'Payload Anchor Inserted',
    description: 'Payload anchor auto-inserted to break polymorphic chain',
    defaultSeverity: 'info',
    category: 'structural',
  },
  {
    code: 'CycleBreakInserted',
    label: 'Cycle Break Inserted',
    description: 'UnitDelay inserted to break algebraic cycle',
    defaultSeverity: 'info',
    category: 'structural',
  },
]);

// --- Lookup helpers ---

const FLAG_BY_CODE = new Map(DIAGNOSTIC_FLAGS.map(f => [f.code, f]));

/**
 * Get the default severity for a diagnostic flag code.
 * Returns 'error' for unknown codes (fail-strict).
 */
export function getDefaultSeverity(code: string): DiagnosticSeverityOverride {
  return FLAG_BY_CODE.get(code)?.defaultSeverity ?? 'error';
}

/**
 * Check if a code is a configurable diagnostic flag.
 */
export function isConfigurableCode(code: string): boolean {
  return FLAG_BY_CODE.has(code);
}

/**
 * Build a defaults record from the flag registry.
 */
export function getDefaultDiagnosticFlags(): Record<string, DiagnosticSeverityOverride> {
  const result: Record<string, DiagnosticSeverityOverride> = {};
  for (const flag of DIAGNOSTIC_FLAGS) {
    result[flag.code] = flag.defaultSeverity;
  }
  return result;
}
