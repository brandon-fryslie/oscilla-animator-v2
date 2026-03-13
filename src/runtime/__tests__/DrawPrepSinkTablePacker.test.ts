import { describe, expect, it } from 'vitest';
import type { CompiledProgramIR } from '../../compiler/ir/program';
import type { StepRender } from '../../compiler/ir/types';
import { valueSlot, type ValueSlot } from '../../compiler/ir/Indices';
import { EMPTY_PROGRAM_TOPOLOGY_TABLE } from '../../compiler/ir/program-topology';
import { instanceId } from '../../core/ids';
import type { ArenaSlotDescriptor } from '../ArenaValueStore';
import {
  createRuntimeState,
  allocShapeBankWords,
  createShapeBankHeaderV1,
  writeShapeBankHeader,
  SHAPE_BANK_HEADER_WORDS,
} from '../RuntimeState';
import {
  DRAW_PREP_SINK_TABLE_HEADER_WORDS,
  DRAW_PREP_SINK_TABLE_RECORD_WORDS,
  DrawPrepSinkTableRecordWord,
} from '../DrawPrepSinkTable';
import { packDrawPrepSinkTableV1 } from '../DrawPrepSinkTablePacker';

interface TestSinkSlotSet {
  readonly shape: ReturnType<typeof valueSlot>;
  readonly controlPoints: ReturnType<typeof valueSlot>;
  readonly color: ReturnType<typeof valueSlot>;
  readonly scale: ReturnType<typeof valueSlot>;
}

function makeRenderStep(sinkInstanceId: ReturnType<typeof instanceId>, slots: TestSinkSlotSet): StepRender {
  return {
    kind: 'render',
    instanceId: sinkInstanceId,
    controlPointsSlot: slots.controlPoints,
    colorSlot: slots.color,
    scale: { k: 'slot', slot: slots.scale },
    shape: { k: 'slot', slot: slots.shape },
  };
}

function makeMinimalProgram(
  steps: readonly StepRender[],
  slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>,
): CompiledProgramIR {
  return {
    irVersion: 1 as const,
    valueExprs: { nodes: [] },
    constants: { json: [] },
    outputs: [],
    slotMeta: [],
    runtimeSlots: [],
    fieldSlotRegistry: new Map(),
    renderGlobals: [],
    kernelRegistry: {} as never,
    topologyTable: EMPTY_PROGRAM_TOPOLOGY_TABLE,
    arenaLayout: [],
    arenaPayloadFloats: 0,
    arenaTotalFloats: 0,
    schedule: {
      instances: new Map(),
      steps,
      stateSlotCount: 0,
      timeModel: { kind: 'driven', source: 'raf' } as never,
      stateMappings: [],
      eventSlotCount: 0,
      eventCount: 0,
    },
    runtimeAddressTable: {
      slotLookup: new Map(),
      fieldExprToSlot: new Map(),
      scalarExprToArenaAddress: new Map(),
      slotToArena,
    },
    drawPrepProgram: {
      totalRecordCount: 2,
      indexedRecordCount: 2,
      indexedRegionBaseWords: 0,
      indexedStrideWords: 5,
      nonIndexedRecordCount: 0,
      nonIndexedRegionBaseWords: 0,
      nonIndexedStrideWords: 4,
      sinks: [
        {
          sinkIndex: 0,
          renderStepIndex: 0,
          instanceId: steps[0]!.instanceId,
          indirectRecordIndex: 0,
          instanceCountMode: 'static',
          staticInstanceCount: 2,
          drawMode: 'indexed',
          indirectRegion: 'indexed',
          indirectStrideBytes: 20,
          topologySource: 'shapeHeaderV1',
          firstInstanceSource: 'runtimePacked',
          indexedFirstIndex: 0,
          indexedBaseVertex: 0,
        },
        {
          sinkIndex: 1,
          renderStepIndex: 1,
          instanceId: steps[1]!.instanceId,
          indirectRecordIndex: 1,
          instanceCountMode: 'static',
          staticInstanceCount: 3,
          drawMode: 'indexed',
          indirectRegion: 'indexed',
          indirectStrideBytes: 20,
          topologySource: 'shapeHeaderV1',
          firstInstanceSource: 'runtimePacked',
          indexedFirstIndex: 0,
          indexedBaseVertex: 0,
        },
      ],
    },
    generatedComputeProgram: {
      maxActiveLanes: 1,
      offsetConstants: new Map(),
    },
    debugIndex: {
      stepToBlock: new Map(),
      slotToBlock: new Map(),
      exprToBlock: new Map(),
      ports: [],
      slotToPort: new Map(),
      blockMap: new Map(),
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
      },
    },
  } as unknown as CompiledProgramIR;
}

function recordBaseWord(recordIndex: number): number {
  return DRAW_PREP_SINK_TABLE_HEADER_WORDS + recordIndex * DRAW_PREP_SINK_TABLE_RECORD_WORDS;
}

