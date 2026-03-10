import { describe, expect, it, vi } from 'vitest';
import { compileAndSwap } from '../CompileOrchestrator';

type MutableSchedule = {
  timeModel: unknown;
  instances: unknown;
  steps: unknown;
  stateSlotCount: unknown;
  stateMappings: unknown;
  eventSlotCount: unknown;
  eventCount: unknown;
};

type CompileDeps = Parameters<typeof compileAndSwap>[0];
type PrecomputedArtifacts = Parameters<typeof compileAndSwap>[2];

function makeValidSchedule(): MutableSchedule {
  return {
    timeModel: { periodAMs: 1000, periodBMs: 2000 },
    instances: new Map(),
    steps: [],
    stateSlotCount: 0,
    stateMappings: [],
    eventSlotCount: 0,
    eventCount: 0,
  };
}

function makeHarness(scheduleOverride: MutableSchedule): {
  deps: CompileDeps;
  precomputed: PrecomputedArtifacts;
} {
  const store = {
    patch: { patch: { blocks: new Map(), edges: [] } },
    getPatchRevision: vi.fn(() => 7),
    events: { emit: vi.fn() },
    frontend: { updateFromFrontendResult: vi.fn() },
    diagnostics: { log: vi.fn(), recordCompilation: vi.fn() },
  };

  const state = {
    currentProgram: null,
    currentState: null,
    sessionState: null,
  };

  const program = {
    runtimeAddressTable: { slotLookup: new Map() },
    schedule: scheduleOverride,
    valueExprs: { nodes: [] },
  };

  const precomputed = {
    sourcePatchRevision: 7,
    frontendResult: { backendReady: true, errors: [] },
    backendResult: { kind: 'ok', program },
    compileDurationMs: 1,
  };

  return {
    deps: { store, state } as unknown as CompileDeps,
    precomputed: precomputed as unknown as PrecomputedArtifacts,
  };
}

describe('compileAndSwap schedule contract enforcement', () => {
  it('fails fast when timeModel is missing', async () => {
    const schedule = makeValidSchedule();
    schedule.timeModel = undefined;
    const { deps, precomputed } = makeHarness(schedule);

    await expect(compileAndSwap(deps, false, precomputed)).rejects.toThrow(
      '[compile] program.schedule.timeModel is missing - compiler/runtime contract violation',
    );
  });

  it('fails fast when instances is not a map', async () => {
    const schedule = makeValidSchedule();
    schedule.instances = [];
    const { deps, precomputed } = makeHarness(schedule);

    await expect(compileAndSwap(deps, false, precomputed)).rejects.toThrow(
      '[compile] program.schedule.instances is missing - compiler/runtime contract violation',
    );
  });

  it('fails fast when eventCount is not a non-negative integer', async () => {
    const schedule = makeValidSchedule();
    schedule.eventCount = -1;
    const { deps, precomputed } = makeHarness(schedule);

    await expect(compileAndSwap(deps, false, precomputed)).rejects.toThrow(
      '[compile] program.schedule.eventCount must be a non-negative integer - compiler/runtime contract violation',
    );
  });

  it('fails fast when stateSlotCount is not a non-negative integer', async () => {
    const schedule = makeValidSchedule();
    schedule.stateSlotCount = 0.5;
    const { deps, precomputed } = makeHarness(schedule);

    await expect(compileAndSwap(deps, false, precomputed)).rejects.toThrow(
      '[compile] program.schedule.stateSlotCount must be a non-negative integer - compiler/runtime contract violation',
    );
  });

  it('fails fast when eventSlotCount is not a non-negative integer', async () => {
    const schedule = makeValidSchedule();
    schedule.eventSlotCount = '2';
    const { deps, precomputed } = makeHarness(schedule);

    await expect(compileAndSwap(deps, false, precomputed)).rejects.toThrow(
      '[compile] program.schedule.eventSlotCount must be a non-negative integer - compiler/runtime contract violation',
    );
  });

  it('fails fast when stateMappings is missing', async () => {
    const schedule = makeValidSchedule();
    schedule.stateMappings = undefined;
    const { deps, precomputed } = makeHarness(schedule);

    await expect(compileAndSwap(deps, false, precomputed)).rejects.toThrow(
      '[compile] program.schedule.stateMappings is missing - compiler/runtime contract violation',
    );
  });

  it('fails fast when steps is missing', async () => {
    const schedule = makeValidSchedule();
    schedule.steps = undefined;
    const { deps, precomputed } = makeHarness(schedule);

    await expect(compileAndSwap(deps, false, precomputed)).rejects.toThrow(
      '[compile] program.schedule.steps is missing - compiler/runtime contract violation',
    );
  });

  it('fails fast when timeModel.periodAMs is invalid', async () => {
    const schedule = makeValidSchedule();
    schedule.timeModel = { periodAMs: -1, periodBMs: 2000 };
    const { deps, precomputed } = makeHarness(schedule);

    await expect(compileAndSwap(deps, false, precomputed)).rejects.toThrow(
      '[compile] program.schedule.timeModel.periodAMs must be a non-negative number - compiler/runtime contract violation',
    );
  });
});
