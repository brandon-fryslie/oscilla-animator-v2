#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { truncateForLog } from './matrix-utils.mjs';

const MATRIX_REPORT_PATH = path.resolve(
  process.env.WEBGPU_MATRIX_REPORT ?? 'artifacts/webgpu-browser-matrix.json',
);

function runNodeScript(scriptPath, envOverrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      stdio: 'inherit',
      env: {
        ...process.env,
        ...envOverrides,
      },
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${scriptPath} failed (code=${code}, signal=${signal ?? 'none'})`));
    });
  });
}

async function emitMatrixFailureSummary() {
  try {
    const text = await readFile(MATRIX_REPORT_PATH, 'utf8');
    const report = JSON.parse(text);
    const results = Array.isArray(report?.results) ? report.results : [];
    const failedOrSkipped = results.filter(
      (result) => result?.status !== 'passed',
    );

    process.stderr.write(
      `[ci-webgpu-readiness] matrix report: ${MATRIX_REPORT_PATH}\n`,
    );
    process.stderr.write(
      `[ci-webgpu-readiness] matrix summary: passed=${Boolean(report?.passed)} ` +
        `hardPassed=${Boolean(report?.hardPassed)} ` +
        `skipped=${Number(report?.skippedCount ?? 0)} ` +
        `sampleFrames=${Number(report?.sampleFrames ?? 0)}\n`,
    );

    for (const result of failedOrSkipped) {
      const reason = result?.failureReason ?? 'unknown';
      const bootstrapState = result?.readiness?.runtimeProbe?.bootstrapState ?? null;
      const bootstrapFailureMessage =
        result?.readiness?.runtimeProbe?.bootstrapFailureMessage ?? null;
      const setupError = result?.errors?.setup?.[0] ?? null;
      const consoleError = result?.errors?.console?.[0] ?? null;
      const pageError = result?.errors?.page?.[0] ?? null;
      process.stderr.write(
        `[ci-webgpu-readiness] ${result?.browser ?? 'unknown'} ` +
          `status=${result?.status ?? 'unknown'} ` +
          `reason=${reason} ` +
          `bootstrapState=${bootstrapState ?? 'null'} ` +
          `bootstrapFailure=${bootstrapFailureMessage ? truncateForLog(bootstrapFailureMessage) : 'null'}\n`,
      );
      if (setupError) {
        process.stderr.write(
          `[ci-webgpu-readiness] ${result?.browser ?? 'unknown'} setup[0]: ${truncateForLog(setupError)}\n`,
        );
      }
      if (consoleError) {
        process.stderr.write(
          `[ci-webgpu-readiness] ${result?.browser ?? 'unknown'} console[0]: ${truncateForLog(consoleError)}\n`,
        );
      }
      if (pageError) {
        process.stderr.write(
          `[ci-webgpu-readiness] ${result?.browser ?? 'unknown'} page[0]: ${truncateForLog(pageError)}\n`,
        );
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `[ci-webgpu-readiness] failed to read matrix report at ${MATRIX_REPORT_PATH}: ${message}\n`,
    );
  }
}

async function main() {
  // [LAW:single-enforcer] CI readiness ownership is centralized in this script:
  // browser prerequisites + matrix gate + proof aggregation run in one pipeline.
  try {
    await runNodeScript('scripts/webgpu-browser-matrix.mjs', {
      WEBGPU_MATRIX_FAIL_ON_SKIP: '1',
      WEBGPU_MATRIX_BUILD_FIRST: process.env.WEBGPU_MATRIX_BUILD_FIRST ?? '1',
      WEBGPU_MATRIX_START_SERVER: process.env.WEBGPU_MATRIX_START_SERVER ?? '1',
      WEBGPU_MATRIX_SERVER_MODE: process.env.WEBGPU_MATRIX_SERVER_MODE ?? 'preview',
      WEBGPU_MATRIX_ALLOW_SERVER_REUSE: process.env.WEBGPU_MATRIX_ALLOW_SERVER_REUSE ?? '0',
    });
  } catch (error) {
    // [LAW:verifiable-goals] Matrix failures must emit machine-captured report
    // details so CI failures are diagnosable from logs alone.
    await emitMatrixFailureSummary();
    throw error;
  }

  await runNodeScript('scripts/webgpu-migration-readiness.mjs', {
    WEBGPU_READINESS_REPORT:
      process.env.WEBGPU_READINESS_REPORT ?? 'artifacts/webgpu-readiness.json',
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[ci-webgpu-readiness] failed: ${message}\n`);
  process.exit(1);
});
