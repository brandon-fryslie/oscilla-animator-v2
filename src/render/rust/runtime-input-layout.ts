// [LAW:one-source-of-truth] Shared-input buffer layout is declared in one
// module so main-thread facades and runtime workers cannot drift.
export const RUNTIME_INPUT_SIGNAL_WORDS = 4 as const;
export const RUNTIME_INPUT_FLOAT_WORDS = 32 as const;
export const RUNTIME_INPUT_BUFFER_BYTES =
  (RUNTIME_INPUT_SIGNAL_WORDS + RUNTIME_INPUT_FLOAT_WORDS) * Float32Array.BYTES_PER_ELEMENT;

export const RUNTIME_INPUT_INDEX = Object.freeze({
  width: 0,
  height: 1,
  zoom: 2,
  panX: 3,
  panY: 4,
  timeMs: 5,
  mouseX: 6,
  mouseY: 7,
  mouseButtons: 8,
  audioLow: 9,
  audioMid: 10,
  audioHigh: 11,
  gaugeActive: 12,
  sinkTableWords: 13,
  shapeBankWords: 14,
  installRevision: 15,
} as const);

// Heartbeat channel: Rust worker → main thread via shared memory.
// Written by the worker after each scheduler poll; read by the main-thread
// circuit breaker timer.  Zero postMessage overhead.
//
// The worker writes data words first, then atomically stores the sequence
// to signal word index 1 (release).  The main thread atomically loads
// signal word index 1 (acquire) and, if the sequence changed, reads
// the data words — guaranteeing a consistent snapshot.
export const HEARTBEAT_SIGNAL_INDEX = 1 as const;

// Float-word indices for heartbeat data.  Sequence lives in signal
// word HEARTBEAT_SIGNAL_INDEX, not in the float plane.
export const HEARTBEAT_INDEX = Object.freeze({
  state: 16,        // 0=Booting, 1=Running, 2=Paused, 3=Lost
  frameCount: 17,
  lastSuccessMs: 18,
} as const);

// [LAW:one-source-of-truth] Single canonical tuple drives both encode and decode.
const HEARTBEAT_STATES = Object.freeze(['Booting', 'Running', 'Paused', 'Lost'] as const);
type HeartbeatState = (typeof HEARTBEAT_STATES)[number];

export const HEARTBEAT_STATE_MAP = Object.freeze(
  HEARTBEAT_STATES.reduce(
    (acc, state, index) => { acc[state] = index; return acc; },
    {} as Record<HeartbeatState, number>,
  ),
);

export function decodeHeartbeatState(value: number): HeartbeatState {
  // Fail-safe: treat unknown state codes as 'Lost' so the circuit breaker
  // sees them as a runtime fault, not a benign booting phase.
  return HEARTBEAT_STATES[value] ?? 'Lost';
}

export interface RuntimeSharedPlanes {
  readonly sharedInput: SharedArrayBuffer;
  readonly sharedShapeBank: SharedArrayBuffer;
  readonly sharedSinkTable: SharedArrayBuffer;
}
