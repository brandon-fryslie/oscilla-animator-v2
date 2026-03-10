import { describe, expect, it, vi } from 'vitest';
import { compileAndSwap } from '../CompileOrchestrator';

type CompileDeps = Parameters<typeof compileAndSwap>[0];
type PrecomputedArtifacts = Parameters<typeof compileAndSwap>[2];

function makeHarness(schedule: unknown): { deps: CompileDeps; precomputed: PrecomputedArtifacts } {
  const deps = {
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
  };

  const precomputed = {
    sourcePatchRevision: 7,
    frontendResult: { backendReady: true, errors: [] },
    backendResult: {
      kind: 'ok',
      warnings: [],
      program: {
        schedule,
        runtimeAddressTable: { slotLookup: new Map() },
        valueExprs: { nodes: [] },
      },
    },
    compileDurationMs: 1,
  };

  return {
    deps: deps as unknown as CompileDeps,
    precomputed: precomputed as unknown as PrecomputedArtifacts,
  };
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
    ['timeModel', { timeModel: undefined }, '[compile] program.schedule.timeModel is missing - compiler/runtime contract violation'],
    ['instances', { instances: [] }, '[compile] program.schedule.instances is missing - compiler/runtime contract violation'],
    ['stateSlotCount', { stateSlotCount: 0.5 }, '[compile] program.schedule.stateSlotCount must be a non-negative integer - compiler/runtime contract violation'],
    ['eventCount', { eventCount: -1 }, '[compile] program.schedule.eventCount must be a non-negative integer - compiler/runtime contract violation'],
  ])('fails fast when %s is invalid', async (_field, override, message) => {
    const schedule = { ...baseSchedule(), ...override };
    const { deps, precomputed } = makeHarness(schedule);
    await expect(compileAndSwap(deps, false, precomputed)).rejects.toThrow(message);
  });
});
