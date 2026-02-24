#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const ROOT_DIR = process.cwd();
const MATRIX_REPORT_PATH = path.resolve(
  ROOT_DIR,
  process.env.WEBGPU_MATRIX_REPORT ?? 'artifacts/webgpu-browser-matrix.json',
);
const W15_PROOF_PATH = path.resolve(
  ROOT_DIR,
  'migration-proof/w15-browser-matrix-perf.json',
);
const W10_PROOF_PATH = path.resolve(
  ROOT_DIR,
  'migration-proof/w10-webgpu-contract.json',
);
const execFileAsync = promisify(execFile);

function isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function readJson(filePath) {
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text);
}

async function resolveHeadCommitOrNull() {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--short=9', 'HEAD'], {
      cwd: ROOT_DIR,
    });
    const value = stdout.trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function toW15Results(matrixReport) {
  const chromium = Array.isArray(matrixReport.results)
    ? matrixReport.results.find((result) => result.browser === 'chromium')
    : null;
  if (!chromium) {
    throw new Error('Chromium result is required in matrix report.');
  }

  return {
    chromium: {
      browser_version: chromium.browserVersion ?? null,
      blocking: Boolean(chromium.blocking),
      passed: Boolean(chromium.passed),
      failure_reason: chromium.failureReason ?? null,
      readiness: {
        hasNavigatorGpu: Boolean(chromium.readiness?.hasNavigatorGpu),
        hasAdapter: Boolean(chromium.readiness?.hasAdapter),
        hasCanvas: Boolean(chromium.readiness?.hasCanvas),
        hasWebGPUContext: Boolean(chromium.readiness?.hasWebGPUContext),
        consoleErrorCount: Number(chromium.readiness?.consoleErrorCount ?? 0),
        pageErrorCount: Number(chromium.readiness?.pageErrorCount ?? 0),
      },
      timing: {
        sampleCount: Number(chromium.timing?.sampleCount ?? 0),
        avgFrameDeltaMs: Number(chromium.timing?.avgFrameDeltaMs ?? 0),
        p95FrameDeltaMs: Number(chromium.timing?.p95FrameDeltaMs ?? 0),
        avgFps: Number(chromium.timing?.avgFps ?? 0),
      },
    },
  };
}

async function main() {
  const matrixReport = await readJson(MATRIX_REPORT_PATH);
  const w10 = await readJson(W10_PROOF_PATH);
  const w15 = await readJson(W15_PROOF_PATH);
  const headCommit = await resolveHeadCommitOrNull();
  const timestampUtc = isoNow();
  const matrixExitCode = matrixReport.passed ? 0 : 1;
  const matrixNotes = matrixReport.passed
    ? 'Chromium-only matrix gate passed.'
    : 'Chromium-only matrix gate failed.';

  const w10Verification = Array.isArray(w10.verification) ? [...w10.verification] : [];
  const matrixVerificationIndex = w10Verification.findIndex((entry) =>
    String(entry.command ?? '').includes('test:webgpu-matrix'),
  );
  const matrixVerificationEntry = {
    command: 'pnpm run test:webgpu-matrix',
    exit_code: matrixExitCode,
    notes: matrixNotes,
  };
  if (matrixVerificationIndex >= 0) {
    w10Verification[matrixVerificationIndex] = matrixVerificationEntry;
  } else {
    w10Verification.push(matrixVerificationEntry);
  }

  const next = {
    ...w15,
    status: 'completed',
    timestamp_utc: timestampUtc,
    commit: headCommit ?? w15.commit ?? null,
    scope: [
      'Run repeatable Chromium WebGPU gating check on canonical preview runtime',
      'Capture machine-readable readiness and frame-time baseline',
    ],
    artifact: {
      matrix_report: path.relative(ROOT_DIR, MATRIX_REPORT_PATH),
      report_generated_at: matrixReport.generatedAt ?? null,
      sample_frames: Number(matrixReport.sampleFrames ?? 0),
      url: matrixReport.url ?? null,
      gating_browsers: Array.isArray(matrixReport.gatingBrowsers)
        ? matrixReport.gatingBrowsers
        : [],
      non_blocking_browsers: Array.isArray(matrixReport.nonBlockingBrowsers)
        ? matrixReport.nonBlockingBrowsers
        : [],
      overall_passed: Boolean(matrixReport.passed),
    },
    results: toW15Results(matrixReport),
    extra_verification: [],
  };

  const nextW10 = {
    ...w10,
    status: 'completed',
    timestamp_utc: timestampUtc,
    commit: headCommit ?? w10.commit ?? null,
    verification: w10Verification,
  };

  await writeFile(W10_PROOF_PATH, `${JSON.stringify(nextW10, null, 2)}\n`);
  await writeFile(W15_PROOF_PATH, `${JSON.stringify(next, null, 2)}\n`);
  process.stdout.write(`[sync] updated ${W10_PROOF_PATH}\n`);
  process.stdout.write(`[sync] updated ${W15_PROOF_PATH}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[sync] failed: ${message}\n`);
  process.exit(1);
});
