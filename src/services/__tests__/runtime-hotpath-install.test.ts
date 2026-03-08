import { describe, expect, it } from 'vitest';
import type { DrawPrepSinkIR } from '../../compiler/ir/program';
import type { ValueExprId, ValueSlot } from '../../compiler/ir/Indices';
import type { StepMaterialize, StepRender } from '../../compiler/ir/types';
import type { ArenaSlotDescriptor } from '../../runtime/ArenaValueStore';
import type { CompiledProgramIR } from '../../compiler/ir/program';
import { canonicalType, HANDLE } from '../../core/canonical-types';
import { createRuntimeState, DrawPrepSinkTableHeaderWord, SHAPE_BANK_HEADER_WORDS } from '../../runtime';
import { buildProgramTopologyTableFromIds } from '../../compiler/ir/program-topology';
import { registerDynamicTopology } from '../../shapes/registry';
import { buildRuntimeHotpathInstallPlanes } from '../runtime-hotpath-install';

const TEST_TOPOLOGY_ID = registerDynamicTopology(
  {
    params: [{ name: 'radius', type: 'float', default: 1 }],
  },
  'runtime-hotpath-install-test-topology',
);

function descriptor(offset: number, stride: number, laneCount: number): ArenaSlotDescriptor {
  return {
    offset,
    stride,
    laneCount,
    length: stride * laneCount,
    packing: 'soa',
  };
}

function makeBaseProgram(): CompiledProgramIR {
  const shapeSlot = 30 as ValueSlot;
  const controlPointsSlot = 10 as ValueSlot;
  const colorSlot = 20 as ValueSlot;
  const scaleSlot = 31 as ValueSlot;
  const instanceId = 'inst-main' as any;

  const materializeStep: StepMaterialize = {
    kind: 'materialize',
    field: 0 as ValueExprId,
    instanceId,
    target: shapeSlot,
  };
  const renderStep: StepRender = {
    kind: 'render',
    instanceId,
    controlPointsSlot,
    colorSlot,
    scale: { k: 'slot', slot: scaleSlot },
    shape: { k: 'slot', slot: shapeSlot },
  };
  const drawPrepSinks: readonly DrawPrepSinkIR[] = [
    {
      sinkIndex: 0,
      renderStepIndex: 1,
      instanceId,
      indirectRecordIndex: 0,
      instanceCountMode: 'static',
      staticInstanceCount: 1,
      drawMode: 'indexed',
      indirectRegion: 'indexed',
      indirectStrideBytes: 20,
      topologySource: 'shapeHeaderV1',
      firstInstanceSource: 'runtimePacked',
      indexedFirstIndex: 0,
      indexedBaseVertex: 0,
    },
  ];

  return {
    irVersion: 1,
    valueExprs: {
      nodes: [
        {
          kind: 'shapeRef',
          type: canonicalType(HANDLE),
          topologyId: TEST_TOPOLOGY_ID,
          paramArgs: [],
        },
      ],
    },
    constants: { json: [] },
    schedule: {
      timeModel: { periodAMs: 4000, periodBMs: 8000 },
      instances: new Map([
        [
          instanceId,
          {
            id: instanceId,
            domainType: 'domain-main' as any,
            count: 1,
            lifecycle: 'static',
            maxCount: 1,
            identityMode: 'none',
          },
        ],
      ]),
      steps: [materializeStep, renderStep],
      stateMappings: [],
      stateSlotCount: 0,
      eventSlotCount: 0,
      eventCount: 0,
    } as any,
    outputs: [],
    slotMeta: [],
    runtimeSlots: [],
    runtimeAddressTable: {
      slotLookup: new Map(),
      fieldExprToSlot: new Map(),
      scalarExprToArenaAddress: new Map(),
      slotToArena: new Map<ValueSlot, ArenaSlotDescriptor>([
        [shapeSlot, descriptor(0, 1, 1)],
        [controlPointsSlot, descriptor(8, 2, 1)],
        [colorSlot, descriptor(16, 4, 1)],
        [scaleSlot, descriptor(24, 1, 1)],
      ]),
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
    kernelRegistry: {} as any,
    topologyTable: buildProgramTopologyTableFromIds([TEST_TOPOLOGY_ID]),
    arenaLayout: [],
    arenaPayloadFloats: 0,
    arenaTotalFloats: 64,
    drawPrepProgram: {
      totalRecordCount: 1,
      indexedRecordCount: 1,
      indexedRegionBaseWords: 0,
      indexedStrideWords: 5,
      nonIndexedRecordCount: 0,
      nonIndexedRegionBaseWords: 5,
      nonIndexedStrideWords: 4,
      sinks: drawPrepSinks,
    },
  } as unknown as CompiledProgramIR;
}

describe('buildRuntimeHotpathInstallPlanes', () => {
  it('publishes non-empty sink-table and shape-bank payloads for a valid program', () => {
    const program = makeBaseProgram();
    const state = createRuntimeState(0, 0, 1, 64);

    const planes = buildRuntimeHotpathInstallPlanes(program, state, 100);

    expect(planes.sinkTableWords).not.toBeNull();
    expect(planes.sinkTableWordCount).toBeGreaterThan(0);
    expect(planes.shapeBankWordCount).toBeGreaterThanOrEqual(SHAPE_BANK_HEADER_WORDS);
    expect(planes.shapeBankWords.length).toBe(planes.shapeBankWordCount);
    expect(planes.sinkTableWords?.[DrawPrepSinkTableHeaderWord.TotalRecordCount]).toBe(1);
  });

  it('fails fast when runtimeAddressTable is missing', () => {
    const program = makeBaseProgram();
    const invalid = {
      ...program,
      runtimeAddressTable: undefined,
    } as CompiledProgramIR;
    const state = createRuntimeState(0, 0, 1, 64);

    expect(() => buildRuntimeHotpathInstallPlanes(invalid, state, 100)).toThrow(
      'Missing precomputed runtimeAddressTable',
    );
  });

  it('fails fast when draw-prep dynamic sink count cannot be resolved', () => {
    const program = makeBaseProgram();
    const dynamicMissing = {
      ...program,
      drawPrepProgram: {
        ...program.drawPrepProgram!,
        sinks: [
          {
            ...program.drawPrepProgram!.sinks[0]!,
            instanceId: 'inst-dynamic-missing' as any,
            instanceCountMode: 'dynamic',
            staticInstanceCount: undefined,
          },
        ],
      },
    } as CompiledProgramIR;
    const state = createRuntimeState(0, 0, 1, 64);

    expect(() => buildRuntimeHotpathInstallPlanes(dynamicMissing, state, 100)).toThrow(
      'missing dynamic instance count',
    );
  });
});
