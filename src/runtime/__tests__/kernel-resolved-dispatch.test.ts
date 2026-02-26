import { describe, it, expect } from 'vitest';
import { applyPureFn } from '../ScalarKernelLibrary';
import { createDefaultRegistry } from '../kernels/default-registry';
import { kernelId } from '../KernelRegistry';

describe('kernelResolved dispatch', () => {
  it('dispatches scalar kernel handles through program registry context', () => {
    const registry = createDefaultRegistry();
    const resolved = registry.resolve(kernelId('noise3'));
    expect(resolved.abi).toBe('scalar');
    const args = [0.1, 0.2, 0.3, 0.4];
    const direct = registry.callScalar(resolved.handle, args);
    const viaPureFn = applyPureFn(
      { kind: 'kernelResolved', handle: resolved.handle, abi: resolved.abi },
      args,
      { kernelRegistry: registry },
    );
    expect(viaPureFn).toBeCloseTo(direct, 6);
  });

  it('throws when kernelResolved is evaluated without context', () => {
    const registry = createDefaultRegistry();
    const resolved = registry.resolve(kernelId('noise3'));
    expect(() =>
      applyPureFn({ kind: 'kernelResolved', handle: resolved.handle, abi: resolved.abi }, [0.1, 0.2, 0.3, 0.4]),
    ).toThrow(/requires PureFnExecutionContext/);
  });

  it('throws for lane ABI in scalar evaluator path', () => {
    const registry = createDefaultRegistry();
    const resolved = registry.resolve(kernelId('hsvToRgb'));
    expect(resolved.abi).toBe('lane');
    expect(() =>
      applyPureFn(
        { kind: 'kernelResolved', handle: resolved.handle, abi: resolved.abi },
        [0.1, 0.5, 0.9],
        { kernelRegistry: registry },
      ),
    ).toThrow(/lane ABI is not scalar-evaluable/);
  });
});
