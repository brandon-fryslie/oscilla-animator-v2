import { describe, expect, it } from 'vitest';
import { registerAllBlocks } from '../all';
import { getBlockRegistryRevision, requireBlockDef } from '../registry';

describe('registerAllBlocks', () => {
  it('rebuilds block registry without duplicate-registration errors', () => {
    registerAllBlocks();
    const before = getBlockRegistryRevision();
    const timeRootBefore = requireBlockDef('InfiniteTimeRoot');

    expect(timeRootBefore.type).toBe('InfiniteTimeRoot');
    expect(() => registerAllBlocks()).not.toThrow();

    const after = getBlockRegistryRevision();
    const timeRootAfter = requireBlockDef('InfiniteTimeRoot');

    expect(after).toBeGreaterThan(before);
    expect(timeRootAfter.type).toBe('InfiniteTimeRoot');
  });

  it('registers pillar metadata for core render architecture blocks', () => {
    registerAllBlocks();
    expect(requireBlockDef('FluidSim').pillar).toBe('generator');
    expect(requireBlockDef('InstanceDomain').pillar).toBe('generator');
    expect(requireBlockDef('RenderInstances2D').pillar).toBe('intent');
    expect(requireBlockDef('WebGPUType1Sink').pillar).toBe('intent');
    expect(requireBlockDef('Camera').pillar).toBe('context');
  });
});
