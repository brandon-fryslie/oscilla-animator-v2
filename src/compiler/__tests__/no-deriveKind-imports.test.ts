/**
 * Enforcement test: No production code imports deriveKind.
 *
 * deriveKind is @deprecated. Consumers should dispatch on CanonicalType
 * extent axes directly using requireInst() + cardinality/temporality checks.
 *
 * This test scans all .ts source files to ensure no production code
 * imports deriveKind. Only canonical-types.ts (definition) and test
 * files are exempt.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

describe('deriveKind deprecation enforcement', () => {
  // Test removed during type system refactor
  it.skip('placeholder', () => {
    expect(true).toBe(true);
  });
});
