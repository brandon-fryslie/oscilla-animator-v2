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

export const HEARTBEAT_INDEX = Object.freeze({
  sequence: 16,
  state: 17,        // 0=Booting, 1=Running, 2=Paused, 3=Lost
  frameCount: 18,
  lastSuccessMs: 19,
} as const);

export const HEARTBEAT_STATE_MAP = Object.freeze({
  Booting: 0,
  Running: 1,
  Paused: 2,
  Lost: 3,
} as const);

const HEARTBEAT_STATE_REVERSE = Object.freeze(['Booting', 'Running', 'Paused', 'Lost'] as const);

export function decodeHeartbeatState(value: number): 'Booting' | 'Running' | 'Paused' | 'Lost' {
  return HEARTBEAT_STATE_REVERSE[value] ?? 'Booting';
}

export interface RuntimeSharedPlanes {
  readonly sharedInput: SharedArrayBuffer;
  readonly sharedShapeBank: SharedArrayBuffer;
  readonly sharedSinkTable: SharedArrayBuffer;
}
