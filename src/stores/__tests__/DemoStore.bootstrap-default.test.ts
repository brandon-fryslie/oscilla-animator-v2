import { describe, expect, it, vi } from 'vitest';
import { registerAllBlocks } from '../../blocks/all';
import { DemoStore } from '../DemoStore';
import { GPU_BOOTSTRAP_DEMO_FILENAME } from '../../demo';

registerAllBlocks();

describe('DemoStore bootstrap default', () => {
  it('loads the canonical GPU bootstrap demo by default when available', () => {
    const loadFromHCL = vi.fn();
    const store = new DemoStore({ loadFromHCL } as never);

    store.loadDefault();

    expect(store.currentFilename).toBe(GPU_BOOTSTRAP_DEMO_FILENAME);
    expect(loadFromHCL).toHaveBeenCalledTimes(1);
  });
});
