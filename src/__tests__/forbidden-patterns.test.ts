import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { rgLines } from '../testing/rg-search';

const ACTIVE_RENDERER_FILE = 'src/render/webgpu/RustWasmWebGPURenderer.ts';
const ACTIVE_RUST_RENDER_ENGINE_FILE = 'src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs';
const ACTIVE_RUST_RENDER_SRC = 'src/render/wasm/rust/oscilla-rust-renderer/src';

function expectNoMatches(pattern: string, scope: readonly string[], globs?: readonly string[]): void {
  expect(rgLines(pattern, scope, globs)).toEqual([]);
}

function registerRuntimeHotpathGuards(): void {
  it('forbids legacy shape2d record writes in frame executors', () => {
    expectNoMatches('writeShape2D\\s*\\(', [
      'src/runtime/ScheduleExecutor.ts',
      'src/runtime/executeFrameStepped.ts',
    ]);

    // [LAW:single-enforcer] Executor hot loop is the only frame-write boundary;
    // legacy shape2d object record writes must not re-enter this path.
  });

  it('forbids shape2d object unpack helper in render hot path', () => {
    expectNoMatches('readShape2D\\s*\\(', ['src/runtime']);

    // [LAW:verifiable-goals] Static gate prevents per-instance object unpack
    // churn from reappearing in render grouping loops.
  });

  it('forbids Path2D allocation in runtime/compiler hot modules', () => {
    expectNoMatches('new\\s+Path2D\\s*\\(', ['src/runtime', 'src/compiler']);
  });

  it('forbids f64 storage-class references in compiler/runtime contracts', () => {
    expectNoMatches("storage:\\s*'f64'", ['src/compiler', 'src/runtime']);
  });

  it('forbids CPU coordinate-bounds scans in the animation hot path', () => {
    expectNoMatches('calculateContentBounds\\s*\\(', ['src/services/AnimationLoop.ts']);

    // [LAW:dataflow-not-control-flow] Frame orchestration must execute the same
    // GPU-first steps each frame; CPU geometry scans are forbidden in-loop.
  });

  it('forbids mode-flag branching in compute orchestration executors', () => {
    expectNoMatches('mode\\s*===', [
      'src/runtime/ScheduleExecutor.ts',
      'src/runtime/executeFrameStepped.ts',
    ]);

    // [LAW:no-mode-explosion] Executor compute orchestration cannot fork by
    // runtime mode flags; variability is expressed in data, not mode branches.
  });

  it('forbids runtime arena reassignment in frame executors', () => {
    expectNoMatches('state\\.arena\\s*=', [
      'src/runtime/ScheduleExecutor.ts',
      'src/runtime/executeFrameStepped.ts',
    ]);

    // [LAW:one-source-of-truth] Runtime arena storage is single-owned and must
    // not be replaced inside frame execution loops.
  });

  it('forbids shape-bank mutation helpers in renderer/assembler hot paths', () => {
    expectNoMatches('writeShapeBank(Header|HandleMetadata)\\s*\\(', [
      'src/runtime/ScheduleExecutor.ts',
      'src/runtime/executeFrameStepped.ts',
      ACTIVE_RENDERER_FILE,
    ]);
  });
}

function registerRendererBoundaryGuards(): void {
  it('forbids non-debug GPU copy commands in the active hot path', () => {
    // [LAW:single-enforcer] Guardrails enforce the active Rust worker
    // renderer boundary, not dormant TS implementations.
    const rustCopyCalls = rgLines('copy_buffer_to_buffer\\s*\\(', [ACTIVE_RUST_RENDER_ENGINE_FILE], ['*.rs']);
    expect(rustCopyCalls).toHaveLength(1);

    const engineSource = readFileSync(ACTIVE_RUST_RENDER_ENGINE_FILE, 'utf-8');
    // [LAW:dataflow-not-control-flow] The only allowed copy operation in
    // the hot path is debug-readback staging behind the explicit debug gate.
    expect(engineSource).toMatch(/if is_debug_tick\s*\{[\s\S]*copy_buffer_to_buffer\s*\(/);

    expectNoMatches('copyBufferToBuffer\\s*\\(', [ACTIVE_RENDERER_FILE]);
  });

  it('forbids CPU-side direct indirect-args writes in WebGPU renderer', () => {
    expectNoMatches('writeBuffer\\s*\\(\\s*this\\.indirectArgsBuffer', [ACTIVE_RENDERER_FILE]);

    // [LAW:single-enforcer] Active indirect writes are owned by GPU draw-prep;
    // Rust CPU helpers must not be invoked in the runtime hot path.
    const rustCpuIndirectWriteCallsites = rgLines('\\.write_indirect_words\\s*\\(', [
      ACTIVE_RUST_RENDER_SRC,
    ], ['*.rs']);
    expect(rustCpuIndirectWriteCallsites).toEqual([]);
  });
}

function registerCanonicalProjectionOwnershipGuards(): void {
  it('forbids canonical runtime hotpath modules from importing legacy CPU projection assembly', () => {
    expectNoMatches(
      "from\\s+['\"][^'\"]*(projection/ortho-kernel|projection/perspective-kernel|projection/fields)[^'\"]*['\"]",
      [
        'src/services/RuntimeService.ts',
        'src/services/AnimationLoop.ts',
        'src/services/runtime-hotpath-install.ts',
        ACTIVE_RENDERER_FILE,
      ],
    );

    // [LAW:one-way-deps] Canonical hotpath ownership points toward GPU sink
    // install/dispatch only; legacy CPU projection modules remain isolated.
  });

  it('forbids runtime public surface from exporting legacy CPU projection helpers', () => {
    expectNoMatches('projectAndCompact|compactAndCopy', ['src/runtime/index.ts']);

    // [LAW:one-source-of-truth] Public runtime ownership is the GPU-native
    // contract; legacy CPU projection helpers stay non-canonical/private.
  });
}

describe('forbidden patterns (v3 hard rules)', () => {
  registerRuntimeHotpathGuards();
  registerRendererBoundaryGuards();
  registerCanonicalProjectionOwnershipGuards();
});
