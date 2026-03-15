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

function compareExactArtifact(relativePath) {
  const checkedIn = readHeadBlob(relativePath);
  const generated = fs.readFileSync(path.join(repoRoot, relativePath));

  if (!checkedIn.equals(generated)) {
    fail(`Generated renderer artifact drifted from checked-in output: ${relativePath}. Run \`pnpm -s build:rust-renderer\` and commit the pkg changes.`);
  }
}

function compareNormalizedWasmArtifact(relativePath) {
  const checkedIn = stripCustomSections(readHeadBlob(relativePath));
  const generated = stripCustomSections(fs.readFileSync(path.join(repoRoot, relativePath)));

  if (!checkedIn.equals(generated)) {
    fail(`Generated renderer wasm drifted from checked-in output after stripping custom sections: ${relativePath}. Run \`pnpm -s build:rust-renderer\` and commit the pkg changes.`);
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

compareExactArtifact('src/render/wasm/pkg/oscilla_rust_renderer.js');
compareExactArtifact('src/render/wasm/pkg/oscilla_rust_renderer.d.ts');
compareExactArtifact('src/render/wasm/pkg/oscilla_rust_renderer_bg.wasm.d.ts');
// [LAW:no-silent-fallbacks] Generated wasm must still match the checked-in
// runtime payload semantically, but host-specific custom sections are not a
// reliable parity signal across build machines.
compareNormalizedWasmArtifact(wasmArtifactPath);

console.log(`[verify-rust-renderer-pkg] OK (${wasmSize} bytes)`);
