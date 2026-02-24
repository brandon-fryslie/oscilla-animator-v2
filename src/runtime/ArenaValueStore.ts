/**
 * ArenaValueStore — Float32 arena types and accessors for the unified value store.
 *
 * All runtime values (one-cardinality and many-cardinality) live in one contiguous Float32Array.
 * Descriptors are computed at compile time; read/write/slice are unchecked hot-path ops.
 *
 * Canonical layout for multi-component many-cardinality payloads is SoA:
 * component-major, then lane (`component * laneCount + lane`).
 */

// [LAW:one-source-of-truth] Descriptor is the single authority for slot layout.
export interface ArenaSlotDescriptor {
  readonly offset: number;     // Start index in Float32Array
  readonly stride: number;     // Components per element (1=float, 2=vec2, 3=vec3, 4=color)
  readonly laneCount: number;  // 1=one-cardinality, N=many-cardinality
  readonly length: number;     // = stride * laneCount (stored for fast bounds/subarray)
}

/**
 * Canonical SoA index inside a slot descriptor region.
 */
export function arenaIndex(
  desc: ArenaSlotDescriptor,
  lane: number,
  component: number,
): number {
  return desc.offset + component * desc.laneCount + lane;
}

/** Allocate a zeroed Float32Array of `totalFloats` elements. */
export function createArena(totalFloats: number): Float32Array {
  return new Float32Array(totalFloats);
}

/** Read a single component from canonical SoA storage. */
export function arenaRead(
  arena: Float32Array,
  desc: ArenaSlotDescriptor,
  lane: number,
  component: number,
): number {
  return arena[arenaIndex(desc, lane, component)];
}

/** Write a single component to canonical SoA storage. */
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
