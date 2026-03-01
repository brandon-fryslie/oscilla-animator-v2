import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebGPURenderer } from '../WebGPURenderer';
import { DRAW_PREP_COMPUTE_WGSL, PATH_RENDER_WGSL, WEBGPU_RENDER_CONTRACT } from '../shaders';
import { registerDynamicTopology } from '../../../shapes/registry';
import { PathVerb } from '../../../shapes/types';
import type { DrawPathInstancesOp } from '../../types';

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
    copyBufferToBuffer: vi.fn((source: any, sourceOffset: number, destination: any, destinationOffset: number, size: number) => {
      const src = source?.__storage as Uint8Array | undefined;
      const dst = destination?.__storage as Uint8Array | undefined;
      if (!src || !dst) return;
      dst.set(src.subarray(sourceOffset, sourceOffset + size), destinationOffset);
    }),
    finish: vi.fn(() => ({ label: 'cmd' })),
  };

  const device = {
    queue: {
      writeBuffer: vi.fn((buffer: any, bufferOffset: number, data: any, dataOffset?: number, size?: number) => {
        const dst = buffer?.__storage as Uint8Array | undefined;
        if (!dst) return;
        const byteData =
          data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : ArrayBuffer.isView(data)
              ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
              : null;
        if (!byteData) return;
        const srcStart = dataOffset ?? 0;
        const srcLength = size ?? (byteData.byteLength - srcStart);
        dst.set(byteData.subarray(srcStart, srcStart + srcLength), bufferOffset);
      }),
      submit: vi.fn(),
      onSubmittedWorkDone: vi.fn(async () => {}),
    },
    lost: new Promise(() => {}),
    addEventListener: vi.fn(),
    createShaderModule: vi.fn(() => ({})),
    createComputePipeline: vi.fn(() => ({
      getBindGroupLayout: vi.fn(() => ({ label: 'compute-layout' })),
    })),
    createComputePipelineAsync: vi.fn(async () => ({
      getBindGroupLayout: vi.fn(() => ({ label: 'compute-layout' })),
    })),
    createRenderPipeline: vi.fn(() => ({
      getBindGroupLayout: vi.fn(() => ({ label: 'render-layout' })),
    })),
    createRenderPipelineAsync: vi.fn(async () => ({
      getBindGroupLayout: vi.fn(() => ({ label: 'render-layout' })),
    })),
    createBuffer: vi.fn((descriptor: { size: number }) => {
      const storage = new Uint8Array(descriptor.size);
      return {
        descriptor,
        __storage: storage,
        destroy: vi.fn(),
        mapAsync: vi.fn(async () => {}),
        getMappedRange: vi.fn(() => storage.buffer),
        unmap: vi.fn(),
      };
    }),
    createTexture: vi.fn((descriptor: unknown) => ({
      descriptor,
      createView: vi.fn(() => ({ label: 'msaa-view' })),
      destroy: vi.fn(),
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

// ─── Test helpers ────────────────────────────────────────────────────────────

/** Register a simple closed 4-point rectangle topology and return its ID. */
function makeSimpleTopology(name: string): number {
  return registerDynamicTopology(
    {
      params: [],
      verbs: [PathVerb.MOVE, PathVerb.LINE, PathVerb.LINE, PathVerb.LINE, PathVerb.CLOSE],
      pointsPerVerb: [1, 1, 1, 1, 0],
      totalControlPoints: 4,
      closed: true,
    },
    name,
  );
}

/** Build a minimal drawPathInstances op. Defaults to one instance with a fill. */
function makeDrawOp(
  topologyId: number,
  opts: {
    count?: number;
    size?: number | Float32Array;
    position?: Float32Array;
    rotation?: Float32Array;
    scale2?: Float32Array;
    style?: DrawPathInstancesOp['style'];
    geometry?: Omit<DrawPathInstancesOp['geometry'], 'topologyId'>;
  } = {},
): DrawPathInstancesOp {
  const count = opts.count ?? 1;
  return {
    kind: 'drawPathInstances',
    geometry:
      opts.geometry != null
        ? { topologyId, ...opts.geometry }
        : {
            topologyId,
            points: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
            pointsCount: 4,
            verbs: new Uint8Array([PathVerb.MOVE, PathVerb.LINE, PathVerb.LINE, PathVerb.LINE, PathVerb.CLOSE]),
            flags: 1,
          },
    instances: {
      count,
      position: opts.position ?? new Float32Array(count * 2).fill(0.5),
      size: opts.size ?? 0.25,
      rotation: opts.rotation ?? new Float32Array(count),
      scale2: opts.scale2 ?? new Float32Array(count * 2).fill(1),
    },
    style: opts.style ?? {
      fillColor: new Uint8ClampedArray([255, 0, 0, 255]),
      fillRule: 'nonzero',
    },
  };
}

/** Build a minimal render input. Defaults to a 128×96 viewport at time 0. */
function makeRenderInput(
  ops: DrawPathInstancesOp[],
  overrides: Record<string, unknown> = {},
) {
  const shapeBank = (() => {
    const uniqueTopology = new Map<number, DrawPathInstancesOp['geometry']>();
    for (const op of ops) {
      if (!uniqueTopology.has(op.geometry.topologyId)) {
        uniqueTopology.set(op.geometry.topologyId, op.geometry);
      }
    }
    const words = uniqueTopology.size * 4;
    const capacity = Math.max(1, words);
    const data = new Uint32Array(capacity);
    const topologyIdByHandle = new Uint32Array(capacity);
    let handle = 0;
    for (const [topologyId, geometry] of uniqueTopology.entries()) {
      data[handle + 0] = geometry.pointsCount >>> 0;
      data[handle + 1] = 0;
      data[handle + 2] = geometry.pointsCount >>> 0;
      data[handle + 3] = (geometry.flags ?? 0) >>> 0;
      topologyIdByHandle[handle] = topologyId >>> 0;
      handle += 4;
    }
    return {
      data,
      volatilePtr: words,
      staticBoundary: 0,
      topologyIdByHandle,
    };
  })();
  return {
    frame: { version: 2 as const, ops },
    shapeBank,
    width: 128,
    height: 96,
    zoom: 1,
    panX: 0,
    panY: 0,
    timeMs: 0,
    ...overrides,
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
    expect(bufferSizes).toContain(
      WEBGPU_RENDER_CONTRACT.inputHeaderBytes + WEBGPU_RENDER_CONTRACT.simulationCapacity * 16
    );
    expect(bufferSizes).toContain(Uint32Array.BYTES_PER_ELEMENT);
    const computeStateBuffers = env.device.createBuffer.mock.calls
      .map(([descriptor]: [unknown]) => descriptor as { size: number; usage: number })
      .filter((descriptor) =>
        descriptor.size === WEBGPU_RENDER_CONTRACT.inputHeaderBytes + WEBGPU_RENDER_CONTRACT.simulationCapacity * 16
      );
    expect(computeStateBuffers).toHaveLength(2);
    for (const descriptor of computeStateBuffers) {
      expect((descriptor.usage & 0x0080) !== 0).toBe(true); // STORAGE
      expect((descriptor.usage & 0x0008) !== 0).toBe(true); // COPY_DST
      expect((descriptor.usage & 0x0004) !== 0).toBe(true); // COPY_SRC
    }

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

  it('uploads shape-bank u32 data from the render input source', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);

    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = makeSimpleTopology('webgpu-shape-bank-upload-test');
    renderer.render(makeRenderInput([makeDrawOp(topologyId)]));

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

    renderer.render(makeRenderInput([]));

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

    renderer.render(makeRenderInput([
      makeDrawOp(topologyId, {
        size: 1,
        geometry: {
          points: new Float32Array([0, 0, 1, 0, 0, 1]),
          pointsCount: 3,
          verbs: new Uint8Array([PathVerb.MOVE, PathVerb.LINE, PathVerb.LINE, PathVerb.CLOSE]),
        },
      }),
    ]));

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
      renderer.render(makeRenderInput([], { width: Number.NaN }))
    ).toThrow('width must be a finite non-negative number');
  });

  it('selects compute bind groups from renderer frame parity', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);

    renderer.render(makeRenderInput([], { timeMs: 0 }));
    renderer.render(makeRenderInput([], { timeMs: 16 }));
    renderer.render(makeRenderInput([], { timeMs: 32 }));

    const computeBindGroupDescriptors = env.device.createBindGroup.mock.calls
      .map(([descriptor]: [unknown]) => descriptor as { entries: Array<{ binding: number }> })
      .filter((descriptor) => descriptor.entries.length === 3);
    expect(computeBindGroupDescriptors.length).toBe(2);

    const firstFrameBindGroup = env.computePass.setBindGroup.mock.calls[0]?.[1];
    const secondFrameBindGroup = env.computePass.setBindGroup.mock.calls[1]?.[1];
    const thirdFrameBindGroup = env.computePass.setBindGroup.mock.calls[2]?.[1];
    expect(firstFrameBindGroup).toBe(computeBindGroupDescriptors[0]);
    expect(secondFrameBindGroup).toBe(computeBindGroupDescriptors[1]);
    expect(thirdFrameBindGroup).toBe(computeBindGroupDescriptors[0]);
    expect(firstFrameBindGroup).not.toBe(secondFrameBindGroup);
  });

  it('marshals frame input values and frameCount into the compute read-buffer header before dispatch', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const capturedInputHeaderWrites: Array<{ buffer: unknown; bytes: Uint8Array }> = [];
    env.device.queue.writeBuffer.mockImplementation((buffer: unknown, _offset: number, data: unknown, _dataOffset?: number, size?: number) => {
      if (data instanceof Uint8Array && size === WEBGPU_RENDER_CONTRACT.inputHeaderBytes) {
        capturedInputHeaderWrites.push({
          buffer,
          bytes: data.slice(),
        });
      }
    });

    renderer.render(makeRenderInput([], {
      timeMs: 1000,
      inputMouseX: 0.75,
      inputMouseY: 0.25,
      inputMouseButtons: 5,
      inputAudioLow: 0.2,
      inputAudioMid: 0.4,
      inputAudioHigh: 0.8,
      inputGaugeActive: 1,
    }));
    renderer.render(makeRenderInput([], {
      timeMs: 1016,
      inputMouseX: 0.75,
      inputMouseY: 0.25,
      inputMouseButtons: 5,
      inputAudioLow: 0.2,
      inputAudioMid: 0.4,
      inputAudioHigh: 0.8,
      inputGaugeActive: 1,
    }));

    const computeBindGroupDescriptors = env.device.createBindGroup.mock.calls
      .map(([descriptor]: [unknown]) => descriptor as { entries: Array<{ resource: { buffer: unknown } }> })
      .filter((descriptor) => descriptor.entries.length === 3);
    const firstFrameReadBuffer = computeBindGroupDescriptors[0]?.entries[0]?.resource.buffer;
    const secondFrameReadBuffer = computeBindGroupDescriptors[1]?.entries[0]?.resource.buffer;
    expect(firstFrameReadBuffer).toBeDefined();
    expect(secondFrameReadBuffer).toBeDefined();

    expect(capturedInputHeaderWrites).toHaveLength(2);

    const firstInputHeaderWrite = capturedInputHeaderWrites.find((write) => write.buffer === firstFrameReadBuffer);
    const secondInputHeaderWrite = capturedInputHeaderWrites.find((write) => write.buffer === secondFrameReadBuffer);
    expect(firstInputHeaderWrite).toBeDefined();
    expect(secondInputHeaderWrite).toBeDefined();

    const firstFrameHeaderBytes = firstInputHeaderWrite!.bytes;
    const firstFrameView = new DataView(
      firstFrameHeaderBytes.buffer,
      firstFrameHeaderBytes.byteOffset,
      firstFrameHeaderBytes.byteLength,
    );
    expect(firstFrameView.getFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderTimeOffsetBytes, true)).toBeCloseTo(1);
    expect(firstFrameView.getFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderDeltaTimeOffsetBytes, true)).toBeCloseTo(0);
    expect(firstFrameView.getFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderFrameCountOffsetBytes, true)).toBeCloseTo(0);
    expect(firstFrameView.getFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderResolutionXOffsetBytes, true)).toBeCloseTo(128);
    expect(firstFrameView.getFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderResolutionYOffsetBytes, true)).toBeCloseTo(96);
    expect(firstFrameView.getFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderMouseXOffsetBytes, true)).toBeCloseTo(2 / 3);
    expect(firstFrameView.getFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderMouseYOffsetBytes, true)).toBeCloseTo(0.5);
    expect(firstFrameView.getUint32(WEBGPU_RENDER_CONTRACT.inputHeaderMouseButtonsOffsetBytes, true)).toBe(5);
    expect(firstFrameView.getFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderAudioLowOffsetBytes, true)).toBeCloseTo(0.2);
    expect(firstFrameView.getFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderAudioMidOffsetBytes, true)).toBeCloseTo(0.4);
    expect(firstFrameView.getFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderAudioHighOffsetBytes, true)).toBeCloseTo(0.8);
    expect(firstFrameView.getFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderGaugeActiveOffsetBytes, true)).toBeCloseTo(1);

    const secondFrameHeaderBytes = secondInputHeaderWrite!.bytes;
    const secondFrameView = new DataView(
      secondFrameHeaderBytes.buffer,
      secondFrameHeaderBytes.byteOffset,
      secondFrameHeaderBytes.byteLength,
    );
    expect(secondFrameView.getFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderTimeOffsetBytes, true)).toBeCloseTo(1.016);
    expect(secondFrameView.getFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderDeltaTimeOffsetBytes, true)).toBeCloseTo(0.016);
    expect(secondFrameView.getFloat32(WEBGPU_RENDER_CONTRACT.inputHeaderFrameCountOffsetBytes, true)).toBeCloseTo(1);
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
    const topologyId = makeSimpleTopology('webgpu-indirect-draw-topology');

    renderer.render(makeRenderInput([makeDrawOp(topologyId)]));

    expect(env.renderPass.drawIndexedIndirect).toHaveBeenCalledTimes(1);
    const cpuIndirectArgsWrite = env.device.queue.writeBuffer.mock.calls.find((args: unknown[]) => {
      const data = args[2];
      return data instanceof Uint32Array && data.length === 5;
    });
    expect(cpuIndirectArgsWrite).toBeUndefined();
    expect(env.device.createCommandEncoder).toHaveBeenCalledTimes(1);
    expect(env.device.createCommandEncoder.mock.results[0]?.value.beginComputePass).toHaveBeenCalledTimes(2);
  });

  it('does not issue GPU copyBufferToBuffer calls during frame rendering', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = makeSimpleTopology('webgpu-no-buffer-copy-topology');

    renderer.render(makeRenderInput([makeDrawOp(topologyId)]));

    const encoder = env.device.createCommandEncoder.mock.results[0]?.value as { copyBufferToBuffer: ReturnType<typeof vi.fn> };
    expect(encoder.copyBufferToBuffer).not.toHaveBeenCalled();
  });

  it('provides debug indirect-args readback via copy + mapAsync inspector path', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = makeSimpleTopology('webgpu-indirect-readback-topology');

    renderer.render(makeRenderInput([makeDrawOp(topologyId)]));
    const snapshot = await renderer.readIndirectArgsDebugView(1);

    expect(snapshot.recordCount).toBe(1);
    expect(snapshot.records).toHaveLength(1);
    const lastEncoder = env.device.createCommandEncoder.mock.results.at(-1)?.value as {
      copyBufferToBuffer: ReturnType<typeof vi.fn>;
    };
    expect(lastEncoder.copyBufferToBuffer).toHaveBeenCalled();
    const readbackBuffers = env.device.createBuffer.mock.calls
      .map(([descriptor]: [unknown]) => descriptor as { usage: number })
      .filter((descriptor) => (descriptor.usage & 0x0001) !== 0 && (descriptor.usage & 0x0008) !== 0);
    expect(readbackBuffers.length).toBeGreaterThan(0);
  });

  it('creates indirect-args buffers with COPY_SRC usage for debug readback compatibility', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = makeSimpleTopology('webgpu-indirect-copy-src-usage-topology');

    renderer.render(
      makeRenderInput([makeDrawOp(topologyId), makeDrawOp(topologyId, { style: { strokeColor: new Uint8ClampedArray([255, 255, 255, 255]), strokeWidth: 0.01 } })]),
    );

    const indirectBuffers = env.device.createBuffer.mock.calls
      .map(([descriptor]: [unknown]) => descriptor as { usage: number })
      .filter((descriptor) => (descriptor.usage & 0x0100) !== 0);
    expect(indirectBuffers.length).toBeGreaterThan(0);
    for (const descriptor of indirectBuffers) {
      expect((descriptor.usage & 0x0004) !== 0).toBe(true);
    }
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

    renderer.render(makeRenderInput([
      makeDrawOp(topologyId, {
        size: 0.2,
        geometry: {
          points: new Float32Array([0, 0, 0.2, 1, 0.8, 1, 1, 0]),
          pointsCount: 4,
          verbs: new Uint8Array([PathVerb.MOVE, PathVerb.CUBIC, PathVerb.CLOSE]),
          flags: 1,
        },
      }),
    ]));

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

    renderer.render(makeRenderInput([
      makeDrawOp(topologyId, {
        size: 0.2,
        geometry: {
          points: new Float32Array([0, 0, 0.5, 1, 1, 0]),
          pointsCount: 3,
          verbs: new Uint8Array([PathVerb.MOVE, PathVerb.QUAD, PathVerb.CLOSE]),
          flags: 1,
        },
      }),
    ]));

    expect(env.renderPass.drawIndexedIndirect).toHaveBeenCalledTimes(1);
  });

  it('renders multi-contour path geometry as one draw op', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = registerDynamicTopology({
      params: [],
      verbs: [
        PathVerb.MOVE, PathVerb.LINE, PathVerb.LINE, PathVerb.CLOSE,
        PathVerb.MOVE, PathVerb.LINE, PathVerb.LINE, PathVerb.CLOSE,
      ],
      pointsPerVerb: [1, 1, 1, 0, 1, 1, 1, 0],
      totalControlPoints: 6,
      closed: true,
    }, 'webgpu-multicontour-topology');

    renderer.render(makeRenderInput([
      makeDrawOp(topologyId, {
        size: 0.2,
        geometry: {
          points: new Float32Array([-1, -1, -0.2, -1, -0.6, -0.2, 0.2, 0.2, 1, 0.2, 0.6, 1]),
          pointsCount: 6,
          verbs: new Uint8Array([
            PathVerb.MOVE, PathVerb.LINE, PathVerb.LINE, PathVerb.CLOSE,
            PathVerb.MOVE, PathVerb.LINE, PathVerb.LINE, PathVerb.CLOSE,
          ]),
          flags: 1,
        },
      }),
    ]));

    expect(env.renderPass.drawIndexedIndirect).toHaveBeenCalledTimes(1);
  });

  it('supports stroke-only path rendering without throwing', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = makeSimpleTopology('webgpu-stroke-only-topology');

    expect(() => renderer.render(makeRenderInput([
      makeDrawOp(topologyId, {
        style: {
          strokeColor: new Uint8ClampedArray([255, 255, 0, 255]),
          strokeWidth: 0.02,
          fillRule: 'nonzero',
        },
      }),
    ]))).not.toThrow();

    expect(env.renderPass.drawIndexedIndirect).toHaveBeenCalledTimes(1);
  });

  it('renders fill+stroke as two passes in one frame', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    env.device.queue.writeBuffer.mockClear();
    env.device.createBindGroup.mockClear();
    const topologyId = makeSimpleTopology('webgpu-fill-stroke-topology');

    renderer.render(makeRenderInput([
      makeDrawOp(topologyId, {
        style: {
          fillColor: new Uint8ClampedArray([255, 0, 0, 255]),
          strokeColor: new Uint8ClampedArray([0, 255, 255, 255]),
          strokeWidth: 0.02,
          fillRule: 'nonzero',
        },
      }),
    ]));

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

  it('dispatches simulation workgroups from canonical capacity and passes activeCount in params', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const instanceCount = 128;
    const topologyId = makeSimpleTopology('webgpu-simulation-count-topology');

    renderer.render(makeRenderInput([
      makeDrawOp(topologyId, {
        count: instanceCount,
        style: {
          fillColor: new Uint8ClampedArray([255, 0, 0, 255]),
          strokeColor: new Uint8ClampedArray([0, 255, 255, 255]),
          strokeWidth: 0.02,
          fillRule: 'nonzero',
        },
      }),
    ]));

    // First compute dispatch is simulation pass (draw-prep dispatches are fixed-size 1).
    expect(env.computePass.dispatchWorkgroups.mock.calls[0]?.[0]).toBe(
      WEBGPU_RENDER_CONTRACT.simulationCapacity / WEBGPU_RENDER_CONTRACT.computeWorkgroupSize
    );
    const computeParamsWrite = env.device.queue.writeBuffer.mock.calls.find((args: unknown[]) =>
      args[2] instanceof Float32Array &&
      (args[2] as Float32Array).length === WEBGPU_RENDER_CONTRACT.computeParamsFloats
    );
    expect(computeParamsWrite).toBeDefined();
    const computeParams = computeParamsWrite?.[2] as Float32Array;
    expect(computeParams[0]).toBe(instanceCount);
    expect(computeParams[3]).toBe(WEBGPU_RENDER_CONTRACT.simulationCapacity);
  });

  it('uses static draw-prep sink metadata to override per-op instance count', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = makeSimpleTopology('webgpu-draw-prep-static-sink-count-topology');

    renderer.render(makeRenderInput([
      makeDrawOp(topologyId, { count: 9 }),
    ], {
      drawPrepSinks: [
        {
          sinkIndex: 0,
          renderStepIndex: 0,
          instanceId: 'inst-0',
          indirectRecordIndex: 0,
          instanceCountMode: 'static',
          staticInstanceCount: 4,
        },
      ],
    }));

    const drawPrepParamsWrite = env.device.queue.writeBuffer.mock.calls.find((args: unknown[]) =>
      args[2] instanceof Uint32Array
      && (args[2] as Uint32Array).length === WEBGPU_RENDER_CONTRACT.drawPrepParamsU32
      && ((args[2] as Uint32Array)[5] === 0)
    );
    expect(drawPrepParamsWrite).toBeDefined();
    const drawPrepParams = drawPrepParamsWrite?.[2] as Uint32Array;
    expect(drawPrepParams[1]).toBe(4);
  });

  it('keeps sink-index alignment when an earlier draw op produces zero prepared records', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyA = makeSimpleTopology('webgpu-draw-prep-zero-count-topology-a');
    const topologyB = makeSimpleTopology('webgpu-draw-prep-zero-count-topology-b');
    const capturedDrawPrepWrites: number[][] = [];
    const originalWriteBuffer = env.device.queue.writeBuffer.getMockImplementation();
    env.device.queue.writeBuffer.mockImplementation((...args: unknown[]) => {
      const data = args[2];
      if (data instanceof Uint32Array && data.length === WEBGPU_RENDER_CONTRACT.drawPrepParamsU32) {
        capturedDrawPrepWrites.push(Array.from(data));
      }
      return (originalWriteBuffer as ((...params: any[]) => unknown) | undefined)?.(...(args as any[]));
    });

    renderer.render(makeRenderInput([
      makeDrawOp(topologyA, { count: 0 }),
      makeDrawOp(topologyB, { count: 9 }),
    ], {
      drawPrepSinks: [
        {
          sinkIndex: 0,
          renderStepIndex: 0,
          instanceId: 'inst-0',
          indirectRecordIndex: 0,
          instanceCountMode: 'dynamic',
        },
        {
          sinkIndex: 1,
          renderStepIndex: 1,
          instanceId: 'inst-1',
          indirectRecordIndex: 1,
          instanceCountMode: 'static',
          staticInstanceCount: 4,
        },
      ],
    }));

    const record0Write = capturedDrawPrepWrites.find((params) => (params[5] ?? -1) === 0);
    expect(record0Write).toBeDefined();
    expect(record0Write?.[1]).toBe(4);
  });

  it('applies static draw-prep sink override to both fill and stroke records of one logical sink', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = makeSimpleTopology('webgpu-draw-prep-static-sink-fill-stroke-topology');
    const capturedDrawPrepWrites: number[][] = [];
    const originalWriteBuffer = env.device.queue.writeBuffer.getMockImplementation();
    env.device.queue.writeBuffer.mockImplementation((...args: unknown[]) => {
      const data = args[2];
      if (data instanceof Uint32Array && data.length === WEBGPU_RENDER_CONTRACT.drawPrepParamsU32) {
        capturedDrawPrepWrites.push(Array.from(data));
      }
      return (originalWriteBuffer as ((...params: any[]) => unknown) | undefined)?.(...(args as any[]));
    });

    renderer.render(makeRenderInput([
      makeDrawOp(topologyId, {
        count: 9,
        style: {
          fillColor: new Uint8ClampedArray([255, 0, 0, 255]),
          strokeColor: new Uint8ClampedArray([0, 255, 255, 255]),
          strokeWidth: 0.02,
          fillRule: 'nonzero',
        },
      }),
    ], {
      drawPrepSinks: [
        {
          sinkIndex: 0,
          renderStepIndex: 0,
          instanceId: 'inst-0',
          indirectRecordIndex: 0,
          instanceCountMode: 'static',
          staticInstanceCount: 4,
        },
      ],
    }));

    expect(capturedDrawPrepWrites.length).toBeGreaterThanOrEqual(2);
    const perRecordCounts = capturedDrawPrepWrites
      .map((params) => [params[5] ?? -1, params[1] ?? -1] as const)
      .filter(([recordIndex]) => recordIndex <= 1)
      .sort((a, b) => a[0] - b[0]);
    expect(perRecordCounts.slice(0, 2)).toEqual([
      [0, 4],
      [1, 4],
    ]);
  });

  it('fails fast when static draw-prep sink metadata repeats sinkIndex', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = makeSimpleTopology('webgpu-draw-prep-duplicate-sink-index-topology');

    expect(() => renderer.render(makeRenderInput([
      makeDrawOp(topologyId, { count: 9 }),
    ], {
      drawPrepSinks: [
        {
          sinkIndex: 0,
          renderStepIndex: 0,
          instanceId: 'inst-0',
          indirectRecordIndex: 0,
          instanceCountMode: 'static',
          staticInstanceCount: 4,
        },
        {
          sinkIndex: 0,
          renderStepIndex: 1,
          instanceId: 'inst-1',
          indirectRecordIndex: 1,
          instanceCountMode: 'static',
          staticInstanceCount: 5,
        },
      ],
    }))).toThrow('duplicate static draw-prep sinkIndex');
  });

  it('grows compute arena geometrically and dispatches migration when simulation count exceeds current capacity', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const overflowCount = WEBGPU_RENDER_CONTRACT.simulationCapacity + 1;
    const topologyId = registerDynamicTopology({
      params: [],
      verbs: [PathVerb.MOVE, PathVerb.LINE, PathVerb.LINE, PathVerb.LINE, PathVerb.CLOSE],
      pointsPerVerb: [1, 1, 1, 1, 0],
      totalControlPoints: 4,
      closed: true,
    }, 'webgpu-simulation-capacity-overflow-topology');

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
            count: overflowCount,
            position: new Float32Array(overflowCount * 2),
            size: 0.25,
            rotation: new Float32Array(overflowCount),
            scale2: new Float32Array(overflowCount * 2).fill(1),
          },
          style: {
            fillColor: new Uint8ClampedArray([255, 0, 0, 255]),
            fillRule: 'nonzero',
          },
        }],
      },
      shapeBank: makeRenderInput([makeDrawOp(topologyId)]).shapeBank,
      width: 128,
      height: 96,
      zoom: 1,
      panX: 0,
      panY: 0,
      timeMs: 0,
    });

    const expectedGrownCapacity = WEBGPU_RENDER_CONTRACT.simulationCapacity * 2;
    const expectedGrownStateBytes = WEBGPU_RENDER_CONTRACT.inputHeaderBytes + expectedGrownCapacity * 16;
    const grownStateBuffers = env.device.createBuffer.mock.calls
      .map(([descriptor]: [unknown]) => descriptor as { size: number; usage: number })
      .filter((descriptor) => descriptor.size === expectedGrownStateBytes);
    expect(grownStateBuffers).toHaveLength(2);
    const zeroInitWrites = env.device.queue.writeBuffer.mock.calls.filter((args: unknown[]) => {
      const data = args[2];
      return data instanceof Uint8Array && data.length === expectedGrownStateBytes;
    });
    expect(zeroInitWrites).toHaveLength(2);
    expect(env.computePass.dispatchWorkgroups.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('reuses draw-prep bind group across frames when shader and indirect buffer are unchanged', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = makeSimpleTopology('webgpu-draw-prep-bindgroup-reuse-topology');
    const op = makeDrawOp(topologyId);

    env.device.createBindGroup.mockClear();
    renderer.render(makeRenderInput([op], { timeMs: 0 }));
    const firstFrameDrawPrepBindGroups = collectDrawPrepBindGroupCalls(env.device.createBindGroup);
    expect(firstFrameDrawPrepBindGroups).toHaveLength(1);

    env.device.createBindGroup.mockClear();
    renderer.render(makeRenderInput([op], { timeMs: 16 }));
    const secondFrameDrawPrepBindGroups = collectDrawPrepBindGroupCalls(env.device.createBindGroup);
    expect(secondFrameDrawPrepBindGroups).toHaveLength(0);
  });

  it('uploads shape-bank data on render to keep GPU source synchronized with runtime shape bank', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = makeSimpleTopology('webgpu-shape-bank-sync-topology');

    env.device.queue.writeBuffer.mockClear();
    renderer.render(makeRenderInput([makeDrawOp(topologyId)], { timeMs: 0 }));
    renderer.render(makeRenderInput([makeDrawOp(topologyId)], { timeMs: 16 }));
    const shapeBankWrites = env.device.queue.writeBuffer.mock.calls.filter((args: unknown[]) => args[2] instanceof Uint32Array);
    expect(shapeBankWrites.length).toBeGreaterThanOrEqual(2);
  });

  it('supports per-instance stroke widths for stroke rendering', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = makeSimpleTopology('webgpu-stroke-width-array-topology');

    renderer.render(makeRenderInput([
      makeDrawOp(topologyId, {
        count: 2,
        position: new Float32Array([0.4, 0.5, 0.6, 0.5]),
        size: new Float32Array([0.2, 0.2]),
        style: {
          strokeColor: new Uint8ClampedArray([255, 255, 255, 255]),
          strokeWidth: new Float32Array([0.01, 0.02]),
          fillRule: 'nonzero',
        },
      }),
    ]));

    expect(env.renderPass.drawIndexedIndirect).toHaveBeenCalledTimes(1);
  });

  it('rejects non-finite per-instance transform payloads', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = makeSimpleTopology('webgpu-non-finite-transform-topology');

    expect(() =>
      renderer.render(makeRenderInput([
        makeDrawOp(topologyId, { position: new Float32Array([Number.NaN, 0.5]) }),
      ]))
    ).toThrow(/non-finite transform values/i);
  });

  it('rejects non-finite numeric size payloads', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = makeSimpleTopology('webgpu-non-finite-size-topology');

    expect(() =>
      renderer.render(makeRenderInput([
        makeDrawOp(topologyId, { size: Number.POSITIVE_INFINITY }),
      ]))
    ).toThrow(/size must be finite/i);
  });

  it('uses the canonical built-in draw-prep shader module', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    renderer.render(makeRenderInput([]));

    const usedCanonicalDrawPrepShader = env.device.createShaderModule.mock.calls.some((call: unknown[]) => {
      const descriptor = call[0] as { code?: string };
      return descriptor.code === DRAW_PREP_COMPUTE_WGSL;
    });
    expect(usedCanonicalDrawPrepShader).toBe(true);
  });

  it('fails render when an op topology is missing from the shape bank', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);

    expect(() =>
      renderer.render(makeRenderInput([makeDrawOp(999_999)], {
        shapeBank: {
          data: new Uint32Array(1),
          volatilePtr: 0,
          staticBoundary: 0,
          topologyIdByHandle: new Uint32Array(1),
        },
      }))
    ).toThrow('missing from shape bank');
  });

  it('rejects legacy draw-prep WGSL override payloads', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);

    expect(() =>
      renderer.render(makeRenderInput([], { drawPrepShaderWgsl: '@compute fn cs_main() {}' }))
    ).toThrow(/drawPrepShaderWgsl override is forbidden/i);
  });

  it('rejects topology registry snapshot payloads on render input', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);

    expect(() =>
      renderer.render(makeRenderInput([], { topologyRegistrySnapshot: {} }))
    ).toThrow(/topology registry snapshot payloads are forbidden/i);
  });

  it('fails render when shape-bank topology sidecar is shorter than volatile range', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = makeSimpleTopology('webgpu-shape-bank-sidecar-length-topology');
    const input = makeRenderInput([makeDrawOp(topologyId)]);

    expect(() =>
      renderer.render({
        ...input,
        shapeBank: {
          ...input.shapeBank,
          topologyIdByHandle: new Uint32Array(0),
          volatilePtr: input.shapeBank.volatilePtr,
        },
      })
    ).toThrow(/topologyIdByHandle length .* volatilePtr/i);
  });

  it('uses createComputePipelineAsync for all compute pipelines (P2-1 enforcement)', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    await createWebGPURenderer(env.canvas);

    expect(env.device.createComputePipelineAsync).toHaveBeenCalled();
    expect(env.device.createComputePipeline).not.toHaveBeenCalled();
  });

  it('uses createRenderPipelineAsync for the path pipeline (P2-1 enforcement)', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    await createWebGPURenderer(env.canvas);

    expect(env.device.createRenderPipelineAsync).toHaveBeenCalled();
    expect(env.device.createRenderPipeline).not.toHaveBeenCalled();
  });

  it('configures premultiplied alpha blending and 4x MSAA on the render pipeline', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    await createWebGPURenderer(env.canvas);

    expect(env.device.createRenderPipelineAsync).toHaveBeenCalled();
    const firstRenderPipelineCall = (env.device.createRenderPipelineAsync as any).mock.calls[0];
    const descriptor = firstRenderPipelineCall[0] as {
      fragment: {
        targets: Array<{
          blend: {
            color: { srcFactor: string; dstFactor: string; operation: string };
            alpha: { srcFactor: string; dstFactor: string; operation: string };
          };
        }>;
      };
      multisample: { count: number };
    };
    expect(descriptor.fragment.targets[0]?.blend).toEqual({
      color: {
        srcFactor: 'one',
        dstFactor: 'one-minus-src-alpha',
        operation: 'add',
      },
      alpha: {
        srcFactor: 'one',
        dstFactor: 'one-minus-src-alpha',
        operation: 'add',
      },
    });
    expect(descriptor.multisample.count).toBe(WEBGPU_RENDER_CONTRACT.renderMsaaSampleCount);
  });

  it('uses premultiplied alpha output in the fragment shader', () => {
    expect(PATH_RENDER_WGSL).toContain('vec4<f32>(input.color.rgb * input.color.a, input.color.a)');
  });

  it('renders through MSAA resolve attachment with discard store semantics', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);

    renderer.render(makeRenderInput([]));

    const passDescriptor = env.device.createCommandEncoder.mock.results[0]?.value.beginRenderPass.mock.calls[0]?.[0] as {
      colorAttachments: Array<{
        resolveTarget?: unknown;
        storeOp?: string;
        clearValue?: { a?: number };
      }>;
    };
    const colorAttachment = passDescriptor.colorAttachments[0];
    expect(colorAttachment.resolveTarget).toBeDefined();
    expect(colorAttachment.storeOp).toBe('discard');
    expect(colorAttachment.clearValue?.a).toBe(0);
  });

  it('does not rebuild draw-prep compute pipelines during render frames', async () => {
    const env = createFakeWebGPUEnvironment();
    setNavigatorGpu(env.gpu);
    const renderer = await createWebGPURenderer(env.canvas);
    const topologyId = makeSimpleTopology('webgpu-hotswap-protocol-topology');
    env.device.createComputePipelineAsync.mockClear();
    renderer.render(makeRenderInput([makeDrawOp(topologyId)]));
    renderer.render(makeRenderInput([makeDrawOp(topologyId)]));
    expect(env.device.createComputePipelineAsync).not.toHaveBeenCalled();
  });
});
