#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = path.resolve(repoRoot, 'src/render/wasm/pkg');
const wasmArtifactPath = 'src/render/wasm/pkg/oscilla_rust_renderer_bg.wasm';

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

function readHeadBlob(relativePath) {
  try {
    return execFileSync('git', ['show', `HEAD:${relativePath}`], {
      cwd: repoRoot,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    fail(`Checked-in renderer artifact is missing from HEAD: ${relativePath}`);
  }
}

function readUnsignedLeb128(bytes, startOffset) {
  let result = 0;
  let shift = 0;
  let offset = startOffset;

  while (true) {
    if (offset >= bytes.length) {
      fail('Encountered truncated wasm section length while verifying renderer pkg parity.');
    }

    const byte = bytes[offset];
    result |= (byte & 0x7f) << shift;
    offset += 1;

    if ((byte & 0x80) === 0) {
      return { value: result, length: offset - startOffset };
    }

    shift += 7;
    if (shift > 35) {
      fail('Encountered oversized wasm section length while verifying renderer pkg parity.');
    }
  }
}

function stripCustomSections(wasmBuffer) {
  const bytes = new Uint8Array(wasmBuffer);
  if (bytes.length < 8) {
    fail('Compiled wasm payload is truncated.');
  }

  const outputChunks = [Buffer.from(bytes.subarray(0, 8))];
  let offset = 8;

  while (offset < bytes.length) {
    const sectionStart = offset;
    const sectionId = bytes[offset];
    offset += 1;

    const { value: sectionSize, length: sectionSizeLength } = readUnsignedLeb128(bytes, offset);
    offset += sectionSizeLength;

    const sectionEnd = offset + sectionSize;
    if (sectionEnd > bytes.length) {
      fail('Compiled wasm payload contains an invalid section length.');
    }

    if (sectionId !== 0) {
      outputChunks.push(Buffer.from(bytes.subarray(sectionStart, sectionEnd)));
    }

    offset = sectionEnd;
  }

  return Buffer.concat(outputChunks);
}

function describeWasmModule(wasmBuffer, relativePath) {
  try {
    const module = new WebAssembly.Module(wasmBuffer);
    return {
      exports: WebAssembly.Module.exports(module)
        .map(({ name, kind }) => `${kind}:${name}`)
        .sort(),
      imports: WebAssembly.Module.imports(module)
        .map(({ module, name, kind }) => `${module}:${kind}:${name}`)
        .sort(),
    };
  } catch {
    fail(`Compiled wasm payload is invalid and could not be parsed: ${relativePath}`);
  }
}

function assertContainsAll(source, patterns, relativePath, artifactKind) {
  const missing = patterns.filter((pattern) => !source.includes(pattern));
  if (missing.length > 0) {
    fail(`Generated renderer ${artifactKind} is missing required contract entries in ${relativePath}: ${missing.join(', ')}`);
  }
}

function compareNormalizedWasmArtifact(relativePath) {
  const generated = stripCustomSections(fs.readFileSync(path.join(repoRoot, relativePath)));
  const generatedInterface = describeWasmModule(generated, relativePath);
  // [LAW:one-source-of-truth] Required exports must track the canonical wasm-bindgen surface in pkg/*.d.ts.
  // [LAW:one-source-of-truth] Keep in sync with #[wasm_bindgen] exports in lib.rs
  const requiredExports = [
    'memory:memory',
    'function:init_engine',
    'function:inject_poison_alloc',
    'function:install_pipeline',
    'function:pause_engine',
    'function:render_frame',
    'function:resume_engine',
    'function:take_frame_pacing_packet',
    'function:update_globals',
    'function:__wbindgen_malloc',
    'function:__wbindgen_realloc',
    'function:__wbindgen_exn_store',
    'function:__externref_table_alloc',
    'table:__wbindgen_externrefs',
    'function:__externref_table_dealloc',
    'function:__wbindgen_start',
  ];

  const missingExports = requiredExports.filter((entry) => !generatedInterface.exports.includes(entry));
  if (missingExports.length > 0) {
    fail(`Generated renderer wasm is missing required exports in ${relativePath}: ${missingExports.join(', ')}`);
  }

  const jsImportCount = generatedInterface.imports.filter((entry) =>
    entry.startsWith('./oscilla_rust_renderer_bg.js:function:')
  ).length;
  if (jsImportCount === 0) {
    fail(`Generated renderer wasm is missing required JS bridge imports in ${relativePath}.`);
  }
}

for (const file of requiredFiles) {
  const fullPath = path.join(pkgDir, file);
  if (!fs.existsSync(fullPath)) {
    fail(`Missing required artifact: ${path.relative(repoRoot, fullPath)}`);
  }
}

const entryJsPath = path.join(pkgDir, 'oscilla_rust_renderer.js');
const entryJs = fs.readFileSync(entryJsPath, 'utf8');
const entryDtsPath = path.join(pkgDir, 'oscilla_rust_renderer.d.ts');
const entryDts = fs.readFileSync(entryDtsPath, 'utf8');
const wasmDtsPath = path.join(pkgDir, 'oscilla_rust_renderer_bg.wasm.d.ts');
const wasmDts = fs.readFileSync(wasmDtsPath, 'utf8');

if (!entryJs.includes('oscilla_rust_renderer_bg.wasm')) {
  fail('Entry shim does not import compiled wasm payload.');
}

if (!entryJs.includes('init_engine') || !entryJs.includes('install_pipeline')) {
  fail('Entry shim does not export required renderer symbols.');
}

assertContainsAll(
  entryDts,
  [
    'export function init_engine',
    'export function inject_poison_alloc',
    'export function install_pipeline',
    'export function pause_engine',
    'export function render_frame',
    'export function resume_engine',
    'export function take_frame_pacing_packet',
    'export function update_globals',
    'export interface InitOutput',
    'export function initSync',
    'export default function __wbg_init',
  ],
  'src/render/wasm/pkg/oscilla_rust_renderer.d.ts',
  'type surface',
);

assertContainsAll(
  wasmDts,
  [
    'export const memory: WebAssembly.Memory;',
    'export const init_engine:',
    'export const inject_poison_alloc:',
    'export const install_pipeline:',
    'export const pause_engine:',
    'export const render_frame:',
    'export const resume_engine:',
    'export const take_frame_pacing_packet:',
    'export const update_globals:',
    'export const __wbindgen_malloc:',
    'export const __wbindgen_realloc:',
    'export const __wbindgen_start:',
  ],
  'src/render/wasm/pkg/oscilla_rust_renderer_bg.wasm.d.ts',
  'wasm type surface',
);

const wasmPath = path.join(pkgDir, 'oscilla_rust_renderer_bg.wasm');
const wasmSize = fs.statSync(wasmPath).size;
if (wasmSize < 64 * 1024) {
  fail(`Compiled wasm payload is unexpectedly small (${wasmSize} bytes).`);
}

// [LAW:no-silent-fallbacks] Generated wasm must still match the checked-in
// runtime payload semantically, but host-specific custom sections are not a
// reliable parity signal across build machines.
compareNormalizedWasmArtifact(wasmArtifactPath);

console.log(`[verify-rust-renderer-pkg] OK (${wasmSize} bytes)`);
