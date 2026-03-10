import { describe, expect, it, vi } from 'vitest';
import { compileAndSwap } from '../CompileOrchestrator';

type CompileDeps = Parameters<typeof compileAndSwap>[0];
type PrecomputedArtifacts = Parameters<typeof compileAndSwap>[2];

function createDepsWithSchedule(schedule: unknown) {
  const store = {
    patch: {
      patch: { blocks: new Map(), edges: [] },
    },
    getPatchRevision: () => 1,
    events: {
      emit: vi.fn(),
    },
    frontend: {
      updateFromFrontendResult: vi.fn(),
    },
    diagnostics: {
      log: vi.fn(),
    },
    continuity: {
      setRuntimeStateRef: vi.fn(),
    },
  };

  const state = {
    currentProgram: null,
    currentState: null,
    sessionState: null,
  };

  const program = {
    schedule,
    runtimeAddressTable: {
      slotLookup: new Map(),
    },
    valueExprs: {
      nodes: [],
    },
    arenaTotalFloats: 0,
    arenaRuntimeLayout: {},
  };

  return {
    deps: { store, state } as unknown as CompileDeps,
    precomputed: {
      sourcePatchRevision: 1,
      frontendResult: {
        errors: [],
        backendReady: true,
      },
      backendResult: {
        kind: 'ok',
        program,
        warnings: [],
      },
      compileDurationMs: 1,
    } as unknown as PrecomputedArtifacts,
  };
}

function validSchedule() {
  return {
    timeModel: {},
    instances: new Map(),
    steps: [],
    stateSlotCount: 0,
    stateMappings: [],
    eventSlotCount: 0,
    eventCount: 0,
  };
}

describe('CompileOrchestrator schedule contract', () => {
  it('fails fast when program.schedule is missing', async () => {
    const { deps, precomputed } = createDepsWithSchedule(undefined);

    await expect(compileAndSwap(deps, true, precomputed)).rejects.toThrow(
      '[compile] program.schedule is missing - compiler/runtime contract violation',
    );
  });

  it('fails fast when required schedule object fields are missing', async () => {
    const missingTimeModel = {
      ...validSchedule(),
      timeModel: undefined,
    };
    const missingInstances = {
      ...validSchedule(),
      instances: undefined,
    };

    const missingTimeModelArtifacts = createDepsWithSchedule(missingTimeModel);
    const missingInstancesArtifacts = createDepsWithSchedule(missingInstances);

    await expect(compileAndSwap(
      missingTimeModelArtifacts.deps,
      true,
      missingTimeModelArtifacts.precomputed,
    )).rejects.toThrow(
      '[compile] program.schedule.timeModel is missing - compiler/runtime contract violation',
    );
    await expect(compileAndSwap(
      missingInstancesArtifacts.deps,
      true,
      missingInstancesArtifacts.precomputed,
    )).rejects.toThrow(
      '[compile] program.schedule.instances is missing - compiler/runtime contract violation',
    );
  });

  it('fails fast when required schedule count fields are invalid', async () => {
    const invalidStateSlotCount = {
      ...validSchedule(),
      stateSlotCount: -1,
    };
    const invalidEventCount = {
      ...validSchedule(),
      eventCount: 1.5,
    };

    const invalidStateSlotCountArtifacts = createDepsWithSchedule(invalidStateSlotCount);
    const invalidEventCountArtifacts = createDepsWithSchedule(invalidEventCount);

    await expect(compileAndSwap(
      invalidStateSlotCountArtifacts.deps,
      true,
      invalidStateSlotCountArtifacts.precomputed,
    )).rejects.toThrow(
      '[compile] program.schedule.stateSlotCount must be a non-negative integer - compiler/runtime contract violation',
    );
    await expect(compileAndSwap(
      invalidEventCountArtifacts.deps,
      true,
      invalidEventCountArtifacts.precomputed,
    )).rejects.toThrow(
      '[compile] program.schedule.eventCount must be a non-negative integer - compiler/runtime contract violation',
    );
  });
});
