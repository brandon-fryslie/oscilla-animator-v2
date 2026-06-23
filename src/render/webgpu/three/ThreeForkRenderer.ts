/**
 * src/render/webgpu/three/ThreeForkRenderer.ts
 *
 * The Three-backed renderer behind `createWebGPURenderer()`. It owns a Three
 * `WebGPURenderer` device, realizes an installed `ScenePlan` into a scene
 * graph, and draws frames driven by runtime input channels.
 *
 * Scope source: design-docs/three-fork-integration-proposal.md §2.3, §6.
 * Ownership/seam canon: design-docs/three-migration-backend-canon.md — this is
 *   backend-local; it never calls upward into patch/editor/compiler services.
 * Capability tier: design-docs/three-fork-deltas.md §1 Tier B (upstream Three +
 *   backend-local composition). The fork-delta register is EMPTY; this uses
 *   plain upstream Three, no fork.
 *
 * [LAW:effects-at-boundaries] This is the one effectful unit in the backend: it
 *   touches the GPU. The plan→scene-graph translation it depends on
 *   (scene-plan-realizer, plan-expr-tsl) is pure and lives in separate modules.
 * [LAW:no-ambient-temporal-coupling] The GPU device has one explicit owner and a
 *   named lifecycle ('idle' → 'active' → 'disposed'). The device is acquired
 *   lazily on the first frame, not at construction — so constructing a renderer
 *   (and the app shell that does so on boot) never requires a GPU adapter, and a
 *   plan can be installed before any device exists.
 */

import { WebGPURenderer as ThreeWebGPURenderer } from 'three/webgpu';

import type { AssetRegistry } from '../../../assets';
import type { ScenePlan } from '../../scene-plan';
import { realizeScenePlan, type RealizedScene } from './scene-plan-realizer';
import { ThreeLoadingBridge } from './asset-bridge';
import type {
  GpuFault,
  GpuFaultCallback,
  RuntimeInputChannelValues,
  WebGPURenderer,
} from './renderer-contract';

type Lifecycle = 'idle' | 'active' | 'disposed';

function deviceInitFault(error: unknown): GpuFault {
  const message = error instanceof Error ? error.message : String(error);
  return {
    message: `Three WebGPU device initialization failed: ${message}`,
    source: 'ThreeForkRenderer',
    fatal: true,
    severity: 'fatal',
    code: 'THREE_DEVICE_INIT_FAILED',
    recoverable: false,
  };
}

export class ThreeForkRenderer implements WebGPURenderer {
  private lifecycle: Lifecycle = 'idle';
  private device: ThreeWebGPURenderer | null = null;
  private realized: RealizedScene | null = null;
  private onGpuFault: GpuFaultCallback = null;
  private deviceInit: Promise<ThreeWebGPURenderer> | null = null;
  // [LAW:single-enforcer] The renderer owns the one loading bridge; all texture
  //   decode/caching for installed plans flows through it.
  private readonly bridge = new ThreeLoadingBridge();

  constructor(private readonly canvas: HTMLCanvasElement) {}

  async installScenePlan(plan: ScenePlan, registry: AssetRegistry): Promise<void> {
    this.assertNotDisposed('installing a ScenePlan');
    // [LAW:effects-at-boundaries] Decode the plan's texture assets here (the
    //   effect), then realize purely from the already-resolved textures.
    const resolvedTextures = await this.bridge.resolveTextures(plan, registry);
    this.assertNotDisposed('installing a ScenePlan');
    // [LAW:one-source-of-truth] A renderer holds exactly one realized scene; a
    //   new plan replaces the old one and releases its resources.
    this.realized?.dispose();
    // realizeScenePlan throws on an incompatible version or dangling handle
    // ([LAW:no-silent-failure]); the throw propagates to the installer.
    this.realized = realizeScenePlan(plan, resolvedTextures);
  }

  async renderFrame(values: RuntimeInputChannelValues): Promise<void> {
    this.assertNotDisposed('rendering a frame');
    const realized = this.realized;
    // [LAW:no-silent-failure] Drawing before a plan is installed is a caller
    //   sequencing error, surfaced loudly rather than drawing nothing.
    if (!realized) {
      throw new Error('ThreeForkRenderer: install a ScenePlan before rendering a frame');
    }

    const device = await this.ensureDevice();

    for (const [channel, node] of realized.inputs) {
      const value = values[channel];
      // [LAW:no-silent-failure] A declared input channel with no per-frame value
      //   would silently freeze at its last value; require it explicitly.
      if (value === undefined) {
        throw new Error(
          `ThreeForkRenderer: render plan declares input channel '${channel}' but no value was provided for this frame`,
        );
      }
      node.value = value;
    }

    await device.renderAsync(realized.scene, realized.camera);
  }

  private async ensureDevice(): Promise<ThreeWebGPURenderer> {
    if (this.device) {
      return this.device;
    }
    // [LAW:no-ambient-temporal-coupling] A single in-flight init promise owns
    //   device creation, so concurrent frames cannot race two devices into
    //   existence.
    if (!this.deviceInit) {
      this.deviceInit = this.createDevice();
    }
    return this.deviceInit;
  }

  private async createDevice(): Promise<ThreeWebGPURenderer> {
    const device = new ThreeWebGPURenderer({ canvas: this.canvas, alpha: true, antialias: true });
    try {
      await device.init();
    } catch (error) {
      // [LAW:no-silent-failure] Device init failure is a fatal, reported fault —
      //   not a swallowed error that leaves a half-built renderer.
      this.deviceInit = null;
      this.onGpuFault?.(deviceInitFault(error));
      throw error instanceof Error ? error : new Error(String(error));
    }
    device.setSize(this.canvas.width, this.canvas.height, false);
    device.setClearColor(0x000000, 1);
    this.device = device;
    this.lifecycle = 'active';
    return device;
  }

  dispose(): void {
    this.realized?.dispose();
    this.realized = null;
    // [LAW:single-enforcer] The bridge owns the texture cache; disposing the
    //   renderer releases every decoded texture wholesale.
    this.bridge.dispose();
    this.device?.dispose();
    this.device = null;
    this.deviceInit = null;
    this.lifecycle = 'disposed';
  }

  setGpuFaultCallback(callback: GpuFaultCallback): void {
    this.onGpuFault = callback;
  }

  getLifecycleState(): string {
    return this.lifecycle;
  }

  // The Three backend has no GPU-IR passes, sink tables, or Rust-boundary
  // payloads — those are the dead legacy path. These accessors report their
  // absence honestly rather than fabricating legacy-shaped telemetry.
  getLatestRuntimeTelemetry(): null {
    return null;
  }

  getInstalledGpuPassIds(): readonly string[] {
    return [];
  }

  getLatestSinkTableSample(): null {
    return null;
  }

  getLatestBoundaryFixturePayloadV1(): null {
    return null;
  }

  setTelemetryEnabled(_enabled: boolean): void {
    // No GPU-IR telemetry stream exists on this backend; nothing to toggle.
  }

  private assertNotDisposed(action: string): void {
    if (this.lifecycle === 'disposed') {
      throw new Error(`ThreeForkRenderer: cannot ${action} after dispose()`);
    }
  }
}
