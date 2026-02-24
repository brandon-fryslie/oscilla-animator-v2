import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebGPURenderer } from '../WebGPURenderer';
import { WEBGPU_RENDER_CONTRACT } from '../shaders';

function setNavigatorGpu(value: unknown): void {
  Object.defineProperty(navigator, 'gpu', {
    value,
    configurable: true,
  });
}

function createFakeWebGPUEnvironment() {
  const computePass = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    dispatchWorkgroups: vi.fn(),
    end: vi.fn(),
  };
  const renderPass = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    drawIndexed: vi.fn(),
    end: vi.fn(),
  };

  const commandEncoder = {
    beginComputePass: vi.fn(() => computePass),
    beginRenderPass: vi.fn(() => renderPass),
    finish: vi.fn(() => ({ label: 'cmd' })),
  };

  const device = {
    queue: {
      writeBuffer: vi.fn(),
      submit: vi.fn(),
    },
    lost: new Promise(() => {}),
    addEventListener: vi.fn(),
    createShaderModule: vi.fn(() => ({})),
    createComputePipeline: vi.fn(() => ({
      getBindGroupLayout: vi.fn(() => ({ label: 'compute-layout' })),
    })),
    createRenderPipeline: vi.fn(() => ({
      getBindGroupLayout: vi.fn(() => ({ label: 'render-layout' })),
    })),
    createBuffer: vi.fn((descriptor: { size: number }) => ({
      descriptor,
      destroy: vi.fn(),
      getMappedRange: vi.fn(() => new ArrayBuffer(descriptor.size)),
      unmap: vi.fn(),
    })),
    createBindGroup: vi.fn((descriptor: unknown) => descriptor),
    createCommandEncoder: vi.fn(() => commandEncoder),
  };

  const adapter = {
    features: new Set<string>(),
    requestDevice: vi.fn(async () => device),
  };

  const gpu = {
    requestAdapter: vi.fn(async () => adapter),
    getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm'),
  };

  const context = {
    configure: vi.fn(),
    getCurrentTexture: vi.fn(() => ({
      createView: vi.fn(() => ({ label: 'view' })),
    })),
  };

  const canvas = document.createElement('canvas');
  const getContextSpy = vi
    .spyOn(canvas, 'getContext')
    .mockImplementation((contextId: string) => (contextId === 'webgpu' ? (context as any) : null));

  return {
    gpu,
    adapter,
    device,
    context,
    canvas,
    getContextSpy,
    computePass,
    renderPass,
  };
}

describe('WebGPURenderer', () => {
  const originalGpu = (navigator as Navigator & { gpu?: unknown }).gpu;

  afterEach(() => {
    setNavigatorGpu(originalGpu);
    vi.restoreAllMocks();
  });

  it('fails fast when WebGPU is unavailable', async () => {
    setNavigatorGpu(undefined);
    const canvas = document.createElement('canvas');
    await expect(createWebGPURenderer(canvas)).rejects.toThrow('navigator.gpu');
  });

  it('fails fast when adapter acquisition fails', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu({
      requestAdapter: vi.fn(async () => null),
      getPreferredCanvasFormat: env.gpu.getPreferredCanvasFormat,
    });

    await expect(createWebGPURenderer(env.canvas)).rejects.toThrow('no adapter');
  });

  it('fails fast when webgpu canvas context is unavailable', async () => {
    const env = createFakeWebGPUEnvironment();
    env.getContextSpy.mockReturnValue(null);
    setNavigatorGpu(env.gpu);

    await expect(createWebGPURenderer(env.canvas)).rejects.toThrow('canvas.getContext("webgpu")');
  });

  it('builds buffers and bind-groups from the canonical WebGPU contract', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);

    await createWebGPURenderer(env.canvas);

    const bufferSizes = env.device.createBuffer.mock.calls.map(
      ([descriptor]: [{ size: number }]) => descriptor.size
    );
    expect(bufferSizes).toContain(WEBGPU_RENDER_CONTRACT.sceneUniformBytes);
    expect(bufferSizes).toContain(
      WEBGPU_RENDER_CONTRACT.instanceBytes * 1024
    );
    expect(bufferSizes).toContain(
      WEBGPU_RENDER_CONTRACT.computeParamsFloats * Float32Array.BYTES_PER_ELEMENT
    );

    const bindGroupDescriptors = env.device.createBindGroup.mock.calls.map(
      ([descriptor]: [unknown]) => descriptor as { entries: Array<{ binding: number }> }
    );
    const bindingSets = bindGroupDescriptors.map((descriptor) =>
      descriptor.entries.map((entry) => entry.binding)
    );
    expect(bindingSets).toContainEqual([WEBGPU_RENDER_CONTRACT.sceneBinding]);
    expect(bindingSets).toContainEqual([
      WEBGPU_RENDER_CONTRACT.instanceBinding,
    ]);
    expect(bindingSets).toContainEqual([
      WEBGPU_RENDER_CONTRACT.computeSrcStateBinding,
      WEBGPU_RENDER_CONTRACT.computeDstStateBinding,
      WEBGPU_RENDER_CONTRACT.computeParamsBinding,
    ]);
  });

  it('aligns mapped upload buffers to 4-byte boundaries', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);

    renderer.render({
      frame: {
        version: 2,
        ops: [
          {
            kind: 'drawPathInstances',
            geometry: {
              topologyId: 1,
              verbs: new Uint8Array([0, 1, 1, 4]),
              points: new Float32Array([0, 0, 1, 0, 0, 1]),
              pointsCount: 3,
            },
            instances: {
              count: 1,
              position: new Float32Array([0.5, 0.5]),
              size: 1,
              rotation: new Float32Array([0]),
              scale2: new Float32Array([1, 1]),
            },
            style: {
              fillColor: new Uint8ClampedArray([255, 255, 255, 255]),
            },
          },
        ],
      },
      width: 128,
      height: 128,
      zoom: 1,
      panX: 0,
      panY: 0,
      timeMs: 0,
    });

    const mappedBufferSizes = env.device.createBuffer.mock.calls
      .map(([descriptor]: [{ size: number; mappedAtCreation?: boolean }]) => descriptor)
      .filter((descriptor) => descriptor.mappedAtCreation)
      .map((descriptor) => descriptor.size);

    expect(mappedBufferSizes.length).toBeGreaterThan(0);
    expect(mappedBufferSizes.every((size) => size % 4 === 0)).toBe(true);
    expect(mappedBufferSizes).toContain(8);
  });

  it('rejects render input that violates runtime contract bounds', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);

    expect(() =>
      renderer.render({
        frame: { version: 2, ops: [] },
        width: Number.NaN,
        height: 128,
        zoom: 1,
        panX: 0,
        panY: 0,
        timeMs: 0,
      })
    ).toThrow('width must be a finite non-negative number');
  });
});
