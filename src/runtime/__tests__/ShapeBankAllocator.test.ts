import { describe, expect, it } from 'vitest';
import {
  SHAPE_BANK_HEADER_WORDS,
  allocShapeBankWords,
  createRuntimeState,
  readShapeBankHeader,
  resetFrameVolatileShapeBank,
  writeShapeBankHeader,
} from '../RuntimeState';

describe('ShapeBank allocator', () => {
  it('starts volatile allocation at static boundary and allocates linearly', () => {
    const state = createRuntimeState(
      0, // slotCount (compat arg)
      0, // stateSlotCount
      0, // eventSlotCount
      0, // eventExprCount
      0, // valueExprCount
      0, // arenaTotalFloats
      0, // shape2dSlotCount
      32, // shapeBankWordCapacity
      8, // shapeBankStaticBoundary
    );
    expect(state.shapeBank).toBeDefined();
    expect(state.shapeBank?.volatilePtr).toBe(8);

    const first = allocShapeBankWords(state.shapeBank!, SHAPE_BANK_HEADER_WORDS);
    const second = allocShapeBankWords(state.shapeBank!, SHAPE_BANK_HEADER_WORDS);

    expect(first).toBe(8);
    expect(second).toBe(12);
    expect(state.shapeBank?.volatilePtr).toBe(16);
  });

  it('resets volatile pointer to static boundary at frame start', () => {
    const state = createRuntimeState(0, 0, 0, 0, 0, 0, 0, 64, 16);
    allocShapeBankWords(state.shapeBank!, 8);
    expect(state.shapeBank?.volatilePtr).toBe(24);

    resetFrameVolatileShapeBank(state);
    expect(state.shapeBank?.volatilePtr).toBe(16);
  });

  it('throws on out-of-capacity allocation', () => {
    const state = createRuntimeState(0, 0, 0, 0, 0, 0, 0, 10, 8);
    expect(() => allocShapeBankWords(state.shapeBank!, 3))
      .toThrow(/out of capacity/);
  });

  it('writes and reads strict shape header fields', () => {
    const state = createRuntimeState(0, 0, 0, 0, 0, 0, 0, 32, 0);
    const handle = allocShapeBankWords(state.shapeBank!, SHAPE_BANK_HEADER_WORDS);

    writeShapeBankHeader(state.shapeBank!.data, handle, {
      indexCount: 33,
      indexOffset: 1024,
      vertexCount: 17,
      flags: 0b101,
    });

    expect(readShapeBankHeader(state.shapeBank!.data, handle)).toEqual({
      indexCount: 33,
      indexOffset: 1024,
      vertexCount: 17,
      flags: 0b101,
    });
  });
});
