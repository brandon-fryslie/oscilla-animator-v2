import { describe, expect, it } from 'vitest';
import type { CompiledProgramIR } from '../../compiler/ir/program';
import { SYSTEM_PALETTE_SLOT, valueExprId, valueSlot } from '../../compiler/ir/Indices';
import { canonicalScalar, FLOAT, unitNone } from '../../core/canonical-types';
import { createRuntimeState } from '../RuntimeState';
import { executeFrame } from '../ScheduleExecutor';
import { getTestArena } from './test-arena-helper';

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

describe('ScheduleExecutor phase-boundary assertion', () => {
  it('throws when schedule regresses across phase boundary and assertion is enabled', () => {
    const program = makeProgramWithPhaseBoundaryViolation();
    const state = createRuntimeState(
      4,
      1,
      0,
      0,
      1,
      program.arenaTotalFloats,
    );
    expect(() =>
      executeFrame(program, state, getTestArena(), 100, {
        assertPhaseBoundaryStateReads: true,
      }),
    ).toThrow(/Phase-boundary assertion failed: non-state step/);
  });

  it('does not run the assertion when toggle is disabled', () => {
    const program = makeProgramWithPhaseBoundaryViolation();
    const state = createRuntimeState(
      4,
      1,
      0,
      0,
      1,
      program.arenaTotalFloats,
    );
    expect(() =>
      executeFrame(program, state, getTestArena(), 100, {
        assertPhaseBoundaryStateReads: false,
      }),
    ).not.toThrow();
  });
});
