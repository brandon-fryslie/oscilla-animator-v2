import { describe, it, expect } from 'vitest';
import {
  getExprAddressTable,
  assertSlotExists,
  assertNumericStride,
} from '../ExprAddressTable';
import type { CompiledProgramIR, SlotMetaEntry } from '../../compiler/ir/program';
import { EMPTY_PROGRAM_TOPOLOGY_TABLE } from '../../compiler/ir/program-topology';
import type { ScheduleIR } from '../../compiler/backend/schedule-program';
import { SCALAR_INSTANCE_ID, valueSlot, type ValueSlot } from '../../compiler/ir/Indices';
import { canonicalScalar, canonicalMany, FLOAT, unitNone, instanceRef } from '../../core/canonical-types';

const SIG_FLOAT = canonicalScalar(FLOAT, unitNone());
const FIELD_FLOAT = canonicalMany(FLOAT, unitNone(), instanceRef('d', 'i'));

/**
 * Build a minimal mock CompiledProgramIR sufficient for ExprAddressTable tests.
 */
function mockProgram(opts: {
  slotMeta: SlotMetaEntry[];
  steps: ScheduleIR['steps'];
}): CompiledProgramIR {
  const toRuntimeStorage = (storage: SlotMetaEntry['storage']): 'f32' | 'i32' | 'u32' =>
    storage;
  const maxSlot = opts.slotMeta.reduce((max, meta) => Math.max(max, Number(meta.slot)), -1);
  const arenaLayout = Array.from({ length: maxSlot + 1 }, () => ({
    offset: -1,
    stride: 0,
    laneCount: 0,
    length: 0,
    packing: 'aos' as const,
    laneStride: 0,
    componentStride: 1,
  }));
  for (const meta of opts.slotMeta) {
    arenaLayout[Number(meta.slot)] = {
      offset: meta.offset,
      stride: meta.stride,
      laneCount: 1,
      length: meta.stride,
      packing: 'aos',
      laneStride: meta.stride,
      componentStride: 1,
    };
  }
  const runtimeSlots = opts.slotMeta.map((meta) => ({
    slot: meta.slot,
    storage: toRuntimeStorage(meta.storage),
    offset: meta.offset,
    stride: meta.stride,
    type: meta.type,
    arena: arenaLayout[Number(meta.slot)]!,
  }));
  const slotLookup = new Map<ValueSlot, any>();
  const slotToArena = new Map<ValueSlot, any>();
  for (const slot of runtimeSlots) {
    slotLookup.set(slot.slot, {
      storage: slot.storage,
      offset: slot.offset,
      stride: slot.stride,
      slot: slot.slot,
      type: slot.type,
      arena: slot.arena,
    });
    if (slot.arena.offset >= 0) {
      slotToArena.set(slot.slot, slot.arena);
    }
  }
  const fieldExprToSlot = new Map<number, ValueSlot>();
  const scalarExprToArenaAddress = new Map<number, { slot: ValueSlot; arena: (typeof arenaLayout)[number]; component: number }>();
  for (const step of opts.steps) {
    if (step.kind === 'materialize') {
      fieldExprToSlot.set(step.field as any as number, step.target);
      if (step.instanceId === SCALAR_INSTANCE_ID) {
        const arenaDesc = slotToArena.get(step.target);
        if (arenaDesc) {
          scalarExprToArenaAddress.set(step.field as any as number, {
            slot: step.target,
            arena: arenaDesc,
            component: 0,
          });
        }
      }
    }
  }
  const runtimeAddressTable = {
    slotLookup,
    fieldExprToSlot,
    scalarExprToArenaAddress,
    slotToArena,
  };
  return {
    slotMeta: opts.slotMeta,
    runtimeSlots,
    runtimeAddressTable,
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
    topologyTable: EMPTY_PROGRAM_TOPOLOGY_TABLE,
    arenaLayout,
    arenaPayloadFloats: arenaLayout.reduce((sum, d) => sum + Math.max(0, d.length), 0),
    arenaTotalFloats: 0,
    drawPrepProgram: {
      totalRecordCount: 0,
      indexedRecordCount: 0,
      indexedRegionBaseWords: 0,
      indexedStrideWords: 5,
      nonIndexedRecordCount: 0,
      nonIndexedRegionBaseWords: 0,
      nonIndexedStrideWords: 4,
      sinks: [],
    },
    generatedComputeProgram: {
      maxActiveLanes: 1,
      offsetConstants: new Map(),
    },
    nagaLoweringProgram: {
      module: {
        types: [],
        constants: [],
        global_variables: [],
        functions: [],
        entry_points: [],
      },
      sourceMap: {},
      compute: {
        maxActiveLanes: 1,
      },
      coverage: {
        totalStepCount: 0,
        boundaryStepCount: 0,
        droppedComputeStepCount: 0,
        hardDropReasonCounts: {},
      },
    },
  } as CompiledProgramIR;
}

