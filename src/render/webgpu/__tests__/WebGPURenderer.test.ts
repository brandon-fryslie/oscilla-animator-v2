import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebGPURenderer } from '../WebGPURenderer';
import { WEBGPU_RENDER_CONTRACT } from '../shaders';
import { registerDynamicTopology } from '../../../shapes/registry';
import { PathVerb } from '../../../shapes/types';

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
    drawIndexedIndirect: vi.fn(),
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

function collectDrawPrepBindGroupCalls(createBindGroupMock: { mock: { calls: unknown[][] } }): unknown[][] {
  return createBindGroupMock.mock.calls.filter((call: unknown[]) => {
    const descriptor = call[0] as { entries?: Array<{ binding: number }> };
    if (!descriptor.entries || descriptor.entries.length !== 2) {
      return false;
    }
    return (
      descriptor.entries[0]?.binding === WEBGPU_RENDER_CONTRACT.drawPrepIndirectBinding &&
      descriptor.entries[1]?.binding === WEBGPU_RENDER_CONTRACT.drawPrepParamsBinding
    );
  });
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
    expect(bufferSizes).toContain(Uint32Array.BYTES_PER_ELEMENT);

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

  it('uploads topology-bank u32 data from the canonical topology registry', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);

    registerDynamicTopology({
      params: [],
      verbs: [PathVerb.MOVE, PathVerb.LINE, PathVerb.CLOSE],
      pointsPerVerb: [1, 1, 0],
      totalControlPoints: 2,
      closed: true,
    }, 'webgpu-topology-bank-test');

    await createWebGPURenderer(env.canvas);

    const hasU32TopologyWrite = env.device.queue.writeBuffer.mock.calls.some((args: unknown[]) => {
      const data = args[2];
      return data instanceof Uint32Array;
    });
    expect(hasU32TopologyWrite).toBe(true);
  });

  it('binds topology bank as an explicit render bind group', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);

    renderer.render({
      frame: { version: 2, ops: [] },
      width: 128,
      height: 96,
      zoom: 1,
      panX: 0,
      panY: 0,
      timeMs: 0,
    });

    expect(env.renderPass.setBindGroup).toHaveBeenCalledWith(
      WEBGPU_RENDER_CONTRACT.topologyBankBindGroup,
      expect.anything(),
    );
  });

  it('aligns mapped upload buffers to 4-byte boundaries', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = registerDynamicTopology({
      params: [],
      verbs: [PathVerb.MOVE, PathVerb.LINE, PathVerb.LINE, PathVerb.CLOSE],
      pointsPerVerb: [1, 1, 1, 0],
      totalControlPoints: 3,
      closed: true,
    }, 'webgpu-upload-alignment-test');

    renderer.render({
      frame: {
        version: 2,
        ops: [
          {
            kind: 'drawPathInstances',
            geometry: {
              topologyId,
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

  it('ping-pongs compute bind groups across frames', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);

    const baseInput = {
      frame: { version: 2 as const, ops: [] },
      width: 128,
      height: 96,
      zoom: 1,
      panX: 0,
      panY: 0,
    };
    renderer.render({ ...baseInput, timeMs: 0 });
    renderer.render({ ...baseInput, timeMs: 16 });

    const computeBindGroupDescriptors = env.device.createBindGroup.mock.calls
      .map(([descriptor]: [unknown]) => descriptor as { entries: Array<{ binding: number }> })
      .filter((descriptor) => descriptor.entries.length === 3);
    expect(computeBindGroupDescriptors.length).toBe(2);

    const firstFrameBindGroup = env.computePass.setBindGroup.mock.calls[0]?.[1];
    const secondFrameBindGroup = env.computePass.setBindGroup.mock.calls[1]?.[1];
    expect(firstFrameBindGroup).toBe(computeBindGroupDescriptors[0]);
    expect(secondFrameBindGroup).toBe(computeBindGroupDescriptors[1]);
    expect(firstFrameBindGroup).not.toBe(secondFrameBindGroup);
  });

  it('allocates distinct compute src/dst buffers to prevent aliasing hazards', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    await createWebGPURenderer(env.canvas);

    const computeBindGroupDescriptors = env.device.createBindGroup.mock.calls
      .map(([descriptor]: [unknown]) => descriptor as { entries: Array<{ resource: { buffer: unknown } }> })
      .filter((descriptor) => descriptor.entries.length === 3);
    expect(computeBindGroupDescriptors.length).toBe(2);

    for (const descriptor of computeBindGroupDescriptors) {
      expect(descriptor.entries[0]?.resource.buffer).not.toBe(descriptor.entries[1]?.resource.buffer);
    }
  });

  it('uses indirect draw args buffer for path instance rendering', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = registerDynamicTopology({
      params: [],
      verbs: [PathVerb.MOVE, PathVerb.LINE, PathVerb.CLOSE],
      pointsPerVerb: [1, 1, 0],
      totalControlPoints: 2,
      closed: true,
    }, 'webgpu-indirect-draw-topology');

    renderer.render({
      frame: {
        version: 2,
        ops: [{
          kind: 'drawPathInstances',
          geometry: {
            topologyId,
            points: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
            pointsCount: 4,
            verbs: new Uint8Array([0, 1, 1, 1, 4]),
            flags: 1,
          },
          instances: {
            count: 1,
            position: new Float32Array([0.5, 0.5]),
            size: 0.25,
            rotation: new Float32Array([0]),
            scale2: new Float32Array([1, 1]),
          },
          style: {
            fillColor: new Uint8ClampedArray([255, 0, 0, 255]),
            fillRule: 'nonzero',
          },
        }],
      },
      width: 128,
      height: 96,
      zoom: 1,
      panX: 0,
      panY: 0,
      timeMs: 0,
    });

    expect(env.renderPass.drawIndexedIndirect).toHaveBeenCalledTimes(1);
    const cpuIndirectArgsWrite = env.device.queue.writeBuffer.mock.calls.find((args: unknown[]) => {
      const data = args[2];
      return data instanceof Uint32Array && data.length === 5;
    });
    expect(cpuIndirectArgsWrite).toBeUndefined();
    expect(env.device.createCommandEncoder).toHaveBeenCalledTimes(1);
    expect(env.device.createCommandEncoder.mock.results[0]?.value.beginComputePass).toHaveBeenCalledTimes(2);
  });

  it('renders cubic path geometry without rejecting supported curve verbs', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = registerDynamicTopology({
      params: [],
      verbs: [PathVerb.MOVE, PathVerb.CUBIC, PathVerb.CLOSE],
      pointsPerVerb: [1, 3, 0],
      totalControlPoints: 4,
      closed: true,
    }, 'webgpu-cubic-topology');

    renderer.render({
      frame: {
        version: 2,
        ops: [{
          kind: 'drawPathInstances',
          geometry: {
            topologyId,
            points: new Float32Array([
              0, 0,
              0.2, 1,
              0.8, 1,
              1, 0,
            ]),
            pointsCount: 4,
            verbs: new Uint8Array([PathVerb.MOVE, PathVerb.CUBIC, PathVerb.CLOSE]),
            flags: 1,
          },
          instances: {
            count: 1,
            position: new Float32Array([0.5, 0.5]),
            size: 0.2,
            rotation: new Float32Array([0]),
            scale2: new Float32Array([1, 1]),
          },
          style: {
            fillColor: new Uint8ClampedArray([0, 255, 0, 255]),
            fillRule: 'nonzero',
          },
        }],
      },
      width: 128,
      height: 96,
      zoom: 1,
      panX: 0,
      panY: 0,
      timeMs: 0,
    });

    expect(env.renderPass.drawIndexedIndirect).toHaveBeenCalledTimes(1);
  });

  it('renders quad path geometry without rejecting supported curve verbs', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = registerDynamicTopology({
      params: [],
      verbs: [PathVerb.MOVE, PathVerb.QUAD, PathVerb.CLOSE],
      pointsPerVerb: [1, 2, 0],
      totalControlPoints: 3,
      closed: true,
    }, 'webgpu-quad-topology');

    renderer.render({
      frame: {
        version: 2,
        ops: [{
          kind: 'drawPathInstances',
          geometry: {
            topologyId,
            points: new Float32Array([
              0, 0,
              0.5, 1,
              1, 0,
            ]),
            pointsCount: 3,
            verbs: new Uint8Array([PathVerb.MOVE, PathVerb.QUAD, PathVerb.CLOSE]),
            flags: 1,
          },
          instances: {
            count: 1,
            position: new Float32Array([0.5, 0.5]),
            size: 0.2,
            rotation: new Float32Array([0]),
            scale2: new Float32Array([1, 1]),
          },
          style: {
            fillColor: new Uint8ClampedArray([255, 0, 255, 255]),
            fillRule: 'nonzero',
          },
        }],
      },
      width: 128,
      height: 96,
      zoom: 1,
      panX: 0,
      panY: 0,
      timeMs: 0,
    });

    expect(env.renderPass.drawIndexedIndirect).toHaveBeenCalledTimes(1);
  });

  it('renders multi-contour path geometry as one draw op', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = registerDynamicTopology({
      params: [],
      verbs: [
        PathVerb.MOVE,
        PathVerb.LINE,
        PathVerb.LINE,
        PathVerb.CLOSE,
        PathVerb.MOVE,
        PathVerb.LINE,
        PathVerb.LINE,
        PathVerb.CLOSE,
      ],
      pointsPerVerb: [1, 1, 1, 0, 1, 1, 1, 0],
      totalControlPoints: 6,
      closed: true,
    }, 'webgpu-multicontour-topology');

    renderer.render({
      frame: {
        version: 2,
        ops: [{
          kind: 'drawPathInstances',
          geometry: {
            topologyId,
            points: new Float32Array([
              -1, -1,
              -0.2, -1,
              -0.6, -0.2,
              0.2, 0.2,
              1, 0.2,
              0.6, 1,
            ]),
            pointsCount: 6,
            verbs: new Uint8Array([
              PathVerb.MOVE,
              PathVerb.LINE,
              PathVerb.LINE,
              PathVerb.CLOSE,
              PathVerb.MOVE,
              PathVerb.LINE,
              PathVerb.LINE,
              PathVerb.CLOSE,
            ]),
            flags: 1,
          },
          instances: {
            count: 1,
            position: new Float32Array([0.5, 0.5]),
            size: 0.2,
            rotation: new Float32Array([0]),
            scale2: new Float32Array([1, 1]),
          },
          style: {
            fillColor: new Uint8ClampedArray([0, 0, 255, 255]),
            fillRule: 'nonzero',
          },
        }],
      },
      width: 128,
      height: 96,
      zoom: 1,
      panX: 0,
      panY: 0,
      timeMs: 0,
    });

    expect(env.renderPass.drawIndexedIndirect).toHaveBeenCalledTimes(1);
  });

  it('supports stroke-only path rendering without throwing', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = registerDynamicTopology({
      params: [],
      verbs: [PathVerb.MOVE, PathVerb.LINE, PathVerb.LINE, PathVerb.LINE, PathVerb.CLOSE],
      pointsPerVerb: [1, 1, 1, 1, 0],
      totalControlPoints: 4,
      closed: true,
    }, 'webgpu-stroke-only-topology');

    expect(() => renderer.render({
      frame: {
        version: 2,
        ops: [{
          kind: 'drawPathInstances',
          geometry: {
            topologyId,
            points: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
            pointsCount: 4,
            verbs: new Uint8Array([0, 1, 1, 1, 4]),
            flags: 1,
          },
          instances: {
            count: 1,
            position: new Float32Array([0.5, 0.5]),
            size: 0.25,
            rotation: new Float32Array([0]),
            scale2: new Float32Array([1, 1]),
          },
          style: {
            strokeColor: new Uint8ClampedArray([255, 255, 0, 255]),
            strokeWidth: 0.02,
            fillRule: 'nonzero',
          },
        }],
      },
      width: 128,
      height: 96,
      zoom: 1,
      panX: 0,
      panY: 0,
      timeMs: 0,
    })).not.toThrow();

    expect(env.renderPass.drawIndexedIndirect).toHaveBeenCalledTimes(1);
  });

  it('renders fill+stroke as two passes in one frame', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    env.device.queue.writeBuffer.mockClear();
    env.device.createBindGroup.mockClear();
    const topologyId = registerDynamicTopology({
      params: [],
      verbs: [PathVerb.MOVE, PathVerb.LINE, PathVerb.LINE, PathVerb.LINE, PathVerb.CLOSE],
      pointsPerVerb: [1, 1, 1, 1, 0],
      totalControlPoints: 4,
      closed: true,
    }, 'webgpu-fill-stroke-topology');

    renderer.render({
      frame: {
        version: 2,
        ops: [{
          kind: 'drawPathInstances',
          geometry: {
            topologyId,
            points: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
            pointsCount: 4,
            verbs: new Uint8Array([0, 1, 1, 1, 4]),
            flags: 1,
          },
          instances: {
            count: 1,
            position: new Float32Array([0.5, 0.5]),
            size: 0.25,
            rotation: new Float32Array([0]),
            scale2: new Float32Array([1, 1]),
          },
          style: {
            fillColor: new Uint8ClampedArray([255, 0, 0, 255]),
            strokeColor: new Uint8ClampedArray([0, 255, 255, 255]),
            strokeWidth: 0.02,
            fillRule: 'nonzero',
          },
        }],
      },
      width: 128,
      height: 96,
      zoom: 1,
      panX: 0,
      panY: 0,
      timeMs: 0,
    });

    expect(env.renderPass.drawIndexedIndirect).toHaveBeenCalledTimes(2);
    const indirectOffsets = env.renderPass.drawIndexedIndirect.mock.calls.map((args: unknown[]) => args[1]);
    expect(indirectOffsets).toEqual([0, WEBGPU_RENDER_CONTRACT.indirectArgsBytes]);
    const instanceUploads = env.device.queue.writeBuffer.mock.calls.filter((args: unknown[]) =>
      args[2] instanceof ArrayBuffer
    );
    expect(instanceUploads).toHaveLength(1);
    expect(instanceUploads[0]?.[4]).toBe(2 * WEBGPU_RENDER_CONTRACT.instanceBytes);

    const instanceBindCalls = env.renderPass.setBindGroup.mock.calls.filter(
      (args: unknown[]) => args[0] === WEBGPU_RENDER_CONTRACT.instanceBindGroup
    );
    expect(instanceBindCalls).toHaveLength(1);

    const drawPrepBindGroups = collectDrawPrepBindGroupCalls(env.device.createBindGroup);
    expect(drawPrepBindGroups).toHaveLength(1);
  });

  it('dispatches simulation workgroups from unique op instance count (not fill/stroke pass count)', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const instanceCount = 128;
    const topologyId = registerDynamicTopology({
      params: [],
      verbs: [PathVerb.MOVE, PathVerb.LINE, PathVerb.LINE, PathVerb.LINE, PathVerb.CLOSE],
      pointsPerVerb: [1, 1, 1, 1, 0],
      totalControlPoints: 4,
      closed: true,
    }, 'webgpu-simulation-count-topology');

    renderer.render({
      frame: {
        version: 2,
        ops: [{
          kind: 'drawPathInstances',
          geometry: {
            topologyId,
            points: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
            pointsCount: 4,
            verbs: new Uint8Array([0, 1, 1, 1, 4]),
            flags: 1,
          },
          instances: {
            count: instanceCount,
            position: new Float32Array(instanceCount * 2),
            size: 0.25,
            rotation: new Float32Array(instanceCount),
            scale2: new Float32Array(instanceCount * 2).fill(1),
          },
          style: {
            fillColor: new Uint8ClampedArray([255, 0, 0, 255]),
            strokeColor: new Uint8ClampedArray([0, 255, 255, 255]),
            strokeWidth: 0.02,
            fillRule: 'nonzero',
          },
        }],
      },
      width: 128,
      height: 96,
      zoom: 1,
      panX: 0,
      panY: 0,
      timeMs: 0,
    });

    // First compute dispatch is simulation pass (draw-prep dispatches are fixed-size 1).
    expect(env.computePass.dispatchWorkgroups.mock.calls[0]?.[0]).toBe(2);
  });

  it('reuses draw-prep bind group across frames when shader and indirect buffer are unchanged', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = registerDynamicTopology({
      params: [],
      verbs: [PathVerb.MOVE, PathVerb.LINE, PathVerb.LINE, PathVerb.LINE, PathVerb.CLOSE],
      pointsPerVerb: [1, 1, 1, 1, 0],
      totalControlPoints: 4,
      closed: true,
    }, 'webgpu-draw-prep-bindgroup-reuse-topology');

    const renderInput = {
      frame: {
        version: 2 as const,
        ops: [{
          kind: 'drawPathInstances' as const,
          geometry: {
            topologyId,
            points: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
            pointsCount: 4,
            verbs: new Uint8Array([0, 1, 1, 1, 4]),
            flags: 1,
          },
          instances: {
            count: 1,
            position: new Float32Array([0.5, 0.5]),
            size: 0.25,
            rotation: new Float32Array([0]),
            scale2: new Float32Array([1, 1]),
          },
          style: {
            fillColor: new Uint8ClampedArray([255, 0, 0, 255]),
            fillRule: 'nonzero' as const,
          },
        }],
      },
      width: 128,
      height: 96,
      zoom: 1,
      panX: 0,
      panY: 0,
    };

    env.device.createBindGroup.mockClear();
    renderer.render({ ...renderInput, timeMs: 0 });
    const firstFrameDrawPrepBindGroups = collectDrawPrepBindGroupCalls(env.device.createBindGroup);
    expect(firstFrameDrawPrepBindGroups).toHaveLength(1);

    env.device.createBindGroup.mockClear();
    renderer.render({ ...renderInput, timeMs: 16 });
    const secondFrameDrawPrepBindGroups = collectDrawPrepBindGroupCalls(env.device.createBindGroup);
    expect(secondFrameDrawPrepBindGroups).toHaveLength(0);
  });

  it('supports per-instance stroke widths for stroke rendering', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = registerDynamicTopology({
      params: [],
      verbs: [PathVerb.MOVE, PathVerb.LINE, PathVerb.LINE, PathVerb.LINE, PathVerb.CLOSE],
      pointsPerVerb: [1, 1, 1, 1, 0],
      totalControlPoints: 4,
      closed: true,
    }, 'webgpu-stroke-width-array-topology');

    renderer.render({
      frame: {
        version: 2,
        ops: [{
          kind: 'drawPathInstances',
          geometry: {
            topologyId,
            points: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
            pointsCount: 4,
            verbs: new Uint8Array([0, 1, 1, 1, 4]),
            flags: 1,
          },
          instances: {
            count: 2,
            position: new Float32Array([0.4, 0.5, 0.6, 0.5]),
            size: new Float32Array([0.2, 0.2]),
            rotation: new Float32Array([0, 0]),
            scale2: new Float32Array([1, 1, 1, 1]),
          },
          style: {
            strokeColor: new Uint8ClampedArray([255, 255, 255, 255]),
            strokeWidth: new Float32Array([0.01, 0.02]),
            fillRule: 'nonzero',
          },
        }],
      },
      width: 128,
      height: 96,
      zoom: 1,
      panX: 0,
      panY: 0,
      timeMs: 0,
    });

    expect(env.renderPass.drawIndexedIndirect).toHaveBeenCalledTimes(1);
  });

  it('rebuilds draw-prep pipeline from compiler-provided WGSL when supplied', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const customDrawPrepWgsl = [
      'struct DrawPrepParams {',
      '  v0: vec4<u32>;',
      '  v1: vec4<u32>;',
      '};',
      '@group(0) @binding(0) var<storage, read_write> indirectArgs: array<u32>;',
      '@group(0) @binding(1) var<uniform> drawPrepParams: DrawPrepParams;',
      '@compute @workgroup_size(1)',
      'fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {',
      '  if (gid.x > 0u) { return; }',
      '  let base = drawPrepParams.v1.y * 5u;',
      '  indirectArgs[base + 0u] = drawPrepParams.v0.x;',
      '  indirectArgs[base + 1u] = drawPrepParams.v0.y;',
      '  indirectArgs[base + 2u] = drawPrepParams.v0.z;',
      '  indirectArgs[base + 3u] = drawPrepParams.v0.w;',
      '  indirectArgs[base + 4u] = drawPrepParams.v1.x;',
      '}',
    ].join('\n');

    renderer.render({
      frame: { version: 2, ops: [] },
      width: 128,
      height: 96,
      zoom: 1,
      panX: 0,
      panY: 0,
      timeMs: 0,
      drawPrepShaderWgsl: customDrawPrepWgsl,
    });

    const usedCustomShader = env.device.createShaderModule.mock.calls.some((call: unknown[]) => {
      const descriptor = call[0] as { code?: string };
      return descriptor.code === customDrawPrepWgsl;
    });
    expect(usedCustomShader).toBe(true);
  });

  it('fails render when an op topology is missing from the topology bank', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);

    expect(() => renderer.render({
      frame: {
        version: 2,
        ops: [{
          kind: 'drawPathInstances',
          geometry: {
            topologyId: 999_999,
            points: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
            pointsCount: 4,
            verbs: new Uint8Array([0, 1, 1, 1, 4]),
            flags: 1,
          },
          instances: {
            count: 1,
            position: new Float32Array([0.5, 0.5]),
            size: 0.25,
            rotation: new Float32Array([0]),
            scale2: new Float32Array([1, 1]),
          },
          style: {
            fillColor: new Uint8ClampedArray([255, 0, 0, 255]),
            fillRule: 'nonzero',
          },
        }],
      },
      width: 128,
      height: 96,
      zoom: 1,
      panX: 0,
      panY: 0,
      timeMs: 0,
    })).toThrow('missing from topology bank');
  });
});
