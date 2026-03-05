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
