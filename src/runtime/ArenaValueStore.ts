/**
 * ArenaValueStore — Float32 arena types and accessors for the unified value store.
 *
 * All runtime values (one-cardinality and many-cardinality) live in one contiguous Float32Array.
 * Descriptors are computed at compile time; read/write/slice are unchecked hot-path ops.
 */

// [LAW:one-source-of-truth] Descriptor is the single authority for slot layout.
export interface ArenaSlotDescriptor {
  readonly offset: number;     // Start index in Float32Array
  readonly stride: number;     // Components per element (1=float, 2=vec2, 3=vec3, 4=color)
  readonly laneCount: number;  // 1=one-cardinality, N=many-cardinality
  readonly length: number;     // = stride * laneCount (stored for fast bounds/subarray)
  /**
   * Component-channel offsets relative to `offset`.
   *
   * Canonical SoA layout uses `componentOffsets[c] = c * laneCount`.
   * Legacy descriptors may omit this field; accessors fall back to that formula.
   */
  readonly componentOffsets?: readonly number[];
}

function componentBase(desc: ArenaSlotDescriptor, component: number): number {
  const offsets = desc.componentOffsets;
  if (offsets && component < offsets.length) return offsets[component]!;
  return component * desc.laneCount;
}

/** Allocate a zeroed Float32Array of `totalFloats` elements. */
export function createArena(totalFloats: number): Float32Array {
  return new Float32Array(totalFloats);
}

/** Read a single component from canonical SoA slot layout. */
export function arenaRead(
  arena: Float32Array,
  desc: ArenaSlotDescriptor,
  lane: number,
  component: number,
): number {
  return arena[desc.offset + componentBase(desc, component) + lane];
}

/** Write a single component into canonical SoA slot layout. */
export function arenaWrite(
  arena: Float32Array,
  desc: ArenaSlotDescriptor,
  lane: number,
  component: number,
  value: number,
): void {
  arena[desc.offset + componentBase(desc, component) + lane] = value;
}

/** Zero-copy raw storage view over the descriptor region (canonical SoA ordering). */
export function arenaSlice(
  arena: Float32Array,
  desc: ArenaSlotDescriptor,
): Float32Array {
  return arena.subarray(desc.offset, desc.offset + desc.length);
}

/**
 * Decode a descriptor region into AoS/interleaved ordering.
 *
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
 * Encode AoS/interleaved input into canonical SoA descriptor storage.
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
