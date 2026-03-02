import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

function isNotFoundError(error: unknown): boolean {
  return (error as { code?: string }).code === 'ENOENT';
}

function resolveScopedFiles(scope: readonly string[]): string[] {
  const files: string[] = [];

  function walk(absolutePath: string): void {
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      for (const entry of readdirSync(absolutePath)) {
        walk(path.join(absolutePath, entry));
      }
      return;
    }
    if (stats.isFile()) {
      files.push(absolutePath);
    }
  }

  for (const scopedPath of scope) {
    walk(path.resolve(process.cwd(), scopedPath));
  }

  return files;
}

function matchesGlob(filePath: string, globs: readonly string[]): boolean {
  const normalizedPath = filePath.replaceAll('\\', '/');
  let hasInclude = false;
  let included = false;

  for (const glob of globs) {
    if (glob.startsWith('!')) {
      const exclude = glob.slice(1);
      if (exclude === '**/__tests__/**' && normalizedPath.includes('/__tests__/')) {
        return false;
      }
      if (exclude === '**/*.test.*' && normalizedPath.includes('.test.')) {
        return false;
      }
      continue;
    }

    hasInclude = true;
    if (glob === '*.ts' && normalizedPath.endsWith('.ts')) {
      included = true;
    }
    if (glob === '*.tsx' && normalizedPath.endsWith('.tsx')) {
      included = true;
    }
  }

  return hasInclude ? included : true;
}

function jsRegexLines(pattern: string, scope: readonly string[], globs: readonly string[]): string[] {
  const matcher = new RegExp(pattern);
  const lines: string[] = [];
  const files = resolveScopedFiles(scope).filter((filePath) => matchesGlob(filePath, globs));

  for (const absolutePath of files) {
    const relativePath = path.relative(process.cwd(), absolutePath).replaceAll('\\', '/');
    const content = readFileSync(absolutePath, 'utf-8');
    const split = content.split('\n');
    for (let i = 0; i < split.length; i += 1) {
      const line = split[i] ?? '';
      if (matcher.test(line)) {
        lines.push(`${relativePath}:${i + 1}:${line}`);
      }
    }
  }

  return lines;
}

export function rgLines(
  pattern: string,
  scope: readonly string[],
  globs: readonly string[] = ['*.ts', '*.tsx'],
): string[] {
  const args = [
    '-n',
    '--no-heading',
    '--color',
    'never',
    ...globs.flatMap((glob) => ['--glob', glob]),
    pattern,
    ...scope,
  ];

  try {
    const out = execFileSync('rg', args, { encoding: 'utf-8', cwd: process.cwd() }).trim();
    return out ? out.split('\n').filter(Boolean) : [];
  } catch (error) {
    if (isNotFoundError(error)) {
      // [LAW:verifiable-goals] Guardrail tests stay executable across CI images
      // even when shell tools differ by runner environment.
      return jsRegexLines(pattern, scope, globs);
    }
    const status = (error as { status?: number }).status;
    if (status === 1) return [];
    throw error;
  }
}
