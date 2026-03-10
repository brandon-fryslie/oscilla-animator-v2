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
  arenaWords: 15,
} as const);

export interface RuntimeSharedPlanes {
  readonly sharedInput: SharedArrayBuffer;
  readonly sharedArena: SharedArrayBuffer;
  readonly sharedShapeBank: SharedArrayBuffer;
  readonly sharedSinkTable: SharedArrayBuffer;
}
