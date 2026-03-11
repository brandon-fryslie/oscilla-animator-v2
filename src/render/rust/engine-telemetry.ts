import type {
  RustRendererRuntimeEvent,
  RustRendererSchedulerHeartbeat,
  RustRendererSchedulerState,
} from './worker-protocol';

// TODO(#159): Consolidate renderer debug/telemetry ownership once the
// dedicated GPU renderer debug architecture is finalized.
// https://github.com/brandon-fryslie/oscilla-animator-v2/issues/159
// TODO(#161): Follow review cleanup plan for telemetry ownership split between
// worker, scheduler packet parsing, and Rust-side hot-path boundaries.
// https://github.com/brandon-fryslie/oscilla-animator-v2/issues/161

interface RawSchedulerStageTimingsTelemetry {
  readonly inputMarshalMs: number;
  readonly simulationDispatchMs: number;
  readonly fluidPassChainMs: number;
  readonly drawPrepMs: number;
  readonly renderMs: number;
  readonly swapMs: number;
  readonly totalFrameMs: number;
}

interface RawSchedulerDispatchCountersTelemetry {
  readonly computeDispatchCount: number;
  readonly computeWorkgroupCount: number;
  readonly activeLaneCount: number;
  readonly guardedLaneCount: number;
}

interface RawSchedulerResourceStatsTelemetry {
  readonly shapeBankWordCount: number;
  readonly sinkTableWordCount: number;
  readonly indexedRecordCount: number;
  readonly nonIndexedRecordCount: number;
  readonly totalInstanceCount: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly pingPongIndex: number;
}

interface RawSchedulerTelemetry {
  readonly stageTimings: RawSchedulerStageTimingsTelemetry;
  readonly dispatchCounters: RawSchedulerDispatchCountersTelemetry;
  readonly resourceStats: RawSchedulerResourceStatsTelemetry;
}

interface RawSchedulerHeartbeat {
  readonly sequence: number;
  readonly state: string;
  readonly emittedAtMs: number;
  readonly frameCount: number;
  readonly loopCount: number;
  readonly meanTickMs: number;
  readonly stdDevTickMs: number;
  readonly sampleCount: number;
  readonly lastTickMs: number;
  readonly lastSuccessMs: number;
  readonly telemetry: RawSchedulerTelemetry;
}

interface RawRuntimeEvent {
  readonly severity: string;
  readonly code: string;
  readonly stage: string;
  readonly message: string;
  readonly state: string;
  readonly frameCount: number;
  readonly loopCount: number;
  readonly emittedAtMs: number;
}

interface RawSchedulerPacket {
  readonly state: string;
  readonly heartbeat: RawSchedulerHeartbeat;
  readonly events: readonly RawRuntimeEvent[];
}

function isSchedulerState(value: unknown): value is RustRendererSchedulerState {
  return value === 'Booting' || value === 'Running' || value === 'Paused' || value === 'Lost';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value) && value > 0;
}

function isRawSchedulerStageTimingsTelemetry(value: unknown): value is RawSchedulerStageTimingsTelemetry {
  if (!value || typeof value !== 'object') return false;
  const telemetry = value as Partial<RawSchedulerStageTimingsTelemetry>;
  return (
    isFiniteNumber(telemetry.inputMarshalMs)
    && isFiniteNumber(telemetry.simulationDispatchMs)
    && isFiniteNumber(telemetry.fluidPassChainMs)
    && isFiniteNumber(telemetry.drawPrepMs)
    && isFiniteNumber(telemetry.renderMs)
    && isFiniteNumber(telemetry.swapMs)
    && isFiniteNumber(telemetry.totalFrameMs)
  );
}

function isRawSchedulerDispatchCountersTelemetry(value: unknown): value is RawSchedulerDispatchCountersTelemetry {
  if (!value || typeof value !== 'object') return false;
  const telemetry = value as Partial<RawSchedulerDispatchCountersTelemetry>;
  return (
    isFiniteNumber(telemetry.computeDispatchCount)
    && isFiniteNumber(telemetry.computeWorkgroupCount)
    && isFiniteNumber(telemetry.activeLaneCount)
    && isFiniteNumber(telemetry.guardedLaneCount)
  );
}

function isRawSchedulerResourceStatsTelemetry(value: unknown): value is RawSchedulerResourceStatsTelemetry {
  if (!value || typeof value !== 'object') return false;
  const telemetry = value as Partial<RawSchedulerResourceStatsTelemetry>;
  return (
    isFiniteNumber(telemetry.shapeBankWordCount)
    && isFiniteNumber(telemetry.sinkTableWordCount)
    && isFiniteNumber(telemetry.indexedRecordCount)
    && isFiniteNumber(telemetry.nonIndexedRecordCount)
    && isFiniteNumber(telemetry.totalInstanceCount)
    && isFiniteNumber(telemetry.canvasWidth)
    && isFiniteNumber(telemetry.canvasHeight)
    && isFiniteNumber(telemetry.pingPongIndex)
  );
}

