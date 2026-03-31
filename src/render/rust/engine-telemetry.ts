import type {
  RustRendererRuntimeEvent,
  RustRendererSchedulerHeartbeat,
  RustRendererSchedulerState,
} from './worker-protocol';

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
  readonly totalFrameMs?: number;
  readonly telemetry?: unknown;
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

function isRawSchedulerHeartbeat(value: unknown): value is RawSchedulerHeartbeat {
  const heartbeat = asUnknownRecord(value);
  if (heartbeat === null) {
    return false;
  }
  return (
    hasFiniteNumberFields(heartbeat, HEARTBEAT_NUMBER_FIELDS)
    && typeof heartbeat.state === 'string'
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

function readTotalFrameMs(raw: RawSchedulerHeartbeat): number {
  if (isFiniteNumber(raw.totalFrameMs)) {
    return raw.totalFrameMs;
  }

  // [LAW:one-source-of-truth] Runtime packet compatibility is normalized in one parser
  // boundary, so worker loop consumers read a single canonical telemetry shape.
  const telemetry = asUnknownRecord(raw.telemetry);
  const stageTimings = asUnknownRecord(telemetry?.stageTimings);
  const totalFrameMs = stageTimings?.totalFrameMs;
  if (isFiniteNumber(totalFrameMs)) {
    return totalFrameMs;
  }

  return 0;
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
    telemetry: {
      stageTimings: {
        totalFrameMs: readTotalFrameMs(raw),
      },
    },
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
