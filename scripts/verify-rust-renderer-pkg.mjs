#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = path.resolve(repoRoot, 'src/render/wasm/pkg');

const requiredFiles = [
  'oscilla_rust_renderer.js',
  'oscilla_rust_renderer.d.ts',
  'oscilla_rust_renderer_bg.wasm',
  'oscilla_rust_renderer_bg.wasm.d.ts',
];

function fail(message) {
  console.error(`[verify-rust-renderer-pkg] ${message}`);
  process.exit(1);
}

for (const file of requiredFiles) {
  const fullPath = path.join(pkgDir, file);
  if (!fs.existsSync(fullPath)) {
    fail(`Missing required artifact: ${path.relative(repoRoot, fullPath)}`);
  }
}

const entryJsPath = path.join(pkgDir, 'oscilla_rust_renderer.js');
const entryJs = fs.readFileSync(entryJsPath, 'utf8');

if (!entryJs.includes('oscilla_rust_renderer_bg.wasm')) {
  fail('Entry shim does not import compiled wasm payload.');
}

if (!entryJs.includes('init_engine') || !entryJs.includes('rebuild_gpu_pipelines')) {
  fail('Entry shim does not export required renderer symbols.');
}

const wasmPath = path.join(pkgDir, 'oscilla_rust_renderer_bg.wasm');
const wasmSize = fs.statSync(wasmPath).size;
if (wasmSize < 64 * 1024) {
  fail(`Compiled wasm payload is unexpectedly small (${wasmSize} bytes).`);
}

try {
  execFileSync('git', ['diff', '--exit-code', '--', 'src/render/wasm/pkg'], {
    cwd: repoRoot,
    stdio: 'pipe',
  });
} catch {
  // [LAW:no-silent-fallbacks] Generated renderer artifacts must match the
  // checked-in runtime package exactly after a rebuild.
  fail('Generated renderer pkg drifted from checked-in artifacts. Run `pnpm -s build:rust-renderer` and commit the pkg changes.');
}

console.log(`[verify-rust-renderer-pkg] OK (${wasmSize} bytes)`);
