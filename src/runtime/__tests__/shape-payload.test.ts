/**
 * Shape Payload Tests
 *
 * Verifies that the shape2d payload type flows correctly through:
 * 1. BufferPool: shape → shape2d format → Uint32Array allocation
 * 2. IR bridges: shape → {kind:'shape'} ShapeDescIR
 * 3. ScheduleExecutor: shape2d storage → writeShape2D to packed bank
 */

import { describe, it, expect } from 'vitest';
import { BufferPool, getBufferFormat } from '../BufferPool';
import { payloadTypeToShapeDescIR } from '../../compiler/ir/bridges';
import {
  SHAPE2D_WORDS,
  createValueStore,
  readShape2D,
  writeShape2D,
} from '../RuntimeState';
import { FLOAT, INT, BOOL, } from '../../core/canonical-types';

// =============================================================================
// BufferPool: shape2d format
// =============================================================================

describe('BufferPool shape2d format', () => {
  it('maps shape payload to shape2d format', () => {
    expect(getBufferFormat(SHAPE)).toBe('shape2d');
  });

  it('does NOT map numeric payloads to shape2d', () => {
    expect(getBufferFormat(FLOAT)).toBe('f32');
    expect(getBufferFormat(INT)).toBe('f32');
    expect(getBufferFormat(BOOL)).toBe('f32');
  });

  it('allocates Uint32Array for shape2d format', () => {
    const pool = new BufferPool();
    const buffer = pool.alloc('shape2d', 5);

    expect(buffer).toBeInstanceOf(Uint32Array);
    expect(buffer.byteLength).toBe(5 * SHAPE2D_WORDS * 4); // 5 shapes × 8 words × 4 bytes
  });

  it('allocates Float32Array for f32 format', () => {
    const pool = new BufferPool();
    const buffer = pool.alloc('f32', 10);

    expect(buffer).toBeInstanceOf(Float32Array);
    expect((buffer as Float32Array).length).toBe(10);
  });

  it('reuses shape2d buffers from pool', () => {
    const pool = new BufferPool();
    const buf1 = pool.alloc('shape2d', 3);
    pool.releaseAll();
    const buf2 = pool.alloc('shape2d', 3);

    // Should reuse the same buffer
    expect(buf2).toBe(buf1);
  });

  it('does not cross-contaminate shape2d and f32 pools', () => {
    const pool = new BufferPool();
    const shapeBuf = pool.alloc('shape2d', 10);
    const floatBuf = pool.alloc('f32', 10);

    expect(shapeBuf).toBeInstanceOf(Uint32Array);
    expect(floatBuf).toBeInstanceOf(Float32Array);
    expect(shapeBuf).not.toBe(floatBuf);
  });
});

// =============================================================================
// IR Bridges: shape → ShapeDescIR
// =============================================================================

describe('IR bridges shape kind', () => {
  it('maps shape payload to {kind: "shape"} descriptor', () => {
    expect(payloadTypeToShapeDescIR(SHAPE)).toEqual({ kind: 'shape' });
  });

  it('shape descriptor is distinct from number descriptor', () => {
    const shapeDesc = payloadTypeToShapeDescIR(SHAPE);
    const numberDesc = payloadTypeToShapeDescIR(FLOAT);

    expect(shapeDesc.kind).not.toBe(numberDesc.kind);
  });
});

// =============================================================================
// Shape2D packed bank: write and read
// =============================================================================

describe('Shape2D packed bank operations', () => {
  it('writes and reads a shape2d record at offset 0', () => {
    const store = createValueStore(0, 4); // 4 shape slots

    writeShape2D(store.shape2d, 0, {
      topologyId: 42,
      pointsFieldSlot: 7,
      pointsCount: 12,
      styleRef: 3,
      flags: 0b0110,
    });

    const record = readShape2D(store.shape2d, 0);
    expect(record.topologyId).toBe(42);
    expect(record.pointsFieldSlot).toBe(7);
    expect(record.pointsCount).toBe(12);
    expect(record.styleRef).toBe(3);
    expect(record.flags).toBe(0b0110);
  });

  it('writes and reads at non-zero offset without corruption', () => {
    const store = createValueStore(0, 4);

    // Write to offset 0 and offset 2
    writeShape2D(store.shape2d, 0, {
      topologyId: 1,
      pointsFieldSlot: 10,
      pointsCount: 5,
      styleRef: 0,
      flags: 0,
    });

    writeShape2D(store.shape2d, 2, {
      topologyId: 99,
      pointsFieldSlot: 20,
      pointsCount: 8,
      styleRef: 1,
      flags: 0b0001,
    });

    // Read back and verify no cross-contamination
    const rec0 = readShape2D(store.shape2d, 0);
    const rec2 = readShape2D(store.shape2d, 2);

    expect(rec0.topologyId).toBe(1);
    expect(rec0.pointsFieldSlot).toBe(10);

    expect(rec2.topologyId).toBe(99);
    expect(rec2.pointsFieldSlot).toBe(20);
    expect(rec2.flags).toBe(0b0001);
  });

  it('shape2d bank size matches slot count × SHAPE2D_WORDS', () => {
    const slotCount = 3;
    const store = createValueStore(0, slotCount);

    expect(store.shape2d.length).toBe(slotCount * SHAPE2D_WORDS);
  });
});
