import { describe, it, expect } from 'vitest';
import {
  readSlotValue,
  readEventSlotValue,
  detectAnomalies,
} from '../ValueInspector';
import type { SlotLookup } from '../SlotLookupCache';
import type { SlotMetaEntry, ValueSlot } from '../../compiler/ir/program';
import { createRuntimeState } from '../RuntimeState';
import { canonicalSignal } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types/payloads';
import { unitNone } from '../../core/canonical-types/units';
import { valueSlot } from '../../compiler/ir/Indices';
import type { SlotValue } from '../StepDebugTypes';

const SIG_FLOAT = canonicalSignal(FLOAT, unitNone());

function makeLookup(slot: number, storage: SlotLookup['storage'], offset: number, stride: number): SlotLookup {
  return { storage, offset, stride, slot: valueSlot(slot) };
}

function makeMeta(slot: number, storage: SlotMetaEntry['storage'], offset: number, stride: number): SlotMetaEntry {
  return { slot: valueSlot(slot), storage, offset, stride, type: SIG_FLOAT };
}

describe('readSlotValue', () => {
  it('reads scalar f64 value', () => {
    const state = createRuntimeState(10);
    state.values.f64[3] = 42.5;

    const lookup = makeLookup(3, 'f64', 3, 1);
    const meta = makeMeta(3, 'f64', 3, 1);
    const value = readSlotValue(state, lookup, meta);

    expect(value.kind).toBe('scalar');
    if (value.kind === 'scalar') {
      expect(value.value).toBe(42.5);
      expect(value.type).toBe(SIG_FLOAT);
    }
  });

  it('reads strided f64 value (vec3)', () => {
    const state = createRuntimeState(20);
    state.values.f64[5] = 1.0;
    state.values.f64[6] = 2.0;
    state.values.f64[7] = 3.0;

    const lookup = makeLookup(5, 'f64', 5, 3);
    const meta = makeMeta(5, 'f64', 5, 3);
    const value = readSlotValue(state, lookup, meta);

    expect(value.kind).toBe('buffer');
    if (value.kind === 'buffer') {
      expect(value.count).toBe(3);
      expect(Array.from(value.buffer as Float64Array)).toEqual([1.0, 2.0, 3.0]);
    }
  });

  it('reads object (Float32Array field buffer)', () => {
    const state = createRuntimeState(10);
    const buffer = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    state.values.objects.set(valueSlot(2), buffer);

    const lookup = makeLookup(2, 'object', 0, 0);
    const meta = makeMeta(2, 'object', 0, 0);
    const value = readSlotValue(state, lookup, meta);

    expect(value.kind).toBe('buffer');
    if (value.kind === 'buffer') {
      expect(value.count).toBe(4);
      expect(value.buffer).toBe(buffer);
    }
  });

  it('reads non-typed-array object', () => {
    const state = createRuntimeState(10);
    const obj = { custom: true };
    state.values.objects.set(valueSlot(4), obj);

    const lookup = makeLookup(4, 'object', 0, 0);
    const meta = makeMeta(4, 'object', 0, 0);
    const value = readSlotValue(state, lookup, meta);

    expect(value.kind).toBe('object');
    if (value.kind === 'object') {
      expect(value.ref).toBe(obj);
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
