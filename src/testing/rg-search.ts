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

/**
 * Translate one rg-style glob into an anchored RegExp. Handles every glob
 * uniformly — no per-pattern special cases — so an exclusion the translator
 * can't express is impossible rather than silently skipped.
 * [LAW:single-enforcer] [LAW:no-silent-failure]
 */
function globToRegExp(glob: string): RegExp {
  if (/[[\]{}]/.test(glob)) {
    throw new Error(
      `[rg-search] Unsupported glob construct in '${glob}': character classes and brace expansion ` +
      `are not translated by the JS fallback — matching them as literals would silently diverge from rg.`,
    );
  }
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const body = escaped
    .replaceAll('**/', '\u0000')
    .replaceAll('**', '\u0001')
    .replaceAll('*', '[^/]*')
    .replaceAll('?', '[^/]')
    .replaceAll('\u0000', '(?:.*/)?')
    .replaceAll('\u0001', '.*');
  return new RegExp(`^${body}$`);
}

/** rg semantics: a glob without '/' matches the basename; with '/' the relative path. */
function globMatches(glob: string, relativePath: string): boolean {
  const subject = glob.includes('/') ? relativePath : path.posix.basename(relativePath);
  return globToRegExp(glob).test(subject);
}

/** rg semantics: the LAST matching glob decides; an unmatched file is included only when no include glob exists. */
function matchesGlob(relativePath: string, globs: readonly string[]): boolean {
  let hasInclude = false;
  let verdict: boolean | null = null;

  for (const glob of globs) {
    const negated = glob.startsWith('!');
    if (!negated) hasInclude = true;
    if (globMatches(negated ? glob.slice(1) : glob, relativePath)) {
      verdict = !negated;
    }
  }

  return verdict ?? !hasInclude;
}

/** The pure-JS fallback for `rgLines`. Exported so parity with rg is testable. */
export function jsRegexLines(pattern: string, scope: readonly string[], globs: readonly string[]): string[] {
  const matcher = new RegExp(pattern);
  const lines: string[] = [];
  const files = resolveScopedFiles(scope).filter((absolutePath) =>
    matchesGlob(path.relative(process.cwd(), absolutePath).replaceAll('\\', '/'), globs),
  );

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
