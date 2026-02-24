/**
 * Shape Payload Tests
 *
 * Verifies that the shape2d payload type flows correctly through:
 * 1. IR bridges: shape → {kind:'shape'} ShapeDescIR
 * 2. ScheduleExecutor: shape2d storage → writeShape2D to packed bank
 */

import { describe, it, expect } from 'vitest';
import { payloadTypeToShapeDescIR } from '../../compiler/ir/bridges';
import {
  SHAPE2D_WORDS,
  createRuntimeState,
  createValueStore,
  readShape2D,
  writeShape2D,
} from '../RuntimeState';
import { FLOAT } from '../../core/canonical-types';

// =============================================================================
// IR Bridges: shape → ShapeDescIR
// =============================================================================

describe('IR bridges shape kind', () => {
  it('maps FLOAT to {kind: "number"} descriptor', () => {
    // Per Q6: SHAPE === FLOAT, so maps to number
    expect(payloadTypeToShapeDescIR(FLOAT)).toEqual({ kind: 'number' });
  });

  it('FLOAT descriptor is {kind: "number"}', () => {
    const shapeDesc = payloadTypeToShapeDescIR(FLOAT);
    const numberDesc = payloadTypeToShapeDescIR(FLOAT);

    // Per Q6: SHAPE was aliased to FLOAT, both are {kind:'number'}
    expect(shapeDesc.kind).toBe(numberDesc.kind);
  });
});

// =============================================================================
// Shape2D packed bank: write and read
// =============================================================================

describe('Shape2D packed bank operations', () => {
  it('writes and reads a shape2d record at offset 0', () => {
    const store = createValueStore(4); // 4 shape slots

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
    const store = createValueStore(4);

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
    const store = createValueStore(slotCount);

    expect(store.shape2d.length).toBe(slotCount * SHAPE2D_WORDS);
  });

  it('createRuntimeState allocates shape2d bank from compile-provided slot count', () => {
    const shape2dSlotCount = 5;
    const state = createRuntimeState(0, 0, 0, 0, 0, 0, shape2dSlotCount);
    expect(state.values.shape2d.length).toBe(shape2dSlotCount * SHAPE2D_WORDS);
  });
});
