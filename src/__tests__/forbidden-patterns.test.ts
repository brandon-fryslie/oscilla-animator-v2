import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function rg(pattern: string, scope: readonly string[]): string[] {
  try {
    const out = execFileSync(
      'rg',
      ['-n', '--no-heading', '--color', 'never', '--glob', '*.ts', '--glob', '*.tsx', pattern, ...scope],
      { encoding: 'utf8', cwd: process.cwd() },
    ).trim();
    return out ? out.split('\n').filter(Boolean) : [];
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 1) return [];
    throw error;
  }
}

describe('forbidden patterns (v3 hard rules)', () => {
  it('forbids legacy shape2d record writes in frame executors', () => {
    const matches = rg('writeShape2D\\s*\\(', [
      'src/runtime/ScheduleExecutor.ts',
      'src/runtime/executeFrameStepped.ts',
    ]);

    // [LAW:single-enforcer] Executor hot loop is the only frame-write boundary;
    // legacy shape2d object record writes must not re-enter this path.
    expect(matches).toEqual([]);
  });

  it('forbids shape2d object unpack helper in render hot path', () => {
    const matches = rg('readShape2D\\s*\\(', ['src/runtime/RenderAssembler.ts']);

    // [LAW:verifiable-goals] Static gate prevents per-instance object unpack
    // churn from reappearing in render grouping loops.
    expect(matches).toEqual([]);
  });

  it('forbids Path2D allocation in runtime/compiler hot modules', () => {
    const matches = rg('new\\s+Path2D\\s*\\(', ['src/runtime', 'src/compiler']);
    expect(matches).toEqual([]);
  });

  it('forbids f64 storage-class references in compiler/runtime contracts', () => {
    const matches = rg("storage:\\s*'f64'", ['src/compiler', 'src/runtime']);
    expect(matches).toEqual([]);
  });

  it('forbids CPU coordinate-bounds scans in the animation hot path', () => {
    const matches = rg('calculateContentBounds\\s*\\(', ['src/services/AnimationLoop.ts']);

    // [LAW:dataflow-not-control-flow] Frame orchestration must execute the same
    // GPU-first steps each frame; CPU geometry scans are forbidden in-loop.
    expect(matches).toEqual([]);
  });

  it('forbids mode-flag branching in compute orchestration executors', () => {
    const matches = rg('mode\\s*===', [
      'src/runtime/ScheduleExecutor.ts',
      'src/runtime/executeFrameStepped.ts',
    ]);

    // [LAW:no-mode-explosion] Executor compute orchestration cannot fork by
    // runtime mode flags; variability is expressed in data, not mode branches.
    expect(matches).toEqual([]);
  });

  it('forbids GPU full-buffer copy commands in the WebGPU hot path', () => {
    const matches = rg('copyBufferToBuffer\\s*\\(', ['src/render/webgpu/WebGPURenderer.ts']);

    // [LAW:dataflow-not-control-flow] Frame execution keeps one deterministic
    // compute->draw flow without whole-buffer copy detours.
    expect(matches).toEqual([]);
  });

  it('forbids runtime arena reassignment in frame executors', () => {
    const matches = rg('state\\.arena\\s*=', [
      'src/runtime/ScheduleExecutor.ts',
      'src/runtime/executeFrameStepped.ts',
    ]);

    // [LAW:one-source-of-truth] Runtime arena storage is single-owned and must
    // not be replaced inside frame execution loops.
    expect(matches).toEqual([]);
  });

  it('forbids shape-bank mutation helpers in renderer/assembler hot paths', () => {
    const matches = rg('writeShapeBank(Header|HandleMetadata)\\s*\\(', [
      'src/runtime/RenderAssembler.ts',
      'src/render/webgpu/WebGPURenderer.ts',
    ]);
    expect(matches).toEqual([]);
  });

  it('forbids CPU-side direct indirect-args writes in WebGPU renderer', () => {
    const matches = rg('writeBuffer\\s*\\(\\s*this\\.indirectArgsBuffer', [
      'src/render/webgpu/WebGPURenderer.ts',
    ]);
    expect(matches).toEqual([]);
  });
});
