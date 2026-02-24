import { describe, it, expect } from 'vitest';
import {
  readSlotValue,
  readEventSlotValue,
  detectAnomalies,
} from '../ValueInspector';
import type { SlotLookup } from '../ExprAddressTable';
import type { ValueSlot } from '../../compiler/ir/Indices';
import { createRuntimeState, writeShape2D } from '../RuntimeState';
import { canonicalScalar } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types/payloads';
import { unitNone } from '../../core/canonical-types/units';
import { valueSlot } from '../../compiler/ir/Indices';
import type { SlotValue } from '../StepDebugTypes';

const SIG_FLOAT = canonicalScalar(FLOAT, unitNone());

function makeLookup(slot: number, storage: SlotLookup['storage'], offset: number, stride: number): SlotLookup {
  return {
    storage,
    offset,
    stride,
    slot: valueSlot(slot),
    type: SIG_FLOAT,
    arena: {
      offset,
      stride,
      laneCount: 1,
      length: Math.max(1, stride),
      packing: 'aos',
      laneStride: Math.max(1, stride),
      componentStride: 1,
    },
  };
}

describe('readSlotValue', () => {
  it('reads scalar f32 value', () => {
    const state = createRuntimeState(10, 0, 0, 0, 0, 20);
    state.arena[3] = 42.5;

    const lookup = makeLookup(3, 'f32', 3, 1);
    const value = readSlotValue(
      state,
      lookup,
      new Map([[valueSlot(3), { offset: 3, stride: 1, laneCount: 1, length: 1 }]])
    );

    expect(value.kind).toBe('scalar');
    if (value.kind === 'scalar') {
      expect(value.value).toBe(42.5);
      expect(value.type).toBe(SIG_FLOAT);
    }
  });

  it('reads strided f32 value (vec3)', () => {
    const state = createRuntimeState(20, 0, 0, 0, 0, 40);
    state.arena[5] = 1.0;
    state.arena[6] = 2.0;
    state.arena[7] = 3.0;

    const lookup = makeLookup(5, 'f32', 5, 3);
    const value = readSlotValue(
      state,
      lookup,
      new Map([[valueSlot(5), { offset: 5, stride: 3, laneCount: 1, length: 3 }]])
    );

    expect(value.kind).toBe('buffer');
    if (value.kind === 'buffer') {
      expect(value.count).toBe(3);
      expect(Array.from(value.buffer as Float64Array)).toEqual([1.0, 2.0, 3.0]);
    }
  });

  it('reads shape2d records from the canonical shape2d bank', () => {
    const state = createRuntimeState(10);
    state.values.shape2d = new Uint32Array(8);
    writeShape2D(state.values.shape2d, 0, {
      topologyId: 7,
      pointsFieldSlot: 13,
      pointsCount: 24,
      styleRef: 2,
      flags: 5,
    });

    const lookup = makeLookup(4, 'shape2d', 0, 1);
    const value = readSlotValue(state, lookup);

    expect(value.kind).toBe('object');
    if (value.kind === 'object') {
      expect(value.ref).toEqual({
        topologyId: 7,
        pointsFieldSlot: 13,
        pointsCount: 24,
        styleRef: 2,
        flags: 5,
      });
    }
  });
});

describe('readEventSlotValue', () => {
  it('reads unfired event', () => {
    const state = createRuntimeState(10, 0, 5);
    state.eventScalars[2] = 0;

    const value = readEventSlotValue(state, 2);
    expect(value).toEqual({ kind: 'event', fired: false });
  });

  it('reads fired event', () => {
    const state = createRuntimeState(10, 0, 5);
    state.eventScalars[2] = 1;

    const value = readEventSlotValue(state, 2);
    expect(value).toEqual({ kind: 'event', fired: true });
  });
});

describe('detectAnomalies', () => {
  it('detects NaN in scalar value', () => {
    const slots = new Map<ValueSlot, SlotValue>();
    slots.set(valueSlot(1), { kind: 'scalar', value: NaN, type: SIG_FLOAT });

    const anomalies = detectAnomalies(slots);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].kind).toBe('nan');
    expect(anomalies[0].slot).toBe(valueSlot(1));
  });

  it('detects Infinity', () => {
    const slots = new Map<ValueSlot, SlotValue>();
    slots.set(valueSlot(2), { kind: 'scalar', value: Infinity, type: SIG_FLOAT });

    const anomalies = detectAnomalies(slots);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].kind).toBe('infinity');
  });

  it('detects -Infinity', () => {
    const slots = new Map<ValueSlot, SlotValue>();
    slots.set(valueSlot(3), { kind: 'scalar', value: -Infinity, type: SIG_FLOAT });

    const anomalies = detectAnomalies(slots);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].kind).toBe('neg-infinity');
  });

  it('detects NaN in Float32Array buffer', () => {
    const slots = new Map<ValueSlot, SlotValue>();
    const buf = new Float32Array([1.0, NaN, 3.0]);
    slots.set(valueSlot(4), { kind: 'buffer', buffer: buf, count: 3, type: SIG_FLOAT });

    const anomalies = detectAnomalies(slots);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].kind).toBe('nan');
  });

  it('returns empty for normal values', () => {
    const slots = new Map<ValueSlot, SlotValue>();
    slots.set(valueSlot(1), { kind: 'scalar', value: 42, type: SIG_FLOAT });
    slots.set(valueSlot(2), { kind: 'event', fired: true });

    const anomalies = detectAnomalies(slots);
    expect(anomalies).toHaveLength(0);
  });

  it('uses debugIndex for block/port provenance', () => {
    const slots = new Map<ValueSlot, SlotValue>();
    slots.set(valueSlot(1), { kind: 'scalar', value: NaN, type: SIG_FLOAT });

    const debugIndex = {
      stepToBlock: new Map(),
      slotToBlock: new Map([[valueSlot(1), 99 as any]]),
      exprToBlock: new Map(),
      ports: [],
      slotToPort: new Map([[valueSlot(1), 'p1' as any]]),
      blockMap: new Map(),
    };

    const anomalies = detectAnomalies(slots, debugIndex);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].blockId).toBe(99);
    expect(anomalies[0].portId).toBe('p1');
  });
});
