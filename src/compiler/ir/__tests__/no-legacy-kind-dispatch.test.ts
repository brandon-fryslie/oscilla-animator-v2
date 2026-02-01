/**
 * Enforcement Test: No Legacy Kind Dispatch
 *
 * Prevents new runtime code from switching on legacy expression kinds
 * (SigExpr.kind, FieldExpr.kind, EventExpr.kind) outside the legacy evaluators.
 *
 * This ensures new code uses ValueExpr dispatch instead of legacy dispatch.
 *
 * Allowed files (legacy evaluators, to be migrated later):
 * NONE (
 *
 * Spec Reference: SPRINT-20260131-100000-dual-emit-PLAN.md WI-3
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';

describe('no-legacy-kind-dispatch', () => {
  it('should not dispatch on legacy expression kinds outside allowed files', () => {
    // Allowed files (legacy evaluators + type definitions + lowering pass)
    const allowedFiles = [
      'SignalEvaluator.ts',
      // 'Materializer.ts',
      // 'EventEvaluator.ts',
      // 'types.ts',
      // 'value-expr.ts',
      // 'IRBuilder.ts',
      // 'IRBuilderImpl.ts',
    ];

    // Patterns that indicate legacy kind dispatch
    const forbiddenPatterns = [
      // SigExpr kind checks
      "kind === 'const'",
      "kind === 'slot'",
      "kind === 'time'",
      "kind === 'external'",
      "kind === 'map'",
      "kind === 'zip'",
      "kind === 'stateRead'",
      "kind === 'shapeRef'",
      "kind === 'reduceField'",
      "kind === 'eventRead'",
      // FieldExpr kind checks
      "kind === 'intrinsic'",
      "kind === 'placement'",
      "kind === 'broadcast'",
      "kind === 'zipSig'",
      "kind === 'pathDerivative'",
      // EventExpr kind checks
      "kind === 'pulse'",
      "kind === 'wrap'",
      "kind === 'combine'",
      "kind === 'never'",
    ];

    const srcDir = path.resolve(__dirname, '../../..');
    const violations: Array<{ file: string; pattern: string; line: string }> = [];

    // Search for each forbidden pattern
    for (const pattern of forbiddenPatterns) {
      try {
        // Use grep to find files containing the pattern
        // -r: recursive, -n: line numbers, -I: ignore binary
        const result = execSync(
          `grep -rn -I --include="*.ts" --exclude-dir=node_modules --exclude-dir=__tests__ "${pattern}" "${srcDir}/src" || true`,
          { encoding: 'utf-8' }
        );

        if (result.trim()) {
          const lines = result.trim().split('\n');
          for (const line of lines) {
            const [filePath, ...rest] = line.split(':');
            const fileName = path.basename(filePath);

            // Skip if it's an allowed file
            if (allowedFiles.some((allowed) => fileName.includes(allowed))) {
              continue;
            }

            // Skip if it's in a test file (tests are allowed to use legacy types)
            if (filePath.includes('__tests__')) {
              continue;
            }

            // Record violation
            violations.push({
              file: path.relative(srcDir, filePath),
              pattern,
              line: rest.join(':'),
            });
          }
        }
      } catch (error) {
        // grep returns non-zero if no matches found, which is actually what we want
        // Only throw if there's a real error
        if ((error as any).status !== 1) {
          throw error;
        }
      }
    }

    // Report violations
    if (violations.length > 0) {
      const message = [
        'Found legacy kind dispatch outside allowed files:',
        '',
        ...violations.map((v) => `  ${v.file}: ${v.pattern}\n    ${v.line.trim()}`),
        '',
        'Allowed files (legacy evaluators):',
        ...allowedFiles.map((f) => `  - ${f}`),
        '',
        'New code should use ValueExpr dispatch, not SigExpr/FieldExpr/EventExpr dispatch.',
        'See SPRINT-20260131-100000-dual-emit-PLAN.md for details.',
      ].join('\n');

      expect(violations.length).toBe(0);
      // Fail with custom message
      throw new Error(message);
    }
  });
});