describe('getExprAddressTable', () => {
  it('reads slotLookup from precomputed runtime address table', () => {
    const program = mockProgram({
      slotMeta: [
        { slot: valueSlot(0), storage: 'f32', offset: 0, stride: 1, type: SIG_FLOAT },
        { slot: valueSlot(1), storage: 'u32', offset: 0, stride: 1, type: FIELD_FLOAT },
        { slot: valueSlot(2), storage: 'u32', offset: 1, stride: 3, type: SIG_FLOAT },
      ],
      steps: [],
    });

    const table = getExprAddressTable(program);
    expect(table.slotLookup.size).toBe(3);
    expect(table.slotLookup.get(valueSlot(0))).toEqual(expect.objectContaining({
      storage: 'f32', offset: 0, stride: 1, slot: valueSlot(0), type: SIG_FLOAT,
    }));
    expect(table.slotLookup.get(valueSlot(1))).toEqual(expect.objectContaining({
      storage: 'u32', offset: 0, stride: 1, slot: valueSlot(1), type: FIELD_FLOAT,
    }));
    expect(table.slotLookup.get(valueSlot(2))).toEqual(expect.objectContaining({
      storage: 'u32', offset: 1, stride: 3, slot: valueSlot(2), type: SIG_FLOAT,
    }));
  });

  it('reads fieldExprToSlot from precomputed runtime address table', () => {
    const program = mockProgram({
      slotMeta: [
        { slot: valueSlot(5), storage: 'f32', offset: 0, stride: 1, type: FIELD_FLOAT },
      ],
      steps: [
        { kind: 'materialize', field: 10 as any, target: valueSlot(5), instanceId: 'inst' as any },
      ],
    });

    const table = getExprAddressTable(program);
    expect(table.fieldExprToSlot.get(10)).toBe(valueSlot(5));
  });

  it('reads scalarExprToArenaAddress from precomputed runtime address table', () => {
    const program = mockProgram({
      slotMeta: [
        { slot: valueSlot(3), storage: 'f32', offset: 7, stride: 1, type: SIG_FLOAT },
      ],
      steps: [
        {
          kind: 'materialize',
          field: 42 as any,
          instanceId: SCALAR_INSTANCE_ID as any,
          target: valueSlot(3),
        },
      ],
    });

    const table = getExprAddressTable(program);
    expect(table.scalarExprToArenaAddress.get(42)).toEqual(expect.objectContaining({
      slot: valueSlot(3),
      component: 0,
      arena: expect.objectContaining({ offset: 7, stride: 1 }),
    }));
  });

  it('returns the same precomputed table reference per program identity', () => {
    const program = mockProgram({
      slotMeta: [
        { slot: valueSlot(0), storage: 'f32', offset: 0, stride: 1, type: SIG_FLOAT },
      ],
      steps: [],
    });

    const table1 = getExprAddressTable(program);
    const table2 = getExprAddressTable(program);
    expect(table1).toBe(table2);
  });

  it('different programs get different tables', () => {
    const p1 = mockProgram({
      slotMeta: [{ slot: valueSlot(0), storage: 'f32', offset: 0, stride: 1, type: SIG_FLOAT }],
      steps: [],
    });
    const p2 = mockProgram({
      slotMeta: [{ slot: valueSlot(0), storage: 'f32', offset: 5, stride: 1, type: SIG_FLOAT }],
      steps: [],
    });

    const t1 = getExprAddressTable(p1);
    const t2 = getExprAddressTable(p2);
    expect(t1).not.toBe(t2);
    expect(t1.slotLookup.get(valueSlot(0))!.offset).toBe(0);
    expect(t2.slotLookup.get(valueSlot(0))!.offset).toBe(5);
  });

  it('fails fast when precomputed runtimeAddressTable is missing', () => {
    const program = mockProgram({
      slotMeta: [{ slot: valueSlot(0), storage: 'f32', offset: 0, stride: 1, type: SIG_FLOAT }],
      steps: [],
    });
    const brokenProgram = { ...program, runtimeAddressTable: undefined } as unknown as CompiledProgramIR;
    expect(() => getExprAddressTable(brokenProgram))
      .toThrow(/legacy metadata-based runtime address derivation is forbidden/);
  });
});

describe('assertSlotExists', () => {
  it('returns lookup for existing slot', () => {
    const table = getExprAddressTable(mockProgram({
      slotMeta: [{ slot: valueSlot(1), storage: 'f32', offset: 0, stride: 1, type: SIG_FLOAT }],
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
      .toThrow(/Missing slot lookup entry for test/);
  });
});

describe('assertNumericStride', () => {
  it('returns lookup for matching numeric slot', () => {
    const table = getExprAddressTable(mockProgram({
      slotMeta: [{ slot: valueSlot(0), storage: 'f32', offset: 0, stride: 4, type: SIG_FLOAT }],
      steps: [],
    }));
    const result = assertNumericStride(table.slotLookup, valueSlot(0), 4, 'test');
    expect(result.stride).toBe(4);
  });

  it('accepts f32 numeric storage classes', () => {
    const table = getExprAddressTable(mockProgram({
      slotMeta: [{ slot: valueSlot(0), storage: 'f32', offset: 0, stride: 2, type: SIG_FLOAT }],
      steps: [],
    }));
    const result = assertNumericStride(table.slotLookup, valueSlot(0), 2, 'test');
    expect(result.storage).toBe('f32');
  });

  it('throws for stride mismatch', () => {
    const table = getExprAddressTable(mockProgram({
      slotMeta: [{ slot: valueSlot(0), storage: 'f32', offset: 0, stride: 1, type: SIG_FLOAT }],
      steps: [],
    }));
    expect(() => assertNumericStride(table.slotLookup, valueSlot(0), 4, 'test'))
      .toThrow(/must have stride=4, got 1/);
  });

  it('uses canonical numeric slot metadata', () => {
    const table = getExprAddressTable(mockProgram({
      slotMeta: [{ slot: valueSlot(0), storage: 'f32', offset: 0, stride: 1, type: SIG_FLOAT }],
      steps: [],
    }));
    const result = assertNumericStride(table.slotLookup, valueSlot(0), 1, 'test');
    expect(result.storage).toBe('f32');
  });
});
