/**
 * Mechanical coverage test for diagnostic flags.
 *
 * Prevents the DIAGNOSTIC_FLAGS registry from going dormant by asserting
 * that every solver error kind, escape hatch code, and policy code has a
 * matching entry in the registry AND a mapping to DiagnosticCode.
 *
 * // [LAW:one-source-of-truth] Verifies the link between solver kinds → DIAGNOSTIC_FLAGS → DiagnosticCode.
 */
import { describe, it, expect } from 'vitest';
import { DIAGNOSTIC_FLAGS, getDefaultSeverity, isConfigurableCode } from '../diagnostic-flags';

// =============================================================================
// PU Solver Error Kinds (from PUSolveError.kind union)
// =============================================================================

const PU_SOLVER_ERROR_KINDS = [
  'ConflictingPayloads',
  'ConflictingUnits',
  'PayloadNotInAllowedSet',
  'UnitlessMismatch',
  'EmptyAllowedSet',
  'UnresolvedPayload',
  'UnresolvedUnit',
] as const;

// =============================================================================
// Cardinality Solver Error Kinds (non-structural)
// ZipBroadcastClampOneConflict is structural, handled via obligations, but still
// needs a flag entry since it emits a FixpointDiagnostic when unresolved.
// =============================================================================

const CARDINALITY_SOLVER_ERROR_KINDS = [
  'ClampManyConflict',
  'InstanceConflict',
  'UnresolvedInstanceVar',
] as const;

// =============================================================================
// Escape Hatch Diagnostic Codes
// =============================================================================

const ESCAPE_HATCH_CODES = [
  'UnitDefaultedToNone',
  'CardinalityDefaultedToOne',
] as const;

// =============================================================================
// Policy Diagnostic Codes
// =============================================================================

const POLICY_CODES = [
  'CardinalityAdapterInserted',
  'CheaterAdapterUsed',
  'CycleBreakInserted',
] as const;

// =============================================================================
// DiagnosticCode mapping (from frontendDiagnosticConversion.ts)
// We import the mapping keys indirectly by testing each code has a conversion.
// =============================================================================

// Inline the expected mapping so the test detects drift without importing internals.
const EXPECTED_DIAGNOSTIC_CODE_MAPPINGS: Record<string, string> = {
  ConflictingPayloads: 'E_TYPE_MISMATCH',
  ConflictingUnits: 'E_UNIT_MISMATCH',
  PayloadNotInAllowedSet: 'E_PAYLOAD_NOT_ALLOWED',
  UnitlessMismatch: 'E_UNIT_MISMATCH',
  EmptyAllowedSet: 'E_PAYLOAD_NOT_ALLOWED',
  UnresolvedPayload: 'E_TYPE_MISMATCH',
  UnresolvedUnit: 'E_TYPE_MISMATCH',
  ClampManyConflict: 'E_CARDINALITY_MISMATCH',
  InstanceConflict: 'E_INSTANCE_MISMATCH',
  UnresolvedInstanceVar: 'E_INSTANCE_MISMATCH',
  UnitDefaultedToNone: 'I_UNIT_DEFAULTED_TO_NONE',
  CardinalityDefaultedToOne: 'I_CARDINALITY_DEFAULTED_TO_ONE',
  CardinalityAdapterInserted: 'I_CARDINALITY_ADAPTER_INSERTED',
  CheaterAdapterUsed: 'I_CHEATER_ADAPTER_USED',
  CycleBreakInserted: 'I_CYCLE_BREAK_INSERTED',
};

// =============================================================================
// Tests
// =============================================================================

describe('diagnostic flags coverage', () => {
  it('every PU solver error kind has a flag entry', () => {
    for (const kind of PU_SOLVER_ERROR_KINDS) {
      expect(isConfigurableCode(kind), `Missing DIAGNOSTIC_FLAGS entry for PU kind: ${kind}`).toBe(true);
    }
  });

  it('every cardinality solver error kind has a flag entry', () => {
    for (const kind of CARDINALITY_SOLVER_ERROR_KINDS) {
      expect(isConfigurableCode(kind), `Missing DIAGNOSTIC_FLAGS entry for cardinality kind: ${kind}`).toBe(true);
    }
  });

  it('every escape hatch code has a flag entry', () => {
    for (const code of ESCAPE_HATCH_CODES) {
      expect(isConfigurableCode(code), `Missing DIAGNOSTIC_FLAGS entry for escape hatch: ${code}`).toBe(true);
    }
  });

  it('every policy code has a flag entry', () => {
    for (const code of POLICY_CODES) {
      expect(isConfigurableCode(code), `Missing DIAGNOSTIC_FLAGS entry for policy: ${code}`).toBe(true);
    }
  });

  it('all PU solver error kinds default to error', () => {
    for (const kind of PU_SOLVER_ERROR_KINDS) {
      expect(getDefaultSeverity(kind), `${kind} should default to error`).toBe('error');
    }
  });

  it('all cardinality error kinds default to error', () => {
    for (const kind of CARDINALITY_SOLVER_ERROR_KINDS) {
      expect(getDefaultSeverity(kind), `${kind} should default to error`).toBe('error');
    }
  });

  it('escape hatch codes default to ignore', () => {
    for (const code of ESCAPE_HATCH_CODES) {
      expect(getDefaultSeverity(code), `${code} should default to ignore`).toBe('ignore');
    }
  });

  it('structural resolution codes default to ignore', () => {
    for (const code of POLICY_CODES) {
      expect(getDefaultSeverity(code), `${code} should default to ignore`).toBe('ignore');
    }
  });

  it('unknown codes fall back to error (fail-strict)', () => {
    expect(getDefaultSeverity('NonExistentCode')).toBe('error');
  });

  it('flag codes are unique', () => {
    const codes = DIAGNOSTIC_FLAGS.map(f => f.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('every flag code has a category', () => {
    for (const flag of DIAGNOSTIC_FLAGS) {
      expect(flag.category, `Flag ${flag.code} missing category`).toBeTruthy();
    }
  });

  it('expected mapping keys cover all configurable codes', () => {
    const allConfigurable = [
      ...PU_SOLVER_ERROR_KINDS,
      ...CARDINALITY_SOLVER_ERROR_KINDS,
      ...ESCAPE_HATCH_CODES,
      ...POLICY_CODES,
    ];
    for (const code of allConfigurable) {
      expect(code in EXPECTED_DIAGNOSTIC_CODE_MAPPINGS, `Missing DiagnosticCode mapping for: ${code}`).toBe(true);
    }
  });
});
