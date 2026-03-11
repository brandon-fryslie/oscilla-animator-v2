import { describe, expect, it } from 'vitest';
import { validateCompiledGpuPassBundle } from '../compiled-gpu-pass-validation';
import type { CompiledGpuArtifactBundle, CompiledGpuPassArtifact } from '../compile-worker-protocol';

function buildBundle(passes: readonly CompiledGpuPassArtifact[]): CompiledGpuArtifactBundle {
  return {
    schemaVersion: 1,
    passes,
  };
}

describe('validateCompiledGpuPassBundle', () => {
  it('accepts valid pass signatures and emits manifest signatures', () => {
    const result = validateCompiledGpuPassBundle(
      buildBundle([{
        passId: 'simulation',
        stage: 'compute',
        entryPoint: 'compute_main',
        wgsl: '@compute @workgroup_size(64, 1, 1)\nfn compute_main() {}',
      }]),
    );

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.manifest).toEqual({
      schemaVersion: 1,
      passes: [{
        passId: 'simulation',
        stage: 'compute',
        entryPoint: 'compute_main',
      }],
    });
    expect(result.bundle.passes[0]).toEqual({
      passId: 'simulation',
      stage: 'compute',
      entryPoint: 'compute_main',
      wgsl: '@compute @workgroup_size(64, 1, 1)\nfn compute_main() {}',
    });
  });

  it('rejects pass bundles with invalid stage', () => {
    const result = validateCompiledGpuPassBundle(
      buildBundle([{
        passId: 'simulation',
        stage: 'vertex' as unknown as 'compute',
        entryPoint: 'compute_main',
        wgsl: '@compute @workgroup_size(64, 1, 1)\nfn compute_main() {}',
      }]),
    );

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.errors.some((error) => error.message.includes('unsupported stage'))).toBe(true);
  });

  it('rejects invalid entrypoint identifiers', () => {
    const result = validateCompiledGpuPassBundle(
      buildBundle([{
        passId: 'simulation',
        stage: 'compute',
        entryPoint: '123bad',
        wgsl: '@compute @workgroup_size(64, 1, 1)\nfn 123bad() {}',
      }]),
    );

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.errors.some((error) => error.message.includes('invalid entryPoint'))).toBe(true);
  });

  it('rejects missing entrypoint values', () => {
    const result = validateCompiledGpuPassBundle(
      buildBundle([{
        passId: 'simulation',
        stage: 'compute',
        entryPoint: '',
        wgsl: '@compute @workgroup_size(64, 1, 1)\nfn compute_main() {}',
      }]),
    );

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.errors.some((error) => error.message.includes('missing entryPoint'))).toBe(true);
  });

  it('rejects WGSL payloads missing compute annotation', () => {
    const result = validateCompiledGpuPassBundle(
      buildBundle([{
        passId: 'simulation',
        stage: 'compute',
        entryPoint: 'compute_main',
        wgsl: 'fn compute_main() {}',
      }]),
    );

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.errors.some((error) => error.message.includes('missing @compute entry annotation'))).toBe(true);
  });

  it('rejects WGSL payloads missing declared entrypoint function', () => {
    const result = validateCompiledGpuPassBundle(
      buildBundle([{
        passId: 'simulation',
        stage: 'compute',
        entryPoint: 'compute_main',
        wgsl: '@compute @workgroup_size(64, 1, 1)\nfn other_main() {}',
      }]),
    );

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.errors.some((error) => error.message.includes('missing fn compute_main(...)'))).toBe(true);
  });
});
