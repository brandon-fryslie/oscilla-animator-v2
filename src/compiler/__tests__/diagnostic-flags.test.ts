/**
 * Diagnostic Flag System Tests
 */

import { describe, it, expect } from 'vitest';
import {
  DIAGNOSTIC_FLAGS,
  getDefaultDiagnosticFlags,
  partitionByFlags,
  type DiagnosticSeverityOverride,
} from '../diagnostic-flags';
import type { TypeConstraintError } from '../frontend/analyze-type-constraints';

function makeError(kind: string, port = 'out0'): TypeConstraintError {
  return {
    kind: kind as TypeConstraintError['kind'],
    blockIndex: 0 as any,
    portName: port,
    direction: 'out',
    message: `Test error: ${kind}`,
    suggestions: ['Fix it'],
  };
}

describe('DIAGNOSTIC_FLAGS registry', () => {
  it('has at least one flag', () => {
    expect(DIAGNOSTIC_FLAGS.length).toBeGreaterThan(0);
  });

  it('every flag has required fields', () => {
    for (const flag of DIAGNOSTIC_FLAGS) {
      expect(flag.code).toBeTruthy();
      expect(flag.label).toBeTruthy();
      expect(flag.description).toBeTruthy();
      expect(['error', 'warn', 'ignore']).toContain(flag.defaultSeverity);
      expect(flag.category).toBeTruthy();
    }
  });

  it('has no duplicate codes', () => {
    const codes = DIAGNOSTIC_FLAGS.map((f) => f.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('ConflictingUnits defaults to warn', () => {
    const flag = DIAGNOSTIC_FLAGS.find((f) => f.code === 'ConflictingUnits');
    expect(flag).toBeDefined();
    expect(flag!.defaultSeverity).toBe('warn');
  });
});

describe('getDefaultDiagnosticFlags', () => {
  it('returns a Record with one entry per flag', () => {
    const defaults = getDefaultDiagnosticFlags();
    expect(Object.keys(defaults).length).toBe(DIAGNOSTIC_FLAGS.length);
    for (const flag of DIAGNOSTIC_FLAGS) {
      expect(defaults[flag.code]).toBe(flag.defaultSeverity);
    }
  });
});

describe('partitionByFlags', () => {
  it('routes errors according to default severities', () => {
    const errors = [makeError('ConflictingUnits'), makeError('ConflictingPayloads')];
    const result = partitionByFlags(errors, undefined);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].kind).toBe('ConflictingUnits');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].kind).toBe('ConflictingPayloads');
    expect(result.ignored).toHaveLength(0);
  });

  it('respects user overrides', () => {
    const errors = [makeError('ConflictingUnits'), makeError('ConflictingPayloads')];
    const flags: Record<string, DiagnosticSeverityOverride> = {
      ConflictingUnits: 'error',
      ConflictingPayloads: 'ignore',
    };
    const result = partitionByFlags(errors, flags);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].kind).toBe('ConflictingUnits');
    expect(result.ignored).toHaveLength(1);
    expect(result.ignored[0].kind).toBe('ConflictingPayloads');
    expect(result.warnings).toHaveLength(0);
  });

  it('falls back to registry default for unconfigured flags', () => {
    const errors = [makeError('MissingBlockDef')];
    const flags: Record<string, DiagnosticSeverityOverride> = { ConflictingUnits: 'warn' };
    const result = partitionByFlags(errors, flags);
    expect(result.errors).toHaveLength(1);
  });

  it('treats unknown error kinds as errors', () => {
    const errors = [makeError('SomeFutureErrorKind')];
    const result = partitionByFlags(errors, undefined);
    expect(result.errors).toHaveLength(1);
  });

  it('handles empty error list', () => {
    const result = partitionByFlags([], undefined);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.ignored).toHaveLength(0);
  });

  it('can downgrade all errors to warnings', () => {
    const allWarn: Record<string, DiagnosticSeverityOverride> = {};
    for (const flag of DIAGNOSTIC_FLAGS) {
      allWarn[flag.code] = 'warn';
    }
    const errors = DIAGNOSTIC_FLAGS.map((f) => makeError(f.code));
    const result = partitionByFlags(errors, allWarn);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(DIAGNOSTIC_FLAGS.length);
    expect(result.ignored).toHaveLength(0);
  });
});
