import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shaderInspector } from '../ShaderInspectorService';

describe('ShaderInspectorService', () => {
  beforeEach(() => {
    shaderInspector.clear();
  });

  it('stores an immutable snapshot of installed passes', () => {
    const inputPasses = [{
      passId: 'simulation',
      stage: 'compute' as const,
      entryPoint: 'compute_main',
      wgsl: '@compute @workgroup_size(64, 1, 1)\nfn compute_main() {}',
    }];

    shaderInspector.setPasses(inputPasses);
    inputPasses[0] = {
      ...inputPasses[0],
      passId: 'mutated',
      wgsl: '',
    };

    const snapshot = shaderInspector.getSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot?.passes).toHaveLength(1);
    expect(snapshot?.passes[0]?.passId).toBe('simulation');
    expect(snapshot?.passes[0]?.wgsl).toContain('compute_main');
  });

  it('notifies subscribers on set and clear', () => {
    const listener = vi.fn();
    const unsubscribe = shaderInspector.subscribe(listener);

    shaderInspector.setPasses([{
      passId: 'simulation',
      stage: 'compute',
      entryPoint: 'compute_main',
      wgsl: '@compute\nfn compute_main() {}',
    }]);
    shaderInspector.clear();

    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
