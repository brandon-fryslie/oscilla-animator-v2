#!/usr/bin/env node
import { spawn } from 'node:child_process';
import process from 'node:process';

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

async function main() {
  // [LAW:single-enforcer] CI readiness ownership is centralized in this script:
  // browser prerequisites + matrix gate + proof aggregation run in one pipeline.
  await runNodeScript('scripts/webgpu-browser-matrix.mjs', {
    WEBGPU_MATRIX_FAIL_ON_SKIP: '1',
    WEBGPU_MATRIX_BUILD_FIRST: process.env.WEBGPU_MATRIX_BUILD_FIRST ?? '1',
    WEBGPU_MATRIX_START_SERVER: process.env.WEBGPU_MATRIX_START_SERVER ?? '1',
    WEBGPU_MATRIX_SERVER_MODE: process.env.WEBGPU_MATRIX_SERVER_MODE ?? 'preview',
    WEBGPU_MATRIX_ALLOW_SERVER_REUSE: process.env.WEBGPU_MATRIX_ALLOW_SERVER_REUSE ?? '0',
  });

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
