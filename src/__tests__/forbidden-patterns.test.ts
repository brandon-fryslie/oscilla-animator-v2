import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { rgLines } from '../testing/rg-search';

const ACTIVE_RENDERER_FILE = 'src/render/webgpu/RustWasmWebGPURenderer.ts';
const ACTIVE_RUST_RENDER_ENGINE_FILE = 'src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs';
const ACTIVE_RUST_RENDER_SRC = 'src/render/wasm/rust/oscilla-rust-renderer/src';

describe('forbidden patterns (v3 hard rules)', () => {
  it('forbids legacy shape2d record writes in frame executors', () => {
    const matches = rgLines('writeShape2D\\s*\\(', [
      'src/runtime/ScheduleExecutor.ts',
      'src/runtime/executeFrameStepped.ts',
    ]);

    // [LAW:single-enforcer] Executor hot loop is the only frame-write boundary;
    // legacy shape2d object record writes must not re-enter this path.
    expect(matches).toEqual([]);
  });

  it('forbids shape2d object unpack helper in render hot path', () => {
    const matches = rgLines('readShape2D\\s*\\(', ['src/runtime']);

    // [LAW:verifiable-goals] Static gate prevents per-instance object unpack
    // churn from reappearing in render grouping loops.
    expect(matches).toEqual([]);
  });

  it('forbids Path2D allocation in runtime/compiler hot modules', () => {
    const matches = rgLines('new\\s+Path2D\\s*\\(', ['src/runtime', 'src/compiler']);
    expect(matches).toEqual([]);
  });

  it('forbids f64 storage-class references in compiler/runtime contracts', () => {
    const matches = rgLines("storage:\\s*'f64'", ['src/compiler', 'src/runtime']);
    expect(matches).toEqual([]);
  });

  it('forbids CPU coordinate-bounds scans in the animation hot path', () => {
    const matches = rgLines('calculateContentBounds\\s*\\(', ['src/services/AnimationLoop.ts']);

    // [LAW:dataflow-not-control-flow] Frame orchestration must execute the same
    // GPU-first steps each frame; CPU geometry scans are forbidden in-loop.
    expect(matches).toEqual([]);
  });

  it('forbids mode-flag branching in compute orchestration executors', () => {
    const matches = rgLines('mode\\s*===', [
      'src/runtime/ScheduleExecutor.ts',
      'src/runtime/executeFrameStepped.ts',
    ]);

    // [LAW:no-mode-explosion] Executor compute orchestration cannot fork by
    // runtime mode flags; variability is expressed in data, not mode branches.
    expect(matches).toEqual([]);
  });

  it('forbids non-debug GPU copy commands in the active hot path', () => {
    // [LAW:single-enforcer] Guardrails enforce the active Rust worker
    // renderer boundary, not dormant TS implementations.
    const rustCopyCalls = rgLines('copy_buffer_to_buffer\\s*\\(', [ACTIVE_RUST_RENDER_ENGINE_FILE], ['*.rs']);
    expect(rustCopyCalls).toHaveLength(1);

    const engineSource = readFileSync(ACTIVE_RUST_RENDER_ENGINE_FILE, 'utf-8');
    // [LAW:dataflow-not-control-flow] The only allowed copy operation in
    // the hot path is debug-readback staging behind the explicit debug gate.
    expect(engineSource).toMatch(/if is_debug_tick\s*\{[\s\S]*copy_buffer_to_buffer\s*\(/);

    const tsCopyCalls = rgLines('copyBufferToBuffer\\s*\\(', [ACTIVE_RENDERER_FILE]);
    expect(tsCopyCalls).toEqual([]);
  });

  it('forbids runtime arena reassignment in frame executors', () => {
    const matches = rgLines('state\\.arena\\s*=', [
      'src/runtime/ScheduleExecutor.ts',
      'src/runtime/executeFrameStepped.ts',
    ]);

    // [LAW:one-source-of-truth] Runtime arena storage is single-owned and must
    // not be replaced inside frame execution loops.
    expect(matches).toEqual([]);
  });

  it('forbids shape-bank mutation helpers in renderer/assembler hot paths', () => {
    const matches = rgLines('writeShapeBank(Header|HandleMetadata)\\s*\\(', [
      'src/runtime/ScheduleExecutor.ts',
      'src/runtime/executeFrameStepped.ts',
      ACTIVE_RENDERER_FILE,
    ]);
    expect(matches).toEqual([]);
  });

  it('forbids CPU-side direct indirect-args writes in WebGPU renderer', () => {
    const tsMatches = rgLines('writeBuffer\\s*\\(\\s*this\\.indirectArgsBuffer', [
      ACTIVE_RENDERER_FILE,
    ]);
    expect(tsMatches).toEqual([]);

    // [LAW:single-enforcer] Active indirect writes are owned by GPU draw-prep;
    // Rust CPU helpers must not be invoked in the runtime hot path.
    const rustCpuIndirectWriteCallsites = rgLines('\\.write_indirect_words\\s*\\(', [
      ACTIVE_RUST_RENDER_SRC,
    ], ['*.rs']);
    expect(rustCpuIndirectWriteCallsites).toEqual([]);
  });

  it('forbids canonical runtime hotpath modules from importing legacy CPU projection assembly', () => {
    const matches = rgLines(
      "from\\s+['\"][^'\"]*(projection/ortho-kernel|projection/perspective-kernel|projection/fields)[^'\"]*['\"]",
      [
        'src/services/RuntimeService.ts',
        'src/services/AnimationLoop.ts',
        'src/services/runtime-hotpath.worker.ts',
        'src/services/runtime-hotpath-install.ts',
        ACTIVE_RENDERER_FILE,
      ],
    );

    // [LAW:one-way-deps] Canonical hotpath ownership points toward GPU sink
    // install/dispatch only; legacy CPU projection modules remain isolated.
    expect(matches).toEqual([]);
  });

  it('forbids runtime public surface from exporting legacy CPU projection helpers', () => {
    const matches = rgLines('projectAndCompact|compactAndCopy', [
      'src/runtime/index.ts',
    ]);

    // [LAW:one-source-of-truth] Public runtime ownership is the GPU-native
    // contract; legacy CPU projection helpers stay non-canonical/private.
    expect(matches).toEqual([]);
  });
});
