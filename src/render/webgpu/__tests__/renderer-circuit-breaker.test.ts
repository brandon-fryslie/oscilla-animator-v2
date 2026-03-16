import { describe, expect, it } from 'vitest';

import { RendererCircuitBreaker } from '../renderer-circuit-breaker';

describe('RendererCircuitBreaker', () => {
  it('trips when heartbeats stop while running', () => {
    const breaker = new RendererCircuitBreaker({
      heartbeatTimeoutMs: 1_000,
      progressTimeoutMs: 1_500,
    });

    breaker.noteBootstrap(0);
    breaker.noteHeartbeat({
      state: 'Running',
      sequence: 1,
      frameCount: 1,
      lastSuccessMs: 10,
      observedAtMs: 100,
    });

    expect(breaker.check(1_101)).toMatchObject({
      code: 'renderer_heartbeat_stalled',
    });
  });

  it('trips when heartbeats continue but frame progress stalls', () => {
    const breaker = new RendererCircuitBreaker({
      heartbeatTimeoutMs: 1_000,
      progressTimeoutMs: 1_500,
    });

    breaker.noteBootstrap(0);
    breaker.noteHeartbeat({
      state: 'Running',
      sequence: 1,
      frameCount: 1,
      lastSuccessMs: 10,
      observedAtMs: 100,
    });
    breaker.noteHeartbeat({
      state: 'Running',
      sequence: 2,
      frameCount: 1,
      lastSuccessMs: 10,
      observedAtMs: 900,
    });

    expect(breaker.check(1_701)).toMatchObject({
      code: 'renderer_progress_stalled',
    });
  });

  it('does not trip while the scheduler reports a non-running state', () => {
    const breaker = new RendererCircuitBreaker({
      heartbeatTimeoutMs: 1_000,
      progressTimeoutMs: 1_500,
    });

    breaker.noteBootstrap(0);
    breaker.noteHeartbeat({
      state: 'Paused',
      sequence: 1,
      frameCount: 0,
      lastSuccessMs: 0,
      observedAtMs: 100,
    });

    expect(breaker.check(5_000)).toBeNull();
  });

  it('stays tripped after the runtime marks it paused by breaker', () => {
    const breaker = new RendererCircuitBreaker();

    breaker.markPausedByBreaker();

    expect(breaker.getState()).toBe('pausedByBreaker');
    expect(breaker.check(5_000)).toBeNull();
  });
});
