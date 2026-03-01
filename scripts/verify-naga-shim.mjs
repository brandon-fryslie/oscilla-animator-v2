#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = path.resolve(repoRoot, 'src/compiler/wasm/pkg');

const requiredFiles = [
  'oscilla_naga_shim.js',
  'oscilla_naga_shim_bg.js',
  'oscilla_naga_shim_bg.wasm',
  'oscilla_naga_shim_bg.wasm.d.ts',
];

function fail(message) {
  console.error(`[verify-naga-shim] ${message}`);
  process.exit(1);
}

for (const file of requiredFiles) {
  const fullPath = path.join(pkgDir, file);
  if (!fs.existsSync(fullPath)) {
    fail(`Missing required artifact: ${path.relative(repoRoot, fullPath)}`);
  }
}

const entryJsPath = path.join(pkgDir, 'oscilla_naga_shim.js');
const entryJs = fs.readFileSync(entryJsPath, 'utf8');

// [LAW:no-silent-fallbacks] Missing/placeholder shims must fail CI explicitly.
if (entryJs.includes('placeholder') || entryJs.includes('artifact is missing')) {
  fail('Found placeholder shim content. Run `pnpm -s build:naga-shim` and commit generated artifacts.');
}

if (!entryJs.includes('oscilla_naga_shim_bg.wasm')) {
  fail('Entry shim does not import compiled wasm payload.');
}

if (!entryJs.includes('compile_ir') || !entryJs.includes('init')) {
  fail('Entry shim does not export required compile_ir/init symbols.');
}

const wasmPath = path.join(pkgDir, 'oscilla_naga_shim_bg.wasm');
const wasmSize = fs.statSync(wasmPath).size;
if (wasmSize < 32 * 1024) {
  fail(`Compiled wasm payload is unexpectedly small (${wasmSize} bytes).`);
}

console.log(`[verify-naga-shim] OK (${wasmSize} bytes)`);
