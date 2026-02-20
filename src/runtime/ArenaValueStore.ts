/**
 * ArenaValueStore — Float32 arena types and accessors for the unified value store.
 *
 * All runtime values (signals and fields) live in a single contiguous Float32Array.
 * Descriptors are computed at compile time; read/write/slice are unchecked hot-path ops.
 */

// [LAW:one-source-of-truth] Descriptor is the single authority for slot layout.
export interface ArenaSlotDescriptor {
  readonly offset: number;     // Start index in Float32Array
  readonly stride: number;     // Components per element (1=float, 2=vec2, 3=vec3, 4=color)
  readonly laneCount: number;  // 1=signal, N=field
  readonly length: number;     // = stride * laneCount (stored for fast bounds/subarray)
}

/** Allocate a zeroed Float32Array of `totalFloats` elements. */
export function createArena(totalFloats: number): Float32Array {
  return new Float32Array(totalFloats);
}

/** Read a single component: `arena[desc.offset + lane * desc.stride + component]`. */
export function arenaRead(
  arena: Float32Array,
  desc: ArenaSlotDescriptor,
  lane: number,
  component: number,
): number {
  return arena[desc.offset + lane * desc.stride + component];
}

/** Write a single component: `arena[desc.offset + lane * desc.stride + component] = value`. */
export function arenaWrite(
  arena: Float32Array,
  desc: ArenaSlotDescriptor,
  lane: number,
  component: number,
  value: number,
): void {
  arena[desc.offset + lane * desc.stride + component] = value;
}

/** Zero-copy subarray view over the descriptor's region. */
export function arenaSlice(
  arena: Float32Array,
  desc: ArenaSlotDescriptor,
): Float32Array {
  return arena.subarray(desc.offset, desc.offset + desc.length);
}
