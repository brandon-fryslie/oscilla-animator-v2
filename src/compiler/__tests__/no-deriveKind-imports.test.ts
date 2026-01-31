/**
 * Enforcement test: No production code imports deriveKind.
 *
 * deriveKind is @deprecated. Consumers should dispatch on CanonicalType
 * extent axes directly using isSignalType/isFieldType/isEventType or
 * direct axis checks (requireInst + cardinality/temporality).
 *
 * This test scans all .ts source files to ensure no production code
 * imports deriveKind. Only canonical-types.ts (definition) and test
 * files are exempt.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

describe('deriveKind deprecation enforcement', () => {
  it('no production code imports deriveKind', () => {
    const srcDir = path.resolve(__dirname, '../../..');
    // Search for deriveKind imports in .ts files, excluding tests and the definition file
    const result = execSync(
      `grep -rn "import.*deriveKind" "${srcDir}/src" --include="*.ts" || true`,
      { encoding: 'utf-8' }
    );

    const lines = result.trim().split('\n').filter(Boolean);
    const violations = lines.filter(line => {
      // Allow: the definition in canonical-types.ts
      if (line.includes('canonical-types.ts')) return false;
      // Allow: test files
      if (line.includes('__tests__') || line.includes('.test.ts') || line.includes('.spec.ts')) return false;
      // Allow: re-exports that are themselves deprecated (types/index.ts no longer re-exports)
      return true;
    });

    expect(violations, `Production code should not import deriveKind:\n${violations.join('\n')}`).toHaveLength(0);
  });
});
