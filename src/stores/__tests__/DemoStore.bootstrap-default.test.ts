import { describe, expect, it, vi } from 'vitest';
import { registerAllBlocks } from '../../blocks/all';
import { DemoStore } from '../DemoStore';
import { GPU_BOOTSTRAP_DEMO_FILENAME } from '../../demo';
import type { HclDemo } from '../../demo';

registerAllBlocks();

describe('DemoStore bootstrap default', () => {
  it('loads the canonical GPU bootstrap demo by default when available', () => {
    const loadFromHCL = vi.fn();
    const store = new DemoStore({ loadFromHCL } as never);

    store.loadDefault();

    expect(store.currentFilename).toBe(GPU_BOOTSTRAP_DEMO_FILENAME);
    expect(loadFromHCL).toHaveBeenCalledTimes(1);
  });

  it('does not admit parse-invalid demos as GPU-verified defaults', () => {
    const loadFromHCL = vi.fn();
    const store = new DemoStore({ loadFromHCL } as never);
    const demos: HclDemo[] = [
      {
        filename: 'broken.hcl',
        relativePath: 'integration/broken.hcl',
        group: 'integration',
        name: 'Broken',
        hcl: 'this is not valid hcl',
        summary: 'Broken fixture',
        purposes: ['integration'],
        highlights: ['fixture'],
      },
      {
        filename: GPU_BOOTSTRAP_DEMO_FILENAME,
        relativePath: 'integration/gpu-bootstrap-triangle.hcl',
        group: 'integration',
        name: 'Bootstrap',
        hcl: store.demos.find((demo) => demo.filename === GPU_BOOTSTRAP_DEMO_FILENAME)!.hcl,
        summary: 'Bootstrap fixture',
        purposes: ['integration'],
        highlights: ['fixture'],
      },
    ];

    (store as { demos: readonly HclDemo[] }).demos = demos;
    store.loadDefault();

    expect(store.currentFilename).toBe(GPU_BOOTSTRAP_DEMO_FILENAME);
    expect(loadFromHCL).toHaveBeenCalledTimes(1);
  });
});
