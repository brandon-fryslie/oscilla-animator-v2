/**
 * ArenaValueStore — Float32 arena types and accessors for the unified value store.
 *
 * All runtime values (one-cardinality and many-cardinality) live in one contiguous Float32Array.
 * Descriptors are computed at compile time; read/write/slice are unchecked hot-path ops.
 */

export type ArenaPacking = 'aos' | 'soa';

export interface ArenaAddress {
  readonly baseOffset: number;
  readonly laneStride: number;
  readonly componentStride: number;
  readonly stride: number;
  readonly laneCount: number;
}

// [LAW:one-source-of-truth] Descriptor is the single authority for slot layout.
export interface ArenaSlotDescriptor {
  readonly offset: number;     // Start index in Float32Array
  readonly stride: number;     // Components per element (1=float, 2=vec2, 3=vec3, 4=color)
  readonly laneCount: number;  // 1=one-cardinality, N=many-cardinality
  readonly length: number;     // = stride * laneCount (stored for fast bounds/subarray)
  /**
   * Canonical packing metadata for W1/W14.
   * `aos` keeps historical interleaved layout, `soa` is component-major.
   */
  readonly packing?: ArenaPacking;
  /**
   * Lane step in floats for one component plane.
   * Defaults: `aos -> stride`, `soa -> 1`.
   */
  readonly laneStride?: number;
  /**
   * Component step in floats between adjacent component planes.
   * Defaults: `aos -> 1`, `soa -> laneCount`.
   */
  readonly componentStride?: number;
}

/** Allocate a zeroed Float32Array of `totalFloats` elements. */
export function createArena(totalFloats: number): Float32Array {
  return new Float32Array(totalFloats);
}

/**
 * Canonical per-slot arena address normalization.
 *
 * // [LAW:one-source-of-truth] Runtime addressing derives from one descriptor contract
 * // regardless of the underlying packing mode.
 */
export function resolveArenaAddress(desc: ArenaSlotDescriptor): ArenaAddress {
  const packing = desc.packing ?? 'aos';
  const laneStride = desc.laneStride ?? (packing === 'soa' ? 1 : desc.stride);
  const componentStride = desc.componentStride ?? (packing === 'soa' ? desc.laneCount : 1);
  return {
    baseOffset: desc.offset,
    laneStride,
    componentStride,
    stride: desc.stride,
    laneCount: desc.laneCount,
  };
}

/** Compute canonical arena index for (lane, component). */
export function arenaIndex(
  desc: ArenaSlotDescriptor,
  lane: number,
  component: number,
): number {
  const addr = resolveArenaAddress(desc);
  return addr.baseOffset + component * addr.componentStride + lane * addr.laneStride;
}

/** Read a single component via canonical arena addressing. */
export function arenaRead(
  arena: Float32Array,
  desc: ArenaSlotDescriptor,
  lane: number,
  component: number,
): number {
  return arena[arenaIndex(desc, lane, component)];
}

/** Write a single component via canonical arena addressing. */
export function arenaWrite(
  arena: Float32Array,
  desc: ArenaSlotDescriptor,
  lane: number,
  component: number,
  value: number,
): void {
  arena[arenaIndex(desc, lane, component)] = value;
}

/** Zero-copy subarray view over the descriptor's region. */
export function arenaSlice(
  arena: Float32Array,
  desc: ArenaSlotDescriptor,
): Float32Array {
  return arena.subarray(desc.offset, desc.offset + desc.length);
}
