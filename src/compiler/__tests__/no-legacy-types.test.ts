/**
 * Enforcement test: No legacy expression types or IDs.
 *
 * This test ensures that the ValueExpr migration is complete and prevents
 * regression by checking that no production code references legacy types:
 * - SigExpr, FieldExpr, EventExpr (type unions)
 * - SigExprId, FieldExprId, EventExprId (ID aliases)
 * - deriveKind (deprecated helper function)
 *
 * Exempt files:
 * - Test files (*test.ts, *test.tsx)
 * - This enforcement test itself
 * - Comment-only references are allowed
 * - Variable/field names containing "Sig" (like maxSigExprs, sigValues) are allowed
 *   - We only check for type names (capitalized Sig/Field/EventExpr)
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

describe('legacy type enforcement', () => {
  it('no production code references SigExpr/FieldExpr/EventExpr types', () => {
    const srcDir = path.resolve(__dirname, '../..');

    // Search for legacy type references as TypeScript type usage (: SigExpr or <SigExpr> etc)
    const patterns = [
      ': SigExpr[^I]', // Type annotation: x: SigExpr
      '<SigExpr[^I]', // Generic parameter: Array<SigExpr>
      ': FieldExpr[^I]',
      '<FieldExpr[^I]',
      ': EventExpr[^I]',
      '<EventExpr[^I]',
    ];

    for (const pattern of patterns) {
      try {
        const result = execSync(
          `grep -r "${pattern}" ${srcDir} --include="*.ts" --include="*.tsx" --exclude="*test.ts*" --exclude="*test.tsx" --exclude="no-legacy-types.test.ts" || true`,
          { encoding: 'utf-8' }
        );

        // Filter out comment-only lines
        const realMatches = result
          .split('\n')
          .filter(line => line.trim())
          .filter(line => {
            const content = line.split(':')[1] || '';
            const trimmed = content.trim();
            return !(
              trimmed.startsWith('//') ||
              trimmed.startsWith('/*') ||
              trimmed.startsWith('*') ||
              trimmed === '*/'
            );
          });

        if (realMatches.length > 0) {
          throw new Error(
            `Found legacy type ${pattern} in production code:\n${realMatches.join('\n')}\n\n` +
            `Legacy types have been deleted. Use ValueExpr instead.`
          );
        }
      } catch (err: any) {
        if (err.message && err.message.includes('Found legacy type')) {
          throw err;
        }
        // grep returned non-zero (no matches) - this is what we want
      }
    }
  });

  it('no production code references SigExprId/FieldExprId/EventExprId aliases', () => {
    const srcDir = path.resolve(__dirname, '../..');

    const patterns = [
      ': SigExprId', // Type annotation
      '<SigExprId', // Generic parameter
      ': FieldExprId',
      '<FieldExprId',
      ': EventExprId',
      '<EventExprId',
    ];

    for (const pattern of patterns) {
      try {
        const result = execSync(
          `grep -r "${pattern}" ${srcDir} --include="*.ts" --include="*.tsx" --exclude="*test.ts*" --exclude="*test.tsx" --exclude="no-legacy-types.test.ts" || true`,
          { encoding: 'utf-8' }
        );

        // Filter out comment-only lines
        const realMatches = result
          .split('\n')
          .filter(line => line.trim())
          .filter(line => {
            const content = line.split(':')[1] || '';
            const trimmed = content.trim();
            return !(
              trimmed.startsWith('//') ||
              trimmed.startsWith('/*') ||
              trimmed.startsWith('*') ||
              trimmed === '*/'
            );
          });

        if (realMatches.length > 0) {
          throw new Error(
            `Found legacy ID alias ${pattern} in production code:\n${realMatches.join('\n')}\n\n` +
            `Legacy ID aliases have been deleted. Use ValueExprId instead.`
          );
        }
      } catch (err: any) {
        if (err.message && err.message.includes('Found legacy')) {
          throw err;
        }
        // grep returned non-zero (no matches) - this is what we want
      }
    }
  });

  it('no production code calls deriveKind function', () => {
    const srcDir = path.resolve(__dirname, '../..');

    try {
      const result = execSync(
        `grep -r "deriveKind(" ${srcDir} --include="*.ts" --include="*.tsx" --exclude="*test.ts*" --exclude="*test.tsx" --exclude="no-legacy-types.test.ts" || true`,
        { encoding: 'utf-8' }
      );

      // Filter out comment-only lines
      const realMatches = result
        .split('\n')
        .filter(line => line.trim())
        .filter(line => {
          const content = line.split(':')[1] || '';
          const trimmed = content.trim();
          return !(
            trimmed.startsWith('//') ||
            trimmed.startsWith('/*') ||
            trimmed.startsWith('*') ||
            trimmed === '*/'
          );
        });

      if (realMatches.length > 0) {
        throw new Error(
          `Found deriveKind() call in production code:\n${realMatches.join('\n')}\n\n` +
          `deriveKind has been deleted. Check extent directly using requireInst pattern:\n` +
          `  const temp = requireInst(type.extent.temporality, 'temporality');\n` +
          `  const isEvent = temp.kind === 'discrete';\n` +
          `  const card = requireInst(type.extent.cardinality, 'cardinality');\n` +
          `  const isField = card.kind === 'many';`
        );
      }
    } catch (err: any) {
      if (err.message && err.message.includes('Found deriveKind')) {
        throw err;
      }
      // grep returned non-zero (no matches) - this is what we want
    }
  });
});
