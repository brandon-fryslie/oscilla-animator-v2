import { describe, expect, it, vi } from 'vitest';
import { compileAndSwap } from '../CompileOrchestrator';

type CompileDeps = Parameters<typeof compileAndSwap>[0];
type PrecomputedArtifacts = Parameters<typeof compileAndSwap>[2];

function makeHarness(schedule: unknown): { deps: CompileDeps; precomputed: PrecomputedArtifacts } {
  const storeStub = {
    store: {
      patch: { patch: { blocks: new Map(), edges: [] } },
      getPatchRevision: () => 7,
      events: { emit: vi.fn() },
      frontend: { updateFromFrontendResult: vi.fn() },
      diagnostics: { log: vi.fn() },
    },
    state: {
      currentProgram: null,
      currentState: null,
      sessionState: null,
    },
  } as const;

  const deps: CompileDeps = {
    store: storeStub.store as unknown as CompileDeps['store'],
    state: storeStub.state,
  };

  const precomputed: PrecomputedArtifacts = {
    sourcePatchRevision: 7,
    frontendResult: { backendReady: true, errors: [] } as unknown as PrecomputedArtifacts['frontendResult'],
    backendResult: {
      kind: 'ok',
      warnings: [],
      program: {
        schedule,
        runtimeAddressTable: { slotLookup: new Map() },
        valueExprs: { nodes: [] },
      },
    } as unknown as PrecomputedArtifacts['backendResult'],
    compileDurationMs: 1,
  };
  return { deps, precomputed };
}

function baseSchedule() {
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

describe('compileAndSwap schedule contract enforcement', () => {
  it('fails fast when schedule is missing', async () => {
    const { deps, precomputed } = makeHarness(undefined);
    await expect(compileAndSwap(deps, false, precomputed)).rejects.toThrow(
      '[compile] program.schedule is missing - compiler/runtime contract violation',
    );
  });

  it.each([
    ['timeModel', { timeModel: undefined }, '[compile] program.schedule.timeModel must be a non-null object - compiler/runtime contract violation'],
    ['instances', { instances: [] }, '[compile] program.schedule.instances must be a Map - compiler/runtime contract violation'],
    ['stateMappings', { stateMappings: {} }, '[compile] program.schedule.stateMappings must be an array - compiler/runtime contract violation'],
    ['steps', { steps: {} }, '[compile] program.schedule.steps must be an array - compiler/runtime contract violation'],
    ['stateSlotCount', { stateSlotCount: 0.5 }, '[compile] program.schedule.stateSlotCount must be a non-negative integer - compiler/runtime contract violation'],
    ['eventCount', { eventCount: -1 }, '[compile] program.schedule.eventCount must be a non-negative integer - compiler/runtime contract violation'],
  ])('fails fast when %s is invalid', async (_field, override, message) => {
    const schedule = { ...baseSchedule(), ...override };
    const { deps, precomputed } = makeHarness(schedule);
    await expect(compileAndSwap(deps, false, precomputed)).rejects.toThrow(message);
  });
});
