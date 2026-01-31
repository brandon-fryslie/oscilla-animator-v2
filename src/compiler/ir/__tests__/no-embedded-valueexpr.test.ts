/**
 * Mechanical Enforcement: No Embedded ValueExpr References
 *
 * This test ensures that ValueExpr types use only ValueExprId references (flat),
 * never embedded ValueExpr objects (tree nesting).
 *
 * Spec Reference: TYPE-SYSTEM-INVARIANTS.md rule 1 (Single Authority)
 * Sprint: WI-8 (type-fixes sprint)
 *
 * This is a CI gate. If this test fails, embedded ValueExpr references have
 * been reintroduced into the ValueExpr type definitions, breaking the flat-array
 * + ID-reference architecture.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

/** Run grep and return matching file:line results */
function grepFile(pattern: string, filepath: string): string[] {
  try {
    const cmd = `grep -n '${pattern}' ${filepath} 2>/dev/null || true`;
    const result = execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() }).trim();
    return result ? result.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

describe('ValueExpr Flattening Enforcement', () => {
  const VALUE_EXPR_FILE = 'src/compiler/ir/value-expr.ts';

  it('no embedded ValueExpr[] arrays in value-expr.ts', () => {
    // Pattern: ": ValueExpr[]" or ": readonly ValueExpr[]"
    // Should NOT match ": ValueExprId[]" (which is correct)
    const matches = grepFile(': .*ValueExpr\\[\\]', VALUE_EXPR_FILE);

    // Filter to find only embedded ValueExpr[] (not ValueExprId[])
    const embedded = matches.filter(line => {
      // Extract the part after the colon
      const content = line.substring(line.indexOf(':') + 1);
      // Check if it contains "ValueExpr[" without "Id" before the "["
      return /:\s*(readonly\s+)?ValueExpr\[/.test(content);
    });

    if (embedded.length > 0) {
      console.error('Found embedded ValueExpr[] references (should be ValueExprId[]):');
      embedded.forEach(line => console.error('  ' + line));
    }

    expect(embedded, 'Found embedded ValueExpr[] arrays. Use ValueExprId[] instead.').toEqual([]);
  });

  it('no embedded ValueExpr object fields in value-expr.ts', () => {
    // Pattern: ": ValueExpr;" (singular, not array)
    // Should NOT match ": ValueExprId" or ": ValueExprKernel" etc.
    const matches = grepFile(': .*ValueExpr;', VALUE_EXPR_FILE);

    // Filter to find only embedded ValueExpr (not ValueExprId or ValueExprXxx)
    const embedded = matches.filter(line => {
      // Extract the part after the colon
      const content = line.substring(line.indexOf(':') + 1);
      // Check if it's exactly "ValueExpr;" not "ValueExprId" or other subtypes
      return /:\s*(readonly\s+)?ValueExpr;/.test(content);
    });

    if (embedded.length > 0) {
      console.error('Found embedded ValueExpr object fields (should be ValueExprId):');
      embedded.forEach(line => console.error('  ' + line));
    }

    expect(embedded, 'Found embedded ValueExpr object fields. Use ValueExprId instead.').toEqual([]);
  });

  it('ValueExpr export is a union type, not an interface', () => {
    // Ensure ValueExpr is defined as "export type ValueExpr = ..." not "export interface ValueExpr"
    const matches = grepFile('export type ValueExpr =', VALUE_EXPR_FILE);
    expect(matches.length, 'ValueExpr should be exported as a union type').toBeGreaterThan(0);

    const interfaceMatches = grepFile('export interface ValueExpr ', VALUE_EXPR_FILE);
    expect(interfaceMatches, 'ValueExpr should not be an interface (it is a union)').toEqual([]);
  });

  it('all ValueExpr variant references use ValueExprId', () => {
    // This is a positive check: we should find ValueExprId used in the file
    const idMatches = grepFile('ValueExprId', VALUE_EXPR_FILE);
    expect(idMatches.length, 'ValueExprId should be used throughout value-expr.ts').toBeGreaterThan(5);
  });
});
