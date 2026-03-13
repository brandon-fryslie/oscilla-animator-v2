/**
 * Architectural guardrails — grep-based safety nets that detect accidental
 * reintroduction of deleted patterns or policy violations.
 *
 * [LAW:behavior-not-structure] These tests assert architectural invariants,
 * not implementation details. They fail when forbidden patterns reappear.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// =============================================================================
// File Scanning Utilities
// =============================================================================

const SRC_ROOT = path.resolve(__dirname, '..');
const SCRIPTS_ROOT = path.resolve(SRC_ROOT, '..', 'scripts');
const THIS_FILE = path.resolve(__dirname, 'forbidden-patterns.test.ts');

/**
 * Recursively collect files matching an extension filter.
 * Excludes node_modules, .agent_planning, docs, and dist.
 */
function collectFiles(
  dir: string,
  extensions: readonly string[],
  excludeDirs: readonly string[] = ['node_modules', '.agent_planning', 'docs', 'dist', '.git'],
): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!excludeDirs.includes(entry.name)) {
        results.push(...collectFiles(fullPath, extensions, excludeDirs));
      }
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Scan files for a regex pattern. Returns matches with file path and line info.
 */
function scanForPattern(
  files: readonly string[],
  pattern: RegExp,
): { file: string; line: number; text: string }[] {
  const matches: { file: string; line: number; text: string }[] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        matches.push({ file: path.relative(SRC_ROOT, file), line: i + 1, text: lines[i].trim() });
      }
    }
  }
  return matches;
}

// =============================================================================
// Tests
// =============================================================================

describe('Forbidden Patterns', () => {
  it('no WGSL string generation in naga-emitter (excluding tests)', () => {
    const emitterDir = path.join(SRC_ROOT, 'compiler', 'ir', 'naga-emitter');
    const files = collectFiles(emitterDir, ['.ts'])
      .filter((f) => !f.includes('__tests__') && !f.includes('.test.'));

    // Detect template literals with interpolation that look like WGSL generation
    // e.g. `@group(${n})` or `var<storage` or `fn ` with ${}
    const wgslConcatPattern = /`[^`]*\$\{[^}]*\}[^`]*(group|binding|var<|fn |@compute|@vertex|@fragment|workgroup_size|array<|struct )/;
    const matches = scanForPattern(files, wgslConcatPattern);

    expect(matches, formatViolations('WGSL string generation in naga-emitter', matches)).toHaveLength(0);
  });

  it('no Family B IR type names in src/', () => {
    const familyBNames = [
      'NagaExpressionIR',
      'NagaStatementIR',
      'NagaTypeIR',
      'NagaModuleIR',
      'NagaConstantIR',
      'NagaGlobalVariableIR',
      'NagaEntryPointIR',
      'NagaScalarKindIR',
      'NagaFunctionArgumentIR',
      'NagaFunctionIR',
      'NagaSourceMapEntryIR',
      'NagaComputeMetadataIR',
    ];

    const files = collectFiles(SRC_ROOT, ['.ts', '.tsx'])
      .filter((f) => f !== THIS_FILE);
    const pattern = new RegExp(`\\b(${familyBNames.join('|')})\\b`);
    const matches = scanForPattern(files, pattern);

    expect(matches, formatViolations('Family B IR type names', matches)).toHaveLength(0);
  });

  it('no git stash in scripts/', () => {
    if (!fs.existsSync(SCRIPTS_ROOT)) return;

    const files = collectFiles(SCRIPTS_ROOT, ['.sh', '.bash', '.zsh', '.ts', '.js', '.mjs']);
    const pattern = /git\s+stash/;
    const matches = scanForPattern(files, pattern);

    expect(matches, formatViolations('git stash in scripts', matches)).toHaveLength(0);
  });

  it('no ScheduleNagaLowering references in src/ (non-comment)', () => {
    const files = collectFiles(SRC_ROOT, ['.ts', '.tsx'])
      .filter((f) => f !== THIS_FILE);
    const pattern = /\bScheduleNagaLowering\b/;
    const matches = scanForPattern(files, pattern)
      .filter((m) => !isCommentLine(m.text));

    expect(matches, formatViolations('ScheduleNagaLowering references', matches)).toHaveLength(0);
  });
});

// =============================================================================
// Formatting
// =============================================================================

function isCommentLine(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

function formatViolations(
  rule: string,
  matches: readonly { file: string; line: number; text: string }[],
): string {
  if (matches.length === 0) return '';
  const details = matches
    .map((m) => `  ${m.file}:${String(m.line)} → ${m.text}`)
    .join('\n');
  return `Forbidden pattern detected: ${rule}\n${details}`;
}
