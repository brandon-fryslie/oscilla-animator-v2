import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const defaultRunnerRoot = path.resolve(currentDir, '..', '..');

export const runnerRoot = path.resolve(process.env.COMPLEXITY_RUNNER_ROOT ?? defaultRunnerRoot);
export const repoRoot = path.resolve(process.env.COMPLEXITY_TARGET_ROOT ?? process.cwd());
export const runnerBinDir = path.join(runnerRoot, 'node_modules', '.bin');
export const reportsDir = path.join(repoRoot, 'reports', 'complexity');
export const tmpDir = path.join(repoRoot, '.complexity-tmp');

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function writeText(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, value, 'utf8');
}

export async function listTypeScriptFiles() {
  const { stdout } = await execFileAsync('rg', [
    '--files',
    'src',
    '--glob',
    '**/*.ts',
    '--glob',
    '!**/*.d.ts',
  ]);
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

export async function runCommand(command, args, options = {}) {
  const { cwd = repoRoot, allowFailure = false, env: envOverrides = {} } = options;
  const mergedPath = [runnerBinDir, process.env.PATH ?? ''].join(':');
  try {
    const result = await execFileAsync(command, args, {
      cwd,
      maxBuffer: 1024 * 1024 * 32,
      env: {
        ...process.env,
        ...envOverrides,
        PATH: mergedPath,
      },
    });
    return {
      ok: true,
      code: 0,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  } catch (error) {
    if (!allowFailure) throw error;
    return {
      ok: false,
      code: error.code ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? String(error),
    };
  }
}

export function percentile(sortedValues, pct) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.floor((pct / 100) * sortedValues.length)),
  );
  return sortedValues[index] ?? 0;
}

export function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const sig2Formatter = new Intl.NumberFormat('en-US', {
  maximumSignificantDigits: 2,
  useGrouping: false,
});

export function formatSig2(value) {
  if (!Number.isFinite(value)) return 'n/a';
  return sig2Formatter.format(Number(value));
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderHtmlTable(headers, rows) {
  const headerHtml = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
  const bodyHtml = rows.length === 0
    ? `<tr><td colspan="${headers.length}">none</td></tr>`
    : rows
      .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
      .join('\n');
  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

export function renderHtmlDocument(title, bodyHtml) {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width,initial-scale=1">',
    `  <title>${escapeHtml(title)}</title>`,
    '  <style>',
    '    :root { color-scheme: dark; }',
    '    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; background: #0e0f13; color: #e6e8ef; }',
    '    main { max-width: 1300px; margin: 0 auto; padding: 24px; }',
    '    h1, h2, h3 { margin: 0 0 12px; }',
    '    h2 { margin-top: 28px; }',
    '    p, li { color: #b9c0d0; }',
    '    .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px; margin: 16px 0 20px; }',
    '    .meta div { background: #171922; border: 1px solid #2a3040; border-radius: 8px; padding: 10px 12px; }',
    '    code { background: #1a1d27; border: 1px solid #2a3040; border-radius: 4px; padding: 1px 6px; }',
    '    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }',
    '    th, td { border: 1px solid #2a3040; padding: 8px 10px; text-align: left; vertical-align: top; }',
    '    th { background: #171922; }',
    '    tr:nth-child(even) td { background: #11131a; }',
    '    details { border: 1px solid #2a3040; border-radius: 8px; background: #131722; margin: 8px 0; padding: 10px 12px; }',
    '    summary { cursor: pointer; font-weight: 600; }',
    '    pre { background: #0d111b; border: 1px solid #2a3040; border-radius: 8px; overflow: auto; padding: 10px; white-space: pre-wrap; word-break: break-word; }',
    '    .small { font-size: 12px; color: #9098ab; }',
    '  </style>',
    '</head>',
    '<body>',
    `<main>${bodyHtml}</main>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
