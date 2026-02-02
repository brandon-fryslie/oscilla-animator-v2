/**
 * Diagnostic Flag System (GCC-Style)
 *
 * Configurable severity overrides for compiler diagnostic codes.
 * Each TypeConstraintErrorKind can be set to 'error', 'warn', or 'ignore'.
 *
 * Single source of truth: DIAGNOSTIC_FLAGS array.
 * To add a new flag: add one entry to the array.
 */

import type { TypeConstraintError } from './frontend/analyze-type-constraints';

export type DiagnosticSeverityOverride = 'error' | 'warn' | 'ignore';

export interface DiagnosticFlagDef {
  readonly code: string;
  readonly label: string;
  readonly description: string;
  readonly defaultSeverity: DiagnosticSeverityOverride;
  readonly category: string;
}

export const DIAGNOSTIC_FLAGS: readonly DiagnosticFlagDef[] = Object.freeze([
  {
    code: 'ConflictingUnits',
    label: 'Conflicting Units',
    description: 'Unit mismatch across connected ports (e.g., radians vs degrees)',
    defaultSeverity: 'warn',
    category: 'type-system',
  },
  {
    code: 'ConflictingPayloads',
    label: 'Conflicting Payloads',
    description: 'Payload type mismatch across connected ports (e.g., float vs vec3)',
    defaultSeverity: 'error',
    category: 'type-system',
  },
  {
    code: 'UnresolvedUnit',
    label: 'Unresolved Unit',
    description: 'Could not infer unit for a port',
    defaultSeverity: 'error',
    category: 'type-system',
  },
  {
    code: 'UnresolvedPayload',
    label: 'Unresolved Payload',
    description: 'Could not infer payload type for a port',
    defaultSeverity: 'error',
    category: 'type-system',
  },
  {
    code: 'MissingBlockDef',
    label: 'Missing Block Definition',
    description: 'Block type not found in registry',
    defaultSeverity: 'error',
    category: 'type-system',
  },
  {
    code: 'MissingPortDef',
    label: 'Missing Port Definition',
    description: 'Port not found on block definition',
    defaultSeverity: 'error',
    category: 'type-system',
  },
  {
    code: 'CardinalityConflict',
    label: 'Cardinality Conflict',
    description: 'Incompatible cardinality across connected ports',
    defaultSeverity: 'error',
    category: 'type-system',
  },
  {
    code: 'UnresolvedCardinality',
    label: 'Unresolved Cardinality',
    description: 'Could not resolve cardinality for a port',
    defaultSeverity: 'error',
    category: 'type-system',
  },
]);

export function getDefaultDiagnosticFlags(): Record<string, DiagnosticSeverityOverride> {
  const result: Record<string, DiagnosticSeverityOverride> = {};
  for (const flag of DIAGNOSTIC_FLAGS) {
    result[flag.code] = flag.defaultSeverity;
  }
  return result;
}

export function partitionByFlags(
  errors: readonly TypeConstraintError[],
  flags: Record<string, DiagnosticSeverityOverride> | undefined,
): { errors: TypeConstraintError[]; warnings: TypeConstraintError[]; ignored: TypeConstraintError[] } {
  const defaults = getDefaultDiagnosticFlags();
  const effectiveFlags = flags ?? defaults;

  const result = {
    errors: [] as TypeConstraintError[],
    warnings: [] as TypeConstraintError[],
    ignored: [] as TypeConstraintError[],
  };

  for (const error of errors) {
    const severity = effectiveFlags[error.kind] ?? defaults[error.kind] ?? 'error';
    if (severity === 'error') {
      result.errors.push(error);
    } else if (severity === 'warn') {
      result.warnings.push(error);
    } else {
      result.ignored.push(error);
    }
  }

  return result;
}
