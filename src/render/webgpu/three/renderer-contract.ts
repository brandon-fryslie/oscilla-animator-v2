/**
 * src/render/webgpu/three/renderer-contract.ts
 *
 * The app-facing renderer seam contract: the interface `createWebGPURenderer()`
 * returns, plus the fault model the runtime handles. Backend-neutral — it
 * names capabilities, never Three classes.
 *
 * Ownership/seam canon: design-docs/three-migration-backend-canon.md.
 *   `createWebGPURenderer()` (src/render/webgpu/index.ts) is the single
 *   app-facing renderer construction boundary; this module is the contract that
 *   boundary promises. RuntimeService and AnimationLoop depend only on this.
 *
 * [LAW:locality-or-seam] This interface IS the boundary between app/runtime and
 *   the render backend. The Three implementation lives behind it; no `three`
 *   type appears in this file, so the app never depends on a Three object
 *   identity (three-fork-deltas.md §3 capability surface).
 * [LAW:single-enforcer] One contract module, imported by both the seam
 *   (`index.ts`) and the implementation (`ThreeForkRenderer.ts`), so the shape
 *   has a single source of truth.
 */

import type { PlanInputChannel, ScenePlan } from '../../scene-plan';

/**
 * A render-backend fault, surfaced to the runtime fault handler.
 *
 * [LAW:no-silent-failure] Faults are explicit, classified values — never a
 *   swallowed error or a silent degrade.
 */
export interface GpuFault {
  readonly message: string;
  readonly source: string;
  readonly fatal: boolean;
  readonly severity: 'fatal' | 'error' | 'warning';
  readonly code: string;
  readonly recoverable: boolean;
}

export type GpuFaultCallback = ((fault: GpuFault) => void) | null;

/**
 * Per-frame runtime input values, keyed by the plan's own channel vocabulary.
 *
 * [LAW:one-source-of-truth] Keyed by `PlanInputChannel` (the plan's declared
 *   inputs), not by the worker transport field names. The runtime maps its
 *   envelope onto these channel names at the call site; the renderer reads only
 *   the channels its installed plan declared.
 */
export type RuntimeInputChannelValues = Readonly<Partial<Record<PlanInputChannel, number>>>;

/**
 * The renderer behind `createWebGPURenderer()`.
 *
 * The `getLatest*` / `getInstalledGpuPassIds` accessors are the legacy
 * GPU-IR/Rust-worker telemetry surface the runtime still reads. The Three
 * backend has no GPU-IR passes or sink tables, so they report "nothing here"
 * (`null` / `[]`) honestly rather than fabricating legacy-shaped data.
 */
export interface WebGPURenderer {
  /**
   * Install a compiled `ScenePlan`, realizing it into the backend's scene
   * graph. Replaces any previously installed plan. Pure CPU work — no GPU
   * device is required until the first {@link WebGPURenderer.renderFrame}.
   *
   * [LAW:no-silent-failure] Throws on an incompatible plan version or a
   *   dangling resource handle.
   */
  installScenePlan(plan: ScenePlan): void;

  /**
   * Draw one frame of the installed plan, feeding the declared runtime input
   * channels from `values`. Acquires the GPU device lazily on first call.
   *
   * [LAW:no-silent-failure] Throws if no plan is installed, or if a channel the
   *   plan declared in `render.inputs` has no value in `values`.
   */
  renderFrame(values: RuntimeInputChannelValues): Promise<void>;

  dispose(): void;
  setGpuFaultCallback(callback: GpuFaultCallback): void;
  // Legacy GPU-IR/Rust-worker telemetry accessors. Typed `any` to match the
  // runtime consumers that read snapshot-shaped fields off them; the Three
  // backend reports null since it has no GPU-IR telemetry.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getLatestRuntimeTelemetry(): any;
  getInstalledGpuPassIds(): readonly string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getLatestSinkTableSample(): any;
  getLifecycleState(): string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getLatestBoundaryFixturePayloadV1(): any;
  setTelemetryEnabled(enabled: boolean): void;
}
