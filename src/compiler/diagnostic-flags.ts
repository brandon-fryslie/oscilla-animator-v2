/**
 * Diagnostic Flag System (GCC-Style)
 *
 * Configurable severity overrides for compiler diagnostic codes.
 * Each diagnostic code can be set to 'error', 'warn', or 'ignore'.
 *
 * Single source of truth: DIAGNOSTIC_FLAGS array.
 * To add a new flag: add one entry to the array.
 */

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
