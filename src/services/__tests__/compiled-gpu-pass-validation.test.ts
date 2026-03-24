import { describe, expect, it } from 'vitest';
import { validateCompiledGpuPassBundle } from '../compiled-gpu-pass-validation';
import type { CompiledGpuPassArtifact, CompiledGpuPassBundle } from '../compile-worker-protocol';
import type { GpuPassStage } from '../../types/gpu-pass-stage';

function buildBundle(passes: readonly CompiledGpuPassArtifact[]): CompiledGpuPassBundle {
  return {
    schemaVersion: 1,
    passes,
  };
}

function buildPass(overrides: Partial<CompiledGpuPassArtifact> = {}): CompiledGpuPassArtifact {
  return {
    passId: 'simulation',
    stage: 'compute',
    entryPoint: 'compute_main',
    wgsl: '@compute @workgroup_size(64, 1, 1)\nfn compute_main() {}',
    ...overrides,
  };
}

function expectValidationError(
  passOverrides: Partial<CompiledGpuPassArtifact>,
  expectedMessageFragment: string,
): void {
  const result = validateCompiledGpuPassBundle(buildBundle([buildPass(passOverrides)]));
  expect(result.kind).toBe('error');
  if (result.kind !== 'error') return;
  expect(result.errors.some((error) => error.message.includes(expectedMessageFragment))).toBe(true);
}

describe('validateCompiledGpuPassBundle pass signature normalization', () => {
  it('accepts valid pass signatures and emits manifest signatures', () => {
    const result = validateCompiledGpuPassBundle(buildBundle([buildPass()]));

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
    expect(result.bundle.passes[0]).toEqual(buildPass());
  });

  it('rejects empty pass bundles', () => {
    const result = validateCompiledGpuPassBundle(buildBundle([]));
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.errors.some((error) => error.message.includes('empty GPU artifact pass bundle'))).toBe(true);
  });

  it('rejects pass bundles with invalid stage', () => {
    expectValidationError(
      { stage: 'geometry' as unknown as GpuPassStage },
      'unsupported stage',
    );
  });

  it('rejects invalid entrypoint identifiers', () => {
    expectValidationError(
      { entryPoint: '123bad', wgsl: '@compute @workgroup_size(64, 1, 1)\nfn 123bad() {}' },
      'invalid entryPoint',
    );
  });

  it('rejects missing entrypoint values', () => {
    expectValidationError({ entryPoint: '' }, 'missing entryPoint');
  });

});

describe('validateCompiledGpuPassBundle bundle policy validation', () => {
  it('rejects duplicate pass identifiers', () => {
    const result = validateCompiledGpuPassBundle(
      buildBundle([
        buildPass({ passId: 'simulation', entryPoint: 'compute_main', wgsl: '@compute\nfn compute_main() {}' }),
        buildPass({ passId: 'simulation', entryPoint: 'compute_main', wgsl: '@compute\nfn compute_main() {}' }),
      ]),
    );
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.errors.some((error) => error.message.includes('duplicate passId'))).toBe(true);
  });

  it('rejects bundles that contain no compute passes', () => {
    const result = validateCompiledGpuPassBundle(
      buildBundle([
        buildPass({
          passId: 'invalid-a',
          stage: 'geometry' as unknown as GpuPassStage,
          entryPoint: 'invalid_a',
          wgsl: 'fn invalid_a() {}',
        }),
        buildPass({
          passId: 'invalid-b',
          stage: 'geometry' as unknown as GpuPassStage,
          entryPoint: 'invalid_b',
          wgsl: 'fn invalid_b() {}',
        }),
      ]),
    );
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.errors.some((error) => error.message.includes('at least one compute pass is required'))).toBe(true);
  });

  it('preserves original pass indices for duplicate diagnostics after filtering invalid entries', () => {
    const result = validateCompiledGpuPassBundle(
      buildBundle([
        buildPass({
          passId: 'invalid-stage',
          stage: 'geometry' as unknown as GpuPassStage,
          entryPoint: 'invalid_stage_main',
          wgsl: 'fn invalid_stage_main() {}',
        }),
        buildPass({
          passId: 'dup',
          entryPoint: 'dup_main_a',
          wgsl: '@compute\nfn dup_main_a() {}',
        }),
        buildPass({
          passId: 'dup',
          entryPoint: 'dup_main_b',
          wgsl: '@compute\nfn dup_main_b() {}',
        }),
      ]),
    );
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.errors.some((error) => error.message.includes('passes[2]') && error.message.includes('duplicate passId'))).toBe(
      true,
    );
  });

  it('returns a structured error when passes payload is malformed', () => {
    const malformedBundle = {
      schemaVersion: 1,
      passes: null,
    } as unknown as CompiledGpuPassBundle;
    const result = validateCompiledGpuPassBundle(malformedBundle);
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.errors.some((error) => error.message.includes('empty GPU artifact pass bundle'))).toBe(true);
  });
});
