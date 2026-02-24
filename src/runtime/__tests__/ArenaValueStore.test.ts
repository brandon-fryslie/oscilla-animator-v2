import { describe, it, expect } from 'vitest';
import {
  type ArenaSlotDescriptor,
  createArena,
  arenaDecodeToAoS,
  arenaEncodeFromAoS,
  arenaRead,
  arenaWrite,
  arenaSlice,
  resolveArenaAddress,
  arenaIndex,
} from '../ArenaValueStore';

function desc(offset: number, stride: number, laneCount: number): ArenaSlotDescriptor {
  return { offset, stride, laneCount, length: stride * laneCount };
}

describe('createArena', () => {
  it('returns a Float32Array of the requested size, zero-initialized', () => {
    const arena = createArena(64);
    expect(arena).toBeInstanceOf(Float32Array);
    expect(arena.length).toBe(64);
    expect(arena.every((v) => v === 0)).toBe(true);
  });
});

describe('arenaRead / arenaWrite round-trip', () => {
  it('float (stride=1, single lane)', () => {
    const arena = createArena(8);
    const d = desc(2, 1, 1);
    arenaWrite(arena, d, 0, 0, 42.5);
    expect(arenaRead(arena, d, 0, 0)).toBeCloseTo(42.5);
  });

  it('vec3 (stride=3, single lane)', () => {
    const arena = createArena(16);
    const d = desc(4, 3, 1);
    arenaWrite(arena, d, 0, 0, 1.0);
    arenaWrite(arena, d, 0, 1, 2.0);
    arenaWrite(arena, d, 0, 2, 3.0);
    expect(arenaRead(arena, d, 0, 0)).toBeCloseTo(1.0);
    expect(arenaRead(arena, d, 0, 1)).toBeCloseTo(2.0);
    expect(arenaRead(arena, d, 0, 2)).toBeCloseTo(3.0);
  });

  it('color (stride=4, single lane)', () => {
    const arena = createArena(16);
    const d = desc(0, 4, 1);
    arenaWrite(arena, d, 0, 0, 0.1);
    arenaWrite(arena, d, 0, 1, 0.2);
    arenaWrite(arena, d, 0, 2, 0.3);
    arenaWrite(arena, d, 0, 3, 1.0);
    expect(arenaRead(arena, d, 0, 0)).toBeCloseTo(0.1);
    expect(arenaRead(arena, d, 0, 1)).toBeCloseTo(0.2);
    expect(arenaRead(arena, d, 0, 2)).toBeCloseTo(0.3);
    expect(arenaRead(arena, d, 0, 3)).toBeCloseTo(1.0);
  });
});

describe('multi-lane field', () => {
  it('writes to lane 0 and lane N-1 without cross-lane bleed', () => {
    const laneCount = 8;
    const arena = createArena(32);
    const d = desc(0, 3, laneCount); // vec3 × 8 lanes = 24 floats

    // Write to lane 0
    arenaWrite(arena, d, 0, 0, 10.0);
    arenaWrite(arena, d, 0, 1, 11.0);
    arenaWrite(arena, d, 0, 2, 12.0);

    // Write to lane 7
    arenaWrite(arena, d, 7, 0, 70.0);
    arenaWrite(arena, d, 7, 1, 71.0);
    arenaWrite(arena, d, 7, 2, 72.0);

    // Lane 0 intact
    expect(arenaRead(arena, d, 0, 0)).toBeCloseTo(10.0);
    expect(arenaRead(arena, d, 0, 1)).toBeCloseTo(11.0);
    expect(arenaRead(arena, d, 0, 2)).toBeCloseTo(12.0);

    // Lane 7 intact
    expect(arenaRead(arena, d, 7, 0)).toBeCloseTo(70.0);
    expect(arenaRead(arena, d, 7, 1)).toBeCloseTo(71.0);
    expect(arenaRead(arena, d, 7, 2)).toBeCloseTo(72.0);

    // Intermediate lanes untouched
    for (let lane = 1; lane < 7; lane++) {
      for (let c = 0; c < 3; c++) {
        expect(arenaRead(arena, d, lane, c)).toBe(0);
      }
    }
  });
});

