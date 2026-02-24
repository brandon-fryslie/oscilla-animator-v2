import { describe, expect, it } from 'vitest';
import { createWebGPURenderer } from '../WebGPURenderer';

describe('WebGPURenderer', () => {
  it('fails fast when WebGPU is unavailable', async () => {
    const originalGpu = (navigator as Navigator & { gpu?: unknown }).gpu;
    try {
      Object.defineProperty(navigator, 'gpu', {
        value: undefined,
        configurable: true,
      });

      const canvas = document.createElement('canvas');
      await expect(createWebGPURenderer(canvas)).rejects.toThrow('navigator.gpu');
    } finally {
      Object.defineProperty(navigator, 'gpu', {
        value: originalGpu,
        configurable: true,
      });
    }
  });
});
