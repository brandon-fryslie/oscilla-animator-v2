import type { LogEntry } from '../../../stores/DiagnosticsStore';

export interface RuntimeTelemetryDetail {
  readonly kind: 'runtimeTelemetry';
  readonly schedulerState: 'Booting' | 'Running' | 'Paused' | 'Lost';
  readonly fps: number;
  readonly telemetry: {
    readonly meanMs: number;
    readonly stdDevMs: number;
    readonly sampleCount: number;
    readonly frameCount: number;
    readonly stageTimings: {
      readonly inputMarshalMs: number;
      readonly simulationDispatchMs: number;
      readonly fluidPassChainMs: number;
      readonly drawPrepMs: number;
      readonly renderMs: number;
      readonly swapMs: number;
      readonly totalFrameMs: number;
    };
    readonly dispatchCounters: {
      readonly computeDispatchCount: number;
      readonly computeWorkgroupCount: number;
      readonly activeLaneCount: number;
      readonly guardedLaneCount: number;
    };
    readonly resourceStats: {
      readonly sinkTableWordCount: number;
      readonly totalInstanceCount: number;
      readonly pingPongIndex: number;
      readonly canvasWidth: number;
      readonly canvasHeight: number;
    };
    readonly lastEvent: {
      readonly severity: 'error' | 'fatal';
      readonly code: string;
      readonly stage: string;
      readonly message: string;
      readonly emittedAtMs: number;
    } | null;
  };
}

export interface RuntimeTelemetryLog {
  readonly timestamp: number;
  readonly payload: RuntimeTelemetryDetail;
}

export function isRuntimeTelemetryDetail(value: unknown): value is RuntimeTelemetryDetail {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<RuntimeTelemetryDetail>;
  return (
    candidate.kind === 'runtimeTelemetry'
    && typeof candidate.schedulerState === 'string'
    && typeof candidate.fps === 'number'
    && !!candidate.telemetry
    && typeof candidate.telemetry === 'object'
  );
}

// [LAW:one-source-of-truth] Runtime telemetry extraction from diagnostics logs
// is centralized here so renderer-debug views cannot drift on parser behavior.
export function selectLatestRuntimeTelemetryLog(
  logs: readonly LogEntry[]
): RuntimeTelemetryLog | null {
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const entry = logs[index];
    if (entry && isRuntimeTelemetryDetail(entry.data)) {
      return {
        timestamp: entry.timestamp,
        payload: entry.data,
      };
    }
  }
  return null;
}