describe('arenaSlice', () => {
  it('returns a subarray view (not a copy)', () => {
    const arena = createArena(16);
    const d = desc(4, 2, 3); // offset=4, 2 components × 3 lanes = 6 floats

    // Write through the slice
    const slice = arenaSlice(arena, d);
    expect(slice.length).toBe(6);
    slice[0] = 99.0;

    // Visible in parent arena
    expect(arena[4]).toBeCloseTo(99.0);

    // Write through parent, visible in slice
    arena[5] = 88.0;
    expect(slice[1]).toBeCloseTo(88.0);
  });
});

describe('SoA encode/decode', () => {
  it('encodes AoS into SoA storage and decodes back losslessly', () => {
    const arena = createArena(12);
    const d = desc(0, 3, 4); // vec3 x 4 lanes
    const aos = new Float32Array([
      1, 2, 3,
      4, 5, 6,
      7, 8, 9,
      10, 11, 12,
    ]);

    arenaEncodeFromAoS(arena, d, aos);

    // SoA channels are contiguous by component: xxxx yyyy zzzz
    const raw = arenaSlice(arena, d);
    expect(Array.from(raw)).toEqual([
      1, 4, 7, 10,
      2, 5, 8, 11,
      3, 6, 9, 12,
    ]);

    const roundTrip = arenaDecodeToAoS(arena, d);
    expect(Array.from(roundTrip)).toEqual(Array.from(aos));
  });
});

describe('descriptor invariant', () => {
  it('length === stride * laneCount', () => {
    const d = desc(10, 3, 5);
    expect(d.length).toBe(d.stride * d.laneCount);
  });

  it('resolves canonical SoA address defaults', () => {
    const d = desc(3, 4, 5);
    const addr = resolveArenaAddress(d);
    expect(addr.baseOffset).toBe(3);
    expect(addr.laneStride).toBe(1);
    expect(addr.componentStride).toBe(5);
    expect(arenaIndex(d, 2, 3)).toBe(3 + 3 * 5 + 2);
  });

  it('supports explicit AoS addressing metadata for compatibility descriptors', () => {
    const d: ArenaSlotDescriptor = {
      offset: 3,
      stride: 4,
      laneCount: 5,
      length: 20,
      packing: 'aos',
    };
    const addr = resolveArenaAddress(d);
    expect(addr.laneStride).toBe(4);
    expect(addr.componentStride).toBe(1);
    expect(arenaIndex(d, 2, 3)).toBe(3 + 2 * 4 + 3);
  });

  it('supports canonical SoA addressing metadata', () => {
    const d: ArenaSlotDescriptor = {
      offset: 10,
      stride: 3,
      laneCount: 4,
      length: 12,
      packing: 'soa',
    };
    const addr = resolveArenaAddress(d);
    expect(addr.laneStride).toBe(1);
    expect(addr.componentStride).toBe(4);
    expect(arenaIndex(d, 2, 1)).toBe(10 + 1 * 4 + 2);
  });
});

describe('non-overlapping descriptors', () => {
  it('adjacent descriptors do not interfere', () => {
    const arena = createArena(8);
    const d1 = desc(0, 2, 1); // floats [0,1]
    const d2 = desc(2, 2, 1); // floats [2,3]

    arenaWrite(arena, d1, 0, 0, 1.0);
    arenaWrite(arena, d1, 0, 1, 2.0);
    arenaWrite(arena, d2, 0, 0, 3.0);
    arenaWrite(arena, d2, 0, 1, 4.0);

    expect(arenaRead(arena, d1, 0, 0)).toBeCloseTo(1.0);
    expect(arenaRead(arena, d1, 0, 1)).toBeCloseTo(2.0);
    expect(arenaRead(arena, d2, 0, 0)).toBeCloseTo(3.0);
    expect(arenaRead(arena, d2, 0, 1)).toBeCloseTo(4.0);
  });
});
