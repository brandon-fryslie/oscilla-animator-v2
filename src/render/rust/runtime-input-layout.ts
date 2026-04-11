// [LAW:one-source-of-truth] Heartbeat shared-buffer layout is declared in one
// module so main-thread facades and runtime workers cannot drift.

// Heartbeat SAB layout: signal plane (Int32Array) + float plane (Float32Array).
export const HEARTBEAT_SIGNAL_WORDS = 4 as const;
export const HEARTBEAT_FLOAT_WORDS = 32 as const;
export const HEARTBEAT_BUFFER_BYTES =
  (HEARTBEAT_SIGNAL_WORDS + HEARTBEAT_FLOAT_WORDS) * Float32Array.BYTES_PER_ELEMENT;

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
