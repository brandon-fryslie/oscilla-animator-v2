/**
 * src/testing/__tests__/rg-search.test.ts
 *
 * Pins the JS fallback's glob handling to rg semantics: every exclusion glob
 * is honored (not just a hardcoded pair), basename globs match basenames, and
 * path globs match relative paths. The fallback is what CI images without rg
 * execute, so a silently-ignored exclusion there turns a passing gate into a
 * false failure. [LAW:no-silent-failure] [LAW:behavior-not-structure]
 */

import { describe, expect, it } from 'vitest';
import { jsRegexLines } from '../rg-search';

const GATE_GLOBS = ['*.ts', '*.tsx', '!**/*.test.*', '!**/__tests__/**'];

describe('jsRegexLines glob handling', () => {
  it('finds the canonical deriveKind definition when not excluded (positive control)', () => {
    const matches = jsRegexLines('\\bderiveKind\\(', ['src/pillars/types/validate'], GATE_GLOBS);
    expect(matches.some((m) => m.startsWith('src/pillars/types/validate/derive-kind.ts:'))).toBe(true);
  });

  it('honors an exact-path exclusion glob', () => {
    const matches = jsRegexLines('\\bderiveKind\\(', ['src/pillars/types/validate'], [
      ...GATE_GLOBS,
      '!src/pillars/types/validate/derive-kind.ts',
    ]);
    expect(matches.filter((m) => m.startsWith('src/pillars/types/validate/derive-kind.ts:'))).toEqual([]);
  });

  it('applies basename include globs (no .ts match under a .tsx-only filter)', () => {
    expect(jsRegexLines('globToRegExp', ['src/testing'], ['*.tsx'])).toEqual([]);
    expect(jsRegexLines('globToRegExp', ['src/testing'], ['*.ts', '!**/__tests__/**']).length).toBeGreaterThan(0);
  });

  it('excludes *.test.* files by basename glob regardless of directory', () => {
    const matches = jsRegexLines('describe', ['src/testing'], ['*.ts', '!**/*.test.*']);
    expect(matches.filter((m) => m.includes('.test.'))).toEqual([]);
  });

  it('include glob *.test.* matches test files by basename', () => {
    const matches = jsRegexLines('describe', ['src/testing'], ['*.test.*']);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.split(':')[0].includes('.test.'))).toBe(true);
  });

  it('last matching glob wins: an include after an exclusion re-includes', () => {
    const globs = ['*.ts', '!rg-search.ts', 'rg-search.ts'];
    const matches = jsRegexLines('function globToRegExp', ['src/testing'], globs);
    expect(matches.some((m) => m.startsWith('src/testing/rg-search.ts:'))).toBe(true);
  });

  it('last matching glob wins: an exclusion after an include excludes', () => {
    const globs = ['*.ts', 'rg-search.ts', '!rg-search.ts'];
    const matches = jsRegexLines('function globToRegExp', ['src/testing'], globs);
    expect(matches.filter((m) => m.startsWith('src/testing/rg-search.ts:'))).toEqual([]);
  });

  it('throws on glob constructs the translator does not support', () => {
    expect(() => jsRegexLines('x', ['src/testing'], ['*.[jt]s'])).toThrow(/Unsupported glob construct/);
  });

  it('replicates the no-legacy-types deriveKind gate under the fallback path', () => {
    const matches = jsRegexLines('\\bderiveKind\\(', ['src'], [
      ...GATE_GLOBS,
      '!src/pillars/types/validate/derive-kind.ts',
    ]);
    expect(matches).toEqual([]);
  });
});
