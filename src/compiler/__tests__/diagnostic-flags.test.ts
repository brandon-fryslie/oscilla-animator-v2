/**
 * Diagnostic Flag System Tests
 */

import { describe, it, expect } from 'vitest';
import {
  DIAGNOSTIC_FLAGS,
  getDefaultDiagnosticFlags,
} from '../diagnostic-flags';

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