function isRawSchedulerTelemetry(value: unknown): value is RawSchedulerTelemetry {
  if (!value || typeof value !== 'object') return false;
  const telemetry = value as Partial<RawSchedulerTelemetry>;
  return (
    isRawSchedulerStageTimingsTelemetry(telemetry.stageTimings)
    && isRawSchedulerDispatchCountersTelemetry(telemetry.dispatchCounters)
    && isRawSchedulerResourceStatsTelemetry(telemetry.resourceStats)
  );
}

function isRawSchedulerHeartbeat(value: unknown): value is RawSchedulerHeartbeat {
  if (!value || typeof value !== 'object') return false;
  const heartbeat = value as Partial<RawSchedulerHeartbeat>;
  return (
    isFiniteNumber(heartbeat.sequence)
    && typeof heartbeat.state === 'string'
    && isFiniteNumber(heartbeat.emittedAtMs)
    && isFiniteNumber(heartbeat.frameCount)
    && isFiniteNumber(heartbeat.loopCount)
    && isFiniteNumber(heartbeat.meanTickMs)
    && isFiniteNumber(heartbeat.stdDevTickMs)
    && isFiniteNumber(heartbeat.sampleCount)
    && isFiniteNumber(heartbeat.lastTickMs)
    && isFiniteNumber(heartbeat.lastSuccessMs)
    && isRawSchedulerTelemetry(heartbeat.telemetry)
  );
}

function isRawRuntimeEvent(value: unknown): value is RawRuntimeEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<RawRuntimeEvent>;
  return (
    typeof event.severity === 'string'
    && typeof event.code === 'string'
    && typeof event.stage === 'string'
    && typeof event.message === 'string'
    && typeof event.state === 'string'
    && isFiniteNumber(event.frameCount)
    && isFiniteNumber(event.loopCount)
    && isFiniteNumber(event.emittedAtMs)
  );
}

function asRuntimeSeverity(value: string): 'error' | 'fatal' {
  return value === 'fatal' ? 'fatal' : 'error';
}

export interface ParsedSchedulerPacket {
  readonly state: RustRendererSchedulerState;
  readonly heartbeat: RustRendererSchedulerHeartbeat;
  readonly events: readonly RustRendererRuntimeEvent[];
}

export function parseSchedulerPacket(packet: unknown): ParsedSchedulerPacket | null {
  // Validate envelope object.
  if (!packet || typeof packet !== 'object') return null;
  const candidate = packet as Partial<RawSchedulerPacket>;
  // Validate mandatory packet fields.
  if (typeof candidate.state !== 'string' || !isRawSchedulerHeartbeat(candidate.heartbeat)) return null;
  // Validate event list shape.
  if (!Array.isArray(candidate.events)) return null;
  if (!candidate.events.every(isRawRuntimeEvent)) return null;
  // Validate scheduler-state enums.
  if (!isSchedulerState(candidate.state)) return null;
  if (!isSchedulerState(candidate.heartbeat.state)) return null;
  if (!candidate.events.every((event) => isSchedulerState(event.state))) return null;

  return {
    state: candidate.state,
    heartbeat: toOutboundHeartbeat(candidate.heartbeat),
    events: candidate.events.map(toOutboundRuntimeEvent),
  };
}

function toOutboundHeartbeat(raw: RawSchedulerHeartbeat): RustRendererSchedulerHeartbeat {
  const state = isSchedulerState(raw.state) ? raw.state : 'Lost';
  return {
    type: 'SCHEDULER_HEARTBEAT',
    state,
    sequence: raw.sequence,
    emittedAtMs: raw.emittedAtMs,
    frameCount: raw.frameCount,
    loopCount: raw.loopCount,
    meanTickMs: raw.meanTickMs,
    stdDevTickMs: raw.stdDevTickMs,
    sampleCount: raw.sampleCount,
    lastTickMs: raw.lastTickMs,
    lastSuccessMs: raw.lastSuccessMs,
    telemetry: raw.telemetry,
  };
}

function toOutboundRuntimeEvent(raw: RawRuntimeEvent): RustRendererRuntimeEvent {
  return {
    type: 'RUNTIME_EVENT',
    severity: asRuntimeSeverity(raw.severity),
    code: raw.code,
    stage: raw.stage,
    message: raw.message,
    state: isSchedulerState(raw.state) ? raw.state : 'Lost',
    frameCount: raw.frameCount,
    loopCount: raw.loopCount,
    emittedAtMs: raw.emittedAtMs,
  };
}
