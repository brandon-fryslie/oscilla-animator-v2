/**
 * Tripwire Test: No Legacy Evaluator Imports
 *
 * Enforcement test to ensure legacy evaluator code never runs in production.
 * This test fails if production code (non-test files) imports legacy evaluator modules.
 *
 * Sprint: kill-legacy-surfaces
 * Work Item: WI-3 (Tripwire enforcement)
 *
 * Context: After migrating to ValueExpr evaluators, the legacy SignalEvaluator,
 * EventEvaluator, and Materializer should only be imported by tests or by each other
 * (until deletion). This test catches accidental re-introduction via imports.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

describe('Legacy Evaluator Tripwire', () => {
  it('prevents production code from importing legacy evaluators', () => {
    const runtimeDir = join(__dirname, '..');
    const productionFiles: string[] = [];

    // Collect all .ts files in src/runtime/, excluding __tests__ and .test.
    function collectFiles(dir: string): void {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          // Skip __tests__ directories
          if (entry === '__tests__') continue;
          collectFiles(fullPath);
        } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) {
          productionFiles.push(fullPath);
        }
      }
    }

    collectFiles(runtimeDir);

    // Check each production file for legacy imports
    const violations: Array<{ file: string; line: number; match: string }> = [];

    // Files that are allowed to import legacy evaluators (legacy modules themselves)
    const legacyFiles = ['SignalEvaluator.ts', 'EventEvaluator.ts', 'Materializer.ts'];

    for (const filePath of productionFiles) {
      const fileName = filePath.split('/').pop() || '';

      // Allow legacy files to import each other (they'll be deleted together)
      if (legacyFiles.includes(fileName)) {
        continue;
      }

      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Match imports or exports from SignalEvaluator, EventEvaluator, or Materializer
        // But allow imports from ValueExpr variants
        if (
          ((/from\s+['"]\.\/SignalEvaluator['"]/.test(line) ||
            /from\s+['"]\.\/EventEvaluator['"]/.test(line) ||
            /from\s+['"]\.\/Materializer['"]/.test(line) ||
            /export.*from\s+['"]\.\/SignalEvaluator['"]/.test(line) ||
            /export.*from\s+['"]\.\/EventEvaluator['"]/.test(line) ||
            /export.*from\s+['"]\.\/Materializer['"]/.test(line) ||
            /export\s+\{[^}]*\}\s+from\s+['"]\.\/SignalEvaluator['"]/.test(line) ||
            /export\s+\{[^}]*\}\s+from\s+['"]\.\/EventEvaluator['"]/.test(line) ||
            /export\s+\{[^}]*\}\s+from\s+['"]\.\/Materializer['"]/.test(line)) &&
            !line.includes('ValueExpr')) || // Allow ValueExprSignalEvaluator, etc.
          // Also catch direct exports of legacy symbols
          (/export\s+\{[^}]*(materialize|evaluateSignal|evaluateEvent)[^}]*\}/.test(line) &&
            !line.includes('ValueExpr'))
        ) {
          violations.push({
            file: filePath.replace(runtimeDir, 'src/runtime'),
            line: i + 1,
            match: line.trim(),
          });
        }
      }
    }

    // Report all violations
    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line}\n    ${v.match}`)
        .join('\n');

      throw new Error(
        `Legacy evaluator imports found in production code:\n\n${report}\n\n` +
        `These modules should only be imported by tests or by other legacy modules ` +
        `(EventEvaluator, Materializer, SignalEvaluator themselves).\n` +
        `Use ValueExprSignalEvaluator, ValueExprEventEvaluator, or ValueExprMaterializer instead.`
      );
    }

    // Test passes if no violations
    expect(violations).toEqual([]);
  });

  it('documents the tripwire purpose', () => {
    // This test exists to document the tripwire's architectural role.
    // The legacy evaluators (SignalEvaluator, EventEvaluator, Materializer) are deprecated
    // and should be deleted in Sprint 1 WI-4. This test ensures no accidental re-introduction
    // via imports from other modules.
    //
    // If this test fails:
    // 1. Check if you're importing from SignalEvaluator/EventEvaluator/Materializer
    // 2. Use ValueExprSignalEvaluator/ValueExprEventEvaluator/ValueExprMaterializer instead
    // 3. If you need legacy code for migration, mark it with a TODO and expiry date

    expect(true).toBe(true);
  });
});
