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
  readonly offset: number;
  readonly stride: number;
  readonly laneCount: number;
  readonly length: number;
  readonly componentOffsets?: readonly number[];
  readonly packing?: ArenaPacking;
  readonly laneStride?: number;
  readonly componentStride?: number;
}

/** Allocate a zeroed Float32Array of `totalFloats` elements. */
export function createArena(totalFloats: number): Float32Array {
  return new Float32Array(totalFloats);
}

/**
 * Canonical per-slot arena address normalization.
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
  const componentOffsets = desc.componentOffsets;
  if (componentOffsets && component < componentOffsets.length) {
    const laneStride = desc.laneStride ?? 1;
    return desc.offset + componentOffsets[component]! + lane * laneStride;
  }
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

/**
 * Decode a descriptor region into AoS/interleaved ordering.
 * Output layout: [lane0.c0, lane0.c1, ..., lane1.c0, lane1.c1, ...]
 */
export function arenaDecodeToAoS(
  arena: Float32Array,
  desc: ArenaSlotDescriptor,
  out?: Float32Array,
): Float32Array {
  const target = out && out.length >= desc.length ? out : new Float32Array(desc.length);
  for (let lane = 0; lane < desc.laneCount; lane++) {
    const base = lane * desc.stride;
    for (let component = 0; component < desc.stride; component++) {
      target[base + component] = arenaRead(arena, desc, lane, component);
    }
  }
  return target;
}

/**
 * Encode AoS/interleaved input into descriptor storage.
 */
export function arenaEncodeFromAoS(
  arena: Float32Array,
  desc: ArenaSlotDescriptor,
  src: ArrayLike<number>,
): void {
  for (let lane = 0; lane < desc.laneCount; lane++) {
    const base = lane * desc.stride;
    for (let component = 0; component < desc.stride; component++) {
      arenaWrite(arena, desc, lane, component, src[base + component] as number);
    }
  }
}

/**
 * Copy an interleaved AoS buffer into canonical SoA layout.
 */
export function copyAosToSoa(
  source: Float32Array,
  target: Float32Array,
  laneCount: number,
  stride: number,
): void {
  for (let lane = 0; lane < laneCount; lane++) {
    const aosBase = lane * stride;
    for (let component = 0; component < stride; component++) {
      target[component * laneCount + lane] = source[aosBase + component];
    }
  }
}

/**
 * Copy canonical SoA layout into interleaved AoS layout.
 */
export function copySoaToAos(
  source: Float32Array,
  target: Float32Array,
  laneCount: number,
  stride: number,
): void {
  for (let lane = 0; lane < laneCount; lane++) {
    const aosBase = lane * stride;
    for (let component = 0; component < stride; component++) {
      target[aosBase + component] = source[component * laneCount + lane];
    }
  }
}
