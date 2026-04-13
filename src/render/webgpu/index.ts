export type { WebGPURendererExecutionState } from './renderer-circuit-breaker';

// Stubs — RustWasmWebGPURenderer deleted during scorched earth, rebuilt in Phase 4.
// These satisfy downstream imports until the renderer facade is rebuilt.

export interface GpuFault {
  readonly message: string;
  readonly source: string;
  readonly fatal: boolean;
  readonly severity: 'fatal' | 'error' | 'warning';
  readonly code: string;
  readonly recoverable: boolean;
}

export type GpuFaultCallback = ((fault: GpuFault) => void) | null;

export interface WebGPURenderer {
  dispose(): void;
  setGpuFaultCallback(callback: GpuFaultCallback): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getLatestRuntimeTelemetry(): any;
  getInstalledGpuPassIds(): readonly string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getLatestSinkTableSample(): any;
  getLifecycleState(): string;
  setTelemetryEnabled(enabled: boolean): void;
}

export async function createWebGPURenderer(
  _canvas: HTMLCanvasElement,
  _options?: { onGpuFault?: (fault: GpuFault) => void },
): Promise<WebGPURenderer> {
  // Stub — renderer not yet rebuilt
  return {
    dispose() {},
    setGpuFaultCallback() {},
    getLatestRuntimeTelemetry() { return null; },
    getInstalledGpuPassIds() { return []; },
    getLatestSinkTableSample() { return null; },
    getLifecycleState() { return 'stub'; },
    setTelemetryEnabled() {},
  };
}

export function assertWebGPUStartupContract(): void {
  // Stub — no validation needed until renderer is rebuilt
}