function readRecordU32(words: Uint32Array, recordIndex: number, word: DrawPrepSinkTableRecordWord): number {
  const base = recordBaseWord(recordIndex);
  return words[base + word] >>> 0;
}

function readRecordI32(words: Uint32Array, recordIndex: number, word: DrawPrepSinkTableRecordWord): number {
  const base = recordBaseWord(recordIndex);
  const dataView = new DataView(words.buffer, words.byteOffset, words.byteLength);
  return dataView.getInt32((base + word) * 4, true);
}

describe('packDrawPrepSinkTableV1 multi-template shape handles', () => {
  it('packs distinct per-sink shape handles without a shape-0 shortcut', () => {
    const slotsA: TestSinkSlotSet = {
      shape: valueSlot(1),
      controlPoints: valueSlot(2),
      color: valueSlot(3),
      scale: valueSlot(4),
    };
    const slotsB: TestSinkSlotSet = {
      shape: valueSlot(5),
      controlPoints: valueSlot(6),
      color: valueSlot(7),
      scale: valueSlot(8),
    };
    const instanceA = instanceId('instance-a');
    const instanceB = instanceId('instance-b');
    const steps = [makeRenderStep(instanceA, slotsA), makeRenderStep(instanceB, slotsB)];

    const slotToArena = new Map<ValueSlot, ArenaSlotDescriptor>([
      [slotsA.shape, { offset: 0, stride: 1, laneCount: 2, length: 2 }],
      [slotsA.controlPoints, { offset: 20, stride: 2, laneCount: 2, length: 4 }],
      [slotsA.color, { offset: 40, stride: 4, laneCount: 2, length: 8 }],
      [slotsA.scale, { offset: 60, stride: 1, laneCount: 2, length: 2 }],
      [slotsB.shape, { offset: 80, stride: 1, laneCount: 3, length: 3 }],
      [slotsB.controlPoints, { offset: 100, stride: 2, laneCount: 3, length: 6 }],
      [slotsB.color, { offset: 120, stride: 4, laneCount: 3, length: 12 }],
      [slotsB.scale, { offset: 160, stride: 1, laneCount: 3, length: 3 }],
    ]);
    const program = makeMinimalProgram(steps, slotToArena);
    const state = createRuntimeState(0, 0, 0, 192, 1024, 0);

    // [LAW:one-source-of-truth] Shape headers are canonical draw-topology metadata.
    const unusedHandle = allocShapeBankWords(state.shapeBank, SHAPE_BANK_HEADER_WORDS);
    const handleA = allocShapeBankWords(state.shapeBank, SHAPE_BANK_HEADER_WORDS);
    const handleB = allocShapeBankWords(state.shapeBank, SHAPE_BANK_HEADER_WORDS);
    expect(unusedHandle).toBe(0);
    expect(handleA).toBeGreaterThan(0);
    expect(handleB).toBeGreaterThan(handleA);

    writeShapeBankHeader(
      state.shapeBank.data,
      handleA,
      createShapeBankHeaderV1({
        kind: 1,
        materialClass: 101,
        indexCount: 7,
        firstIndex: 11,
        baseVertex: 3,
      }),
    );
    writeShapeBankHeader(
      state.shapeBank.data,
      handleB,
      createShapeBankHeaderV1({
        kind: 1,
        materialClass: 202,
        indexCount: 13,
        firstIndex: 17,
        baseVertex: 5,
      }),
    );

    state.arena[0] = handleA;
    state.arena[1] = handleA;
    state.arena[80] = handleB;
    state.arena[81] = handleB;
    state.arena[82] = handleB;

    const packed = packDrawPrepSinkTableV1(program, state);
    expect(packed).not.toBeNull();
    const words = packed!.words;

    expect(readRecordU32(words, 0, DrawPrepSinkTableRecordWord.ShapeWordOffset)).toBe(handleA);
    expect(readRecordU32(words, 1, DrawPrepSinkTableRecordWord.ShapeWordOffset)).toBe(handleB);
    expect(readRecordU32(words, 0, DrawPrepSinkTableRecordWord.Count)).toBe(7);
    expect(readRecordU32(words, 1, DrawPrepSinkTableRecordWord.Count)).toBe(13);
    expect(readRecordU32(words, 0, DrawPrepSinkTableRecordWord.First)).toBe(11);
    expect(readRecordU32(words, 1, DrawPrepSinkTableRecordWord.First)).toBe(17);
    expect(readRecordI32(words, 0, DrawPrepSinkTableRecordWord.BaseVertex)).toBe(3);
    expect(readRecordI32(words, 1, DrawPrepSinkTableRecordWord.BaseVertex)).toBe(5);
    expect(readRecordU32(words, 0, DrawPrepSinkTableRecordWord.FirstInstance)).toBe(0);
    expect(readRecordU32(words, 1, DrawPrepSinkTableRecordWord.FirstInstance)).toBe(2);
  });
});
