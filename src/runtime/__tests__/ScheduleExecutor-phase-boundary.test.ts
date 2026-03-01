import { describe, expect, it } from 'vitest';
import type { CompiledProgramIR } from '../../compiler/ir/program';
import { SYSTEM_PALETTE_SLOT, valueExprId, valueSlot } from '../../compiler/ir/Indices';
import { canonicalMany, canonicalScalar, FLOAT, instanceRef, unitNone } from '../../core/canonical-types';
import { assertSchedulePhaseBoundaryStateReads } from '../PhaseBoundaryValidator';
import { createRuntimeState } from '../RuntimeState';
import { executeFrame } from '../ScheduleExecutor';
import { getTestArena } from './test-arena-helper';
import { domainTypeId, instanceId } from '../../core/ids';

function makeProgramWithPhaseBoundaryViolation(): CompiledProgramIR {
  const scalar = canonicalScalar(FLOAT, unitNone());
  const paletteSlot = SYSTEM_PALETTE_SLOT;
  const slotLookup = new Map([
    [paletteSlot, {
      storage: 'f32' as const,
      offset: 0,
      stride: 4,
      slot: paletteSlot,
      type: scalar,
      arena: { offset: 0, stride: 4, laneCount: 1, length: 4 },
    }],
  ]);
  const slotToArena = new Map([
    [paletteSlot, { offset: 0, stride: 4, laneCount: 1, length: 4 }],
  ]);

  // Intentionally invalid order for debug assertion:
  // phase-2 step first, then phase-1 step.
  const steps = [
    { kind: 'stateWrite', stateSlot: 0 as any, value: valueExprId(0) },
    { kind: 'continuityMapBuild', instanceId: 'missing' as any, outputMapping: 'm0' },
  ] as const;

  return {
    irVersion: 1,
    valueExprs: { nodes: [{ kind: 'const', type: scalar, value: { kind: 'float', value: 0 } }] as any[] },
    constants: { json: [] },
    schedule: {
      steps: steps as any,
      timeModel: { periodAMs: 1000, periodBMs: 2000 },
      instances: new Map(),
      stateMappings: [{
        stateId: 'b0:phase',
        slotStart: 0,
        stride: 1,
        laneCount: 1,
        initial: [0],
      }],
      stateSlotCount: 1,
      eventSlotCount: 0,
      eventCount: 0,
    } as any,
    outputs: [],
    slotMeta: [],
    runtimeSlots: [],
    runtimeAddressTable: {
      slotLookup,
      fieldExprToSlot: new Map(),
      scalarExprToArenaAddress: new Map(),
      slotToArena,
    },
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
    arenaLayout: [{ offset: 0, stride: 4, laneCount: 1, length: 4 }],
    arenaTotalFloats: 4,
  } as CompiledProgramIR;
}

function makeProgramWithCardinalityWriteMismatch(): CompiledProgramIR {
  const scalar = canonicalScalar(FLOAT, unitNone());
  const fieldType = canonicalMany(FLOAT, unitNone(), instanceRef('domain:test', 'inst:test'));
  const targetSlot = valueSlot(1);
  const fieldInstanceId = instanceId('inst:test');
  const fieldDomainTypeId = domainTypeId('domain:test');

  const slotLookup = new Map([
    [targetSlot, {
      storage: 'f32' as const,
      offset: 0,
      stride: 1,
      slot: targetSlot,
      type: fieldType,
      arena: { offset: 0, stride: 1, laneCount: 2, length: 2 },
    }],
  ]);
  const slotToArena = new Map([
    [targetSlot, { offset: 0, stride: 1, laneCount: 2, length: 2 }],
  ]);

  return {
    irVersion: 1,
    valueExprs: {
      nodes: [{ kind: 'const', type: scalar, value: { kind: 'float', value: 0.25 } }] as any[],
    },
    constants: { json: [] },
    schedule: {
      steps: [{ kind: 'evalOne', expr: valueExprId(0), target: targetSlot }],
      timeModel: { periodAMs: 1000, periodBMs: 2000 },
      instances: new Map([
        [fieldInstanceId, {
          id: fieldInstanceId,
          domainType: fieldDomainTypeId,
          count: 2,
          lifecycle: 'dynamic',
          maxCount: 2,
          identityMode: 'none',
        }],
      ]),
      stateMappings: [],
      stateSlotCount: 0,
      eventSlotCount: 0,
      eventCount: 0,
    } as any,
    outputs: [],
    slotMeta: [],
    runtimeSlots: [],
    runtimeAddressTable: {
      slotLookup,
      fieldExprToSlot: new Map(),
      scalarExprToArenaAddress: new Map(),
      slotToArena,
    },
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
    arenaLayout: [{ offset: 0, stride: 1, laneCount: 2, length: 2 }],
    arenaTotalFloats: 2,
  } as CompiledProgramIR;
}

describe('phase-boundary assertion', () => {
  it('throws when schedule regresses across phase boundary at compile boundary', () => {
    const program = makeProgramWithPhaseBoundaryViolation();
    expect(() => assertSchedulePhaseBoundaryStateReads(program))
      .toThrow(/Phase-boundary assertion failed: non-state step/);
  });

  it('keeps executeFrame hot path free of phase-boundary assertion work', () => {
    const program = makeProgramWithPhaseBoundaryViolation();
    const state = createRuntimeState(
      4,
      1,
      0,
      0,
      1,
      program.arenaTotalFloats,
      0,
      undefined,
      undefined,
      program.arenaRuntimeLayout,
    );
    expect(() => executeFrame(program, state, getTestArena(), 100)).not.toThrow();
  });

  it('throws cardinality write assertion in debug mode when evalOne writes into field slot', () => {
    const program = makeProgramWithCardinalityWriteMismatch();
    const state = createRuntimeState(
      2,
      0,
      0,
      0,
      1,
      program.arenaTotalFloats,
      0,
      undefined,
      undefined,
      program.arenaRuntimeLayout,
    );
    expect(() =>
      executeFrame(program, state, getTestArena(), 100, { assertCardinalitySlotWrites: true })
    ).toThrow(/Cardinality write assertion failed .* expected field, actual signal/);
  });

  it('keeps cardinality write assertions out of execution when disabled', () => {
    const program = makeProgramWithCardinalityWriteMismatch();
    const state = createRuntimeState(
      2,
      0,
      0,
      0,
      1,
      program.arenaTotalFloats,
      0,
      undefined,
      undefined,
      program.arenaRuntimeLayout,
    );
    expect(() => executeFrame(program, state, getTestArena(), 100)).not.toThrow();
  });
});
