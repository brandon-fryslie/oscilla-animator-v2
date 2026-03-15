import type { GpuFault, WebGPURendererExecutionState } from '../render';

export type StartupRestoreSource = 'none' | 'storage' | 'demo' | 'test';

export function shouldClearStoredStartupPatch(
  source: StartupRestoreSource,
  armed: boolean,
  fault: GpuFault,
): boolean {
  return armed && source === 'storage' && fault.severity === 'fatal';
}

export function deriveRendererExecutionStateFromGpuFault(
  fault: GpuFault,
): WebGPURendererExecutionState {
  if (fault.severity !== 'fatal') {
    return 'active';
  }
  return fault.source === 'CIRCUIT_BREAKER' ? 'pausedByBreaker' : 'fatal';
}
