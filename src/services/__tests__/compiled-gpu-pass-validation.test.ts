import { describe, expect, it } from 'vitest';
import { validateCompiledGpuPassBundle } from '../compiled-gpu-pass-validation';
import type { CompiledGpuArtifactBundle, CompiledGpuPassArtifact } from '../compile-worker-protocol';

function buildBundle(passes: readonly CompiledGpuPassArtifact[]): CompiledGpuArtifactBundle {
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

describe('validateCompiledGpuPassBundle', () => {
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

  it('rejects pass bundles with invalid stage', () => {
    expectValidationError(
      { stage: 'vertex' as unknown as 'compute' },
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

  it('rejects WGSL payloads missing compute annotation', () => {
    expectValidationError({ wgsl: 'fn compute_main() {}' }, 'missing @compute entry annotation');
  });

  it('rejects WGSL payloads missing declared entrypoint function', () => {
    expectValidationError(
      { wgsl: '@compute @workgroup_size(64, 1, 1)\nfn other_main() {}' },
      'missing fn compute_main(...)',
    );
  });

  it('rejects duplicate pass identifiers', () => {
    const result = validateCompiledGpuPassBundle(
      buildBundle([
        buildPass({ passId: 'fluid.present', entryPoint: 'compute_present_main', wgsl: '@compute\nfn compute_present_main() {}' }),
        buildPass({ passId: 'fluid.present', entryPoint: 'compute_present_main', wgsl: '@compute\nfn compute_present_main() {}' }),
      ]),
    );
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.errors.some((error) => error.message.includes('duplicate passId'))).toBe(true);
  });

  it('rejects invalid fluid bundle order and missing present pass', () => {
    const result = validateCompiledGpuPassBundle(
      buildBundle([
        buildPass({ passId: 'fluid.advect', entryPoint: 'compute_advect_main', wgsl: '@compute\nfn compute_advect_main() {}' }),
        buildPass({ passId: 'fluid.curl', entryPoint: 'compute_curl_main', wgsl: '@compute\nfn compute_curl_main() {}' }),
      ]),
    );
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.errors.some((error) => error.message.includes('missing \"fluid.present\"'))).toBe(true);
    expect(result.errors.some((error) => error.message.includes('invalid fluid pass order'))).toBe(true);
  });

  it('returns a structured error when passes payload is malformed', () => {
    const malformedBundle = {
      schemaVersion: 1,
      passes: null,
    } as unknown as CompiledGpuArtifactBundle;
    const result = validateCompiledGpuPassBundle(malformedBundle);
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.errors.some((error) => error.message.includes('empty GPU artifact pass bundle'))).toBe(true);
  });
});
