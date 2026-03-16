import { describe, expect, it } from 'vitest';

import {
  deriveRendererExecutionStateFromGpuFault,
  shouldClearStoredStartupPatch,
} from '../runtime-gpu-fault-policy';

describe('runtime GPU fault policy', () => {
  it('clears the stored startup patch only for armed storage restores', () => {
    const fatalCircuitBreakerFault = {
      severity: 'fatal',
      code: 'renderer_progress_stalled',
      message: 'stalled',
      source: 'CIRCUIT_BREAKER',
      recoverable: false,
    } as const;

    expect(shouldClearStoredStartupPatch('storage', true, fatalCircuitBreakerFault)).toBe(true);
    expect(shouldClearStoredStartupPatch('demo', true, fatalCircuitBreakerFault)).toBe(false);
    expect(shouldClearStoredStartupPatch('storage', false, fatalCircuitBreakerFault)).toBe(false);
  });

  it('maps circuit-breaker faults to pausedByBreaker', () => {
    expect(deriveRendererExecutionStateFromGpuFault({
      severity: 'fatal',
      code: 'renderer_progress_stalled',
      message: 'stalled',
      source: 'CIRCUIT_BREAKER',
      recoverable: false,
    })).toBe('pausedByBreaker');
  });

  it('maps non-breaker fatal faults to fatal', () => {
    expect(deriveRendererExecutionStateFromGpuFault({
      severity: 'fatal',
      code: 'scheduler_lost',
      message: 'lost',
      source: 'WORKER',
      recoverable: false,
    })).toBe('fatal');
  });
});
