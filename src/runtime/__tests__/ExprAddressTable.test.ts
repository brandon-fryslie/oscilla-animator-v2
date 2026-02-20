import { describe, it, expect } from 'vitest';
import {
  getExprAddressTable,
  assertSlotExists,
  assertF64Stride,
} from '../ExprAddressTable';
import type { CompiledProgramIR, SlotMetaEntry } from '../../compiler/ir/program';
import type { ScheduleIR } from '../../compiler/backend/schedule-program';
import { valueSlot, type ValueSlot } from '../../compiler/ir/Indices';
import { canonicalSignal, canonicalField, FLOAT, unitNone, instanceRef } from '../../core/canonical-types';

const SIG_FLOAT = canonicalSignal(FLOAT, unitNone());
const FIELD_FLOAT = canonicalField(FLOAT, unitNone(), instanceRef('d', 'i'));

/**
 * Build a minimal mock CompiledProgramIR sufficient for ExprAddressTable tests.
 */
function mockProgram(opts: {
  slotMeta: SlotMetaEntry[];
  steps: ScheduleIR['steps'];
}): CompiledProgramIR {
  return {
    slotMeta: opts.slotMeta,
    schedule: {
      steps: opts.steps,
      timeModel: {} as any,
      instances: new Map(),
      stateMappings: [],
      stateSlotCount: 0,
      eventSlotCount: 0,
      eventCount: 0,
    } as ScheduleIR,
    // Remaining fields aren't accessed by getExprAddressTable
    irVersion: 1,
    valueExprs: { nodes: [] },
    constants: { json: [] },
    outputs: [],
    debugIndex: {
      stepToBlock: new Map(),
      slotToBlock: new Map(),
      exprToBlock: new Map(),
      ports: [],
      slotToPort: new Map(),
      blockMap: new Map(),
    },
    fieldSlotRegistry: new Map(),
    renderGlobals: [],
    kernelRegistry: { resolve: () => undefined, entries: () => [] } as any,
    arenaLayout: [],
    arenaTotalFloats: 0,
  } as CompiledProgramIR;
}

describe('getExprAddressTable', () => {
  it('builds slotLookup from slotMeta', () => {
    const program = mockProgram({
      slotMeta: [
        { slot: valueSlot(0), storage: 'f64', offset: 0, stride: 1, type: SIG_FLOAT },
        { slot: valueSlot(1), storage: 'object', offset: 0, stride: 1, type: FIELD_FLOAT },
        { slot: valueSlot(2), storage: 'f64', offset: 1, stride: 3, type: SIG_FLOAT },
      ],
      steps: [],
    });

    const table = getExprAddressTable(program);
    expect(table.slotLookup.size).toBe(3);
    expect(table.slotLookup.get(valueSlot(0))).toEqual({
      storage: 'f64', offset: 0, stride: 1, slot: valueSlot(0),
    });
    expect(table.slotLookup.get(valueSlot(1))).toEqual({
      storage: 'object', offset: 0, stride: 1, slot: valueSlot(1),
    });
    expect(table.slotLookup.get(valueSlot(2))).toEqual({
      storage: 'f64', offset: 1, stride: 3, slot: valueSlot(2),
    });
  });

  it('builds fieldExprToSlot from materialize steps', () => {
    const program = mockProgram({
      slotMeta: [
        { slot: valueSlot(5), storage: 'object', offset: 0, stride: 1, type: FIELD_FLOAT },
      ],
      steps: [
        { kind: 'materialize', field: 10 as any, target: valueSlot(5), instanceId: 'inst' as any },
      ],
    });

    const table = getExprAddressTable(program);
    expect(table.fieldExprToSlot.get(10)).toBe(valueSlot(5));
  });

  it('builds sigToF64Offset from evalValue steps', () => {
    const program = mockProgram({
      slotMeta: [
        { slot: valueSlot(3), storage: 'f64', offset: 7, stride: 1, type: SIG_FLOAT },
      ],
      steps: [
        {
          kind: 'evalValue',
          expr: 42 as any,
          target: { storage: 'value' as const, slot: valueSlot(3) },
          strategy: 0 as any,
        },
      ],
    });

    const table = getExprAddressTable(program);
    expect(table.sigToF64Offset.get(42)).toBe(7);
  });

  it('caches table per program identity', () => {
    const program = mockProgram({
      slotMeta: [
        { slot: valueSlot(0), storage: 'f64', offset: 0, stride: 1, type: SIG_FLOAT },
      ],
      steps: [],
    });

    const table1 = getExprAddressTable(program);
    const table2 = getExprAddressTable(program);
    expect(table1).toBe(table2);
  });

  it('different programs get different tables', () => {
    const p1 = mockProgram({
      slotMeta: [{ slot: valueSlot(0), storage: 'f64', offset: 0, stride: 1, type: SIG_FLOAT }],
      steps: [],
    });
    const p2 = mockProgram({
      slotMeta: [{ slot: valueSlot(0), storage: 'f64', offset: 5, stride: 1, type: SIG_FLOAT }],
      steps: [],
    });

    const t1 = getExprAddressTable(p1);
    const t2 = getExprAddressTable(p2);
    expect(t1).not.toBe(t2);
    expect(t1.slotLookup.get(valueSlot(0))!.offset).toBe(0);
    expect(t2.slotLookup.get(valueSlot(0))!.offset).toBe(5);
  });
});

describe('assertSlotExists', () => {
  it('returns lookup for existing slot', () => {
    const table = getExprAddressTable(mockProgram({
      slotMeta: [{ slot: valueSlot(1), storage: 'f64', offset: 0, stride: 1, type: SIG_FLOAT }],
      steps: [],
    }));
    const result = assertSlotExists(table.slotLookup, valueSlot(1), 'test');
    expect(result.slot).toBe(valueSlot(1));
  });

  it('throws for missing slot', () => {
    const table = getExprAddressTable(mockProgram({
      slotMeta: [],
      steps: [],
    }));
    expect(() => assertSlotExists(table.slotLookup, valueSlot(99), 'test'))
      .toThrow(/Missing slotMeta entry for test/);
  });
});

describe('assertF64Stride', () => {
  it('returns lookup for matching f64 slot', () => {
    const table = getExprAddressTable(mockProgram({
      slotMeta: [{ slot: valueSlot(0), storage: 'f64', offset: 0, stride: 4, type: SIG_FLOAT }],
      steps: [],
    }));
    const result = assertF64Stride(table.slotLookup, valueSlot(0), 4, 'test');
    expect(result.stride).toBe(4);
  });

  it('throws for non-f64 storage', () => {
    const table = getExprAddressTable(mockProgram({
      slotMeta: [{ slot: valueSlot(0), storage: 'object', offset: 0, stride: 1, type: FIELD_FLOAT }],
      steps: [],
    }));
    expect(() => assertF64Stride(table.slotLookup, valueSlot(0), 1, 'test'))
      .toThrow(/must be f64 storage/);
  });

  it('throws for stride mismatch', () => {
    const table = getExprAddressTable(mockProgram({
      slotMeta: [{ slot: valueSlot(0), storage: 'f64', offset: 0, stride: 1, type: SIG_FLOAT }],
      steps: [],
    }));
    expect(() => assertF64Stride(table.slotLookup, valueSlot(0), 4, 'test'))
      .toThrow(/must have stride=4, got 1/);
  });
});
