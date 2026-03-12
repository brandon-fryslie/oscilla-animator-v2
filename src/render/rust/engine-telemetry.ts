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

type UnknownRecord = Record<string, unknown>;

const STAGE_TIMING_FIELDS = [
  'inputMarshalMs',
  'simulationDispatchMs',
  'fluidPassChainMs',
  'drawPrepMs',
  'renderMs',
  'swapMs',
  'totalFrameMs',
] as const;

const DISPATCH_COUNTER_FIELDS = [
  'computeDispatchCount',
  'computeWorkgroupCount',
  'activeLaneCount',
  'guardedLaneCount',
] as const;

const RESOURCE_STATS_FIELDS = [
  'shapeBankWordCount',
  'sinkTableWordCount',
  'indexedRecordCount',
  'nonIndexedRecordCount',
  'totalInstanceCount',
  'canvasWidth',
  'canvasHeight',
  'pingPongIndex',
] as const;

const HEARTBEAT_NUMBER_FIELDS = [
  'sequence',
  'emittedAtMs',
  'frameCount',
  'loopCount',
  'meanTickMs',
  'stdDevTickMs',
  'sampleCount',
  'lastTickMs',
  'lastSuccessMs',
] as const;

const RUNTIME_EVENT_STRING_FIELDS = [
  'severity',
  'code',
  'stage',
  'message',
  'state',
] as const;

const RUNTIME_EVENT_NUMBER_FIELDS = [
  'frameCount',
  'loopCount',
  'emittedAtMs',
] as const;

function asUnknownRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as UnknownRecord;
}

function hasFiniteNumberFields(record: UnknownRecord, keys: readonly string[]): boolean {
  return keys.every((key) => isFiniteNumber(record[key]));
}

function hasStringFields(record: UnknownRecord, keys: readonly string[]): boolean {
  return keys.every((key) => typeof record[key] === 'string');
}

function isRawSchedulerStageTimingsTelemetry(value: unknown): value is RawSchedulerStageTimingsTelemetry {
  const telemetry = asUnknownRecord(value);
  return telemetry !== null && hasFiniteNumberFields(telemetry, STAGE_TIMING_FIELDS);
}

function isRawSchedulerDispatchCountersTelemetry(value: unknown): value is RawSchedulerDispatchCountersTelemetry {
  const telemetry = asUnknownRecord(value);
  return telemetry !== null && hasFiniteNumberFields(telemetry, DISPATCH_COUNTER_FIELDS);
}

function isRawSchedulerResourceStatsTelemetry(value: unknown): value is RawSchedulerResourceStatsTelemetry {
  const telemetry = asUnknownRecord(value);
  return telemetry !== null && hasFiniteNumberFields(telemetry, RESOURCE_STATS_FIELDS);
}

function isRawSchedulerTelemetry(value: unknown): value is RawSchedulerTelemetry {
  const telemetry = asUnknownRecord(value);
  if (telemetry === null) {
    return false;
  }
  return (
    isRawSchedulerStageTimingsTelemetry(telemetry.stageTimings)
    && isRawSchedulerDispatchCountersTelemetry(telemetry.dispatchCounters)
    && isRawSchedulerResourceStatsTelemetry(telemetry.resourceStats)
  );
}

function isRawSchedulerHeartbeat(value: unknown): value is RawSchedulerHeartbeat {
  const heartbeat = asUnknownRecord(value);
  if (heartbeat === null) {
    return false;
  }
  return (
    hasFiniteNumberFields(heartbeat, HEARTBEAT_NUMBER_FIELDS)
    && typeof heartbeat.state === 'string'
    && isRawSchedulerTelemetry(heartbeat.telemetry)
  );
}

function isRawRuntimeEvent(value: unknown): value is RawRuntimeEvent {
  const event = asUnknownRecord(value);
  if (event === null) {
    return false;
  }
  return (
    hasStringFields(event, RUNTIME_EVENT_STRING_FIELDS)
    && hasFiniteNumberFields(event, RUNTIME_EVENT_NUMBER_FIELDS)
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
