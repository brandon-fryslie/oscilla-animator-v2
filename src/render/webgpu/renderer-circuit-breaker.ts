import type { RustRendererSchedulerState } from '../rust/worker-protocol';

export type WebGPURendererExecutionState = 'active' | 'pausedByBreaker' | 'fatal';

export interface RendererCircuitBreakerHeartbeat {
  readonly state: RustRendererSchedulerState;
  readonly sequence: number;
  readonly frameCount: number;
  readonly lastSuccessMs: number;
  readonly observedAtMs: number;
}

export interface RendererCircuitBreakerTrip {
  readonly code: 'renderer_heartbeat_stalled' | 'renderer_progress_stalled';
  readonly message: string;
}

interface RendererCircuitBreakerOptions {
  readonly heartbeatTimeoutMs: number;
  readonly progressTimeoutMs: number;
}

const DEFAULT_RENDERER_CIRCUIT_BREAKER_OPTIONS: RendererCircuitBreakerOptions = Object.freeze({
  heartbeatTimeoutMs: 1_000,
  progressTimeoutMs: 1_500,
});

export class RendererCircuitBreaker {
  private executionState: WebGPURendererExecutionState = 'active';
  private lifecycleState: RustRendererSchedulerState = 'Booting';
  private lastFrameCount = -1;
  private lastSuccessMs = -1;
  private lastHeartbeatAtMs = 0;
  private lastProgressAtMs = 0;

  constructor(
    private readonly options: RendererCircuitBreakerOptions = DEFAULT_RENDERER_CIRCUIT_BREAKER_OPTIONS,
  ) {}

  getState(): WebGPURendererExecutionState {
    return this.executionState;
  }

  noteBootstrap(nowMs: number): void {
    const normalizedNow = nowMs >= 0 ? nowMs : 0;
    this.executionState = 'active';
    this.lifecycleState = 'Booting';
    this.lastHeartbeatAtMs = normalizedNow;
    this.lastProgressAtMs = normalizedNow;
  }

  noteHeartbeat(heartbeat: RendererCircuitBreakerHeartbeat): void {
    this.lifecycleState = heartbeat.state;
    this.lastHeartbeatAtMs = heartbeat.observedAtMs;
    if (
      heartbeat.frameCount !== this.lastFrameCount
      || heartbeat.lastSuccessMs !== this.lastSuccessMs
    ) {
      this.lastProgressAtMs = heartbeat.observedAtMs;
    }
    if (heartbeat.state !== 'Running') {
      // [LAW:dataflow-not-control-flow] The watchdog always samples the same
      // heartbeat stream; non-running states reset progress timing instead of
      // skipping watchdog bookkeeping entirely.
      this.lastProgressAtMs = heartbeat.observedAtMs;
    }
    this.lastFrameCount = heartbeat.frameCount;
    this.lastSuccessMs = heartbeat.lastSuccessMs;
  }

  markPausedByBreaker(): void {
    this.executionState = 'pausedByBreaker';
  }

  markFatal(): void {
    this.executionState = 'fatal';
  }

  check(nowMs: number): RendererCircuitBreakerTrip | null {
    if (this.executionState !== 'active') {
      return null;
    }
    if (this.lifecycleState !== 'Running') {
      return null;
    }
    if ((nowMs - this.lastHeartbeatAtMs) > this.options.heartbeatTimeoutMs) {
      return {
        code: 'renderer_heartbeat_stalled',
        message: `WebGPU renderer heartbeat stalled for ${Math.round(nowMs - this.lastHeartbeatAtMs)}ms`,
      };
    }
    if ((nowMs - this.lastProgressAtMs) > this.options.progressTimeoutMs) {
      return {
        code: 'renderer_progress_stalled',
        message: `WebGPU renderer made no frame progress for ${Math.round(nowMs - this.lastProgressAtMs)}ms`,
      };
    }
    return null;
  }
}
