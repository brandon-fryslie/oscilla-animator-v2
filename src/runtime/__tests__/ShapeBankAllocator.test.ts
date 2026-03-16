import { describe, expect, it } from 'vitest';
import {
  SHAPE_BANK_HEADER_WORDS,
  allocShapeBankWords,
  createShapeBankHeaderV1,
  createRuntimeState,
  readShapeBankHeader,
  resetFrameVolatileShapeBank,
  writeShapeBankHeader,
} from '../RuntimeState';

describe('ShapeBank allocator', () => {
  it('starts volatile allocation at static boundary and allocates linearly', () => {
    const state = createRuntimeState(
      0, // stateSlotCount
      0, // eventSlotCount
      0, // valueExprCount
      0, // arenaTotalFloats
      64, // shapeBankWordCapacity
      16, // shapeBankStaticBoundary
    );
    expect(state.shapeBank).toBeDefined();
    expect(state.shapeBank?.volatilePtr).toBe(16);

    const first = allocShapeBankWords(state.shapeBank!, SHAPE_BANK_HEADER_WORDS);
    const second = allocShapeBankWords(state.shapeBank!, SHAPE_BANK_HEADER_WORDS);

    expect(first).toBe(16);
    expect(second).toBe(32);
    expect(state.shapeBank?.volatilePtr).toBe(48);
  });

  it('resets volatile pointer to static boundary at frame start', () => {
    const state = createRuntimeState(0, 0, 0, 0, 64, 16);
    allocShapeBankWords(state.shapeBank!, 8);
    expect(state.shapeBank?.volatilePtr).toBe(24);

    resetFrameVolatileShapeBank(state);
    expect(state.shapeBank?.volatilePtr).toBe(16);
  });

  it('throws on out-of-capacity allocation', () => {
    const state = createRuntimeState(0, 0, 0, 0, 10, 8);
    expect(() => allocShapeBankWords(state.shapeBank!, 3))
      .toThrow(/out of capacity/);
  });

  it('writes and reads strict shape header fields', () => {
    const state = createRuntimeState(0, 0, 0, 0, 32, 0);
    const handle = allocShapeBankWords(state.shapeBank!, SHAPE_BANK_HEADER_WORDS);

    writeShapeBankHeader(state.shapeBank!.data, handle, createShapeBankHeaderV1({
      kind: 7,
      topologyMode: 1,
      indexCount: 33,
      firstIndex: 1024,
      baseVertex: 9,
      vertexCount: 17,
      firstVertex: 11,
      flags: 0b101,
      materialClass: 3,
      paramBlockOffset: 2048,
      paramBlockWords: 6,
      boundsMinPacked: 123,
      boundsMaxPacked: 456,
      cpArenaBaseOffset: 1,
      cpArenaLaneStride: 2,
      cpArenaComponentStride: 3,
    }));

    expect(readShapeBankHeader(state.shapeBank!.data, handle)).toEqual({
      kind: 7,
      topologyMode: 1,
      flags: 0b101,
      materialClass: 3,
      indexCount: 33,
      firstIndex: 1024,
      baseVertex: 9,
      vertexCount: 17,
      firstVertex: 11,
      paramBlockOffset: 2048,
      paramBlockWords: 6,
      cpArenaBaseOffset: 1,
      boundsMinPacked: 123,
      boundsMaxPacked: 456,
      cpArenaLaneStride: 2,
      cpArenaComponentStride: 3,
    });
  });
});
