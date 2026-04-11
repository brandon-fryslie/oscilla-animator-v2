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

    // @ts-expect-error — GpuFault stub shape mismatch; rebuilt in Phase 4
    expect(shouldClearStoredStartupPatch('storage', true, fatalCircuitBreakerFault)).toBe(true);
    // @ts-expect-error — GpuFault stub shape mismatch; rebuilt in Phase 4
    expect(shouldClearStoredStartupPatch('demo', true, fatalCircuitBreakerFault)).toBe(false);
    // @ts-expect-error — GpuFault stub shape mismatch; rebuilt in Phase 4
    expect(shouldClearStoredStartupPatch('storage', false, fatalCircuitBreakerFault)).toBe(false);
  });

  it('maps circuit-breaker faults to pausedByBreaker', () => {
    // @ts-expect-error — GpuFault stub shape mismatch; rebuilt in Phase 4
    expect(deriveRendererExecutionStateFromGpuFault({
      severity: 'fatal',
      code: 'renderer_progress_stalled',
      message: 'stalled',
      source: 'CIRCUIT_BREAKER',
      recoverable: false,
    })).toBe('pausedByBreaker');
  });

  it('maps non-breaker fatal faults to fatal', () => {
    // @ts-expect-error — GpuFault stub shape mismatch; rebuilt in Phase 4
    expect(deriveRendererExecutionStateFromGpuFault({
      severity: 'fatal',
      code: 'scheduler_lost',
      message: 'lost',
      source: 'WORKER',
      recoverable: false,
    })).toBe('fatal');
  });
});
