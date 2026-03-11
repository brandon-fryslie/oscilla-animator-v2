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

function failSchedulerPacketContract(details: string): never {
  throw new Error(`Rust scheduler telemetry contract violation: ${details}`);
}

function requireSchedulerState(value: unknown, path: string): RustRendererSchedulerState {
  if (!isSchedulerState(value)) {
    failSchedulerPacketContract(`${path} must be one of Booting|Running|Paused|Lost`);
  }
  return value;
}

export function parseSchedulerPacket(packet: unknown): ParsedSchedulerPacket {
  if (!packet || typeof packet !== 'object') {
    failSchedulerPacketContract('packet must be an object');
  }
  const candidate = packet as Partial<RawSchedulerPacket>;
  if (typeof candidate.state !== 'string') {
    failSchedulerPacketContract('packet.state must be a string');
  }
  const heartbeatCandidate = candidate.heartbeat;
  if (!isRawSchedulerHeartbeat(heartbeatCandidate)) {
    failSchedulerPacketContract('packet.heartbeat is missing required telemetry fields');
  }
  const eventsCandidate = candidate.events;
  if (!Array.isArray(eventsCandidate)) {
    failSchedulerPacketContract('packet.events must be an array');
  }
  if (!eventsCandidate.every(isRawRuntimeEvent)) {
    failSchedulerPacketContract('packet.events contains invalid runtime-event payloads');
  }
  const rawEvents = eventsCandidate as readonly RawRuntimeEvent[];

  const packetState = requireSchedulerState(candidate.state, 'packet.state');
  const heartbeatState = requireSchedulerState(heartbeatCandidate.state, 'packet.heartbeat.state');
  const events = rawEvents.map((event, index) => toOutboundRuntimeEvent(event, index));

  return {
    state: packetState,
    heartbeat: toOutboundHeartbeat(heartbeatCandidate, heartbeatState),
    events,
  };
}

function toOutboundHeartbeat(
  raw: RawSchedulerHeartbeat,
  state: RustRendererSchedulerState,
): RustRendererSchedulerHeartbeat {
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

function toOutboundRuntimeEvent(raw: RawRuntimeEvent, index: number): RustRendererRuntimeEvent {
  return {
    type: 'RUNTIME_EVENT',
    severity: asRuntimeSeverity(raw.severity),
    code: raw.code,
    stage: raw.stage,
    message: raw.message,
    state: requireSchedulerState(raw.state, `packet.events[${String(index)}].state`),
    frameCount: raw.frameCount,
    loopCount: raw.loopCount,
    emittedAtMs: raw.emittedAtMs,
  };
}
