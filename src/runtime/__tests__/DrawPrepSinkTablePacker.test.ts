import { describe, expect, it } from 'vitest';
import type { DrawPrepProgramIR, DrawPrepSinkIR } from '../../compiler/ir/program';
import type { StepRender } from '../../compiler/ir/types';
import { packDrawPrepSinkTableV1 } from '../DrawPrepSinkTablePacker';
import {
  DRAW_PREP_SINK_TABLE_HEADER_WORDS,
  DRAW_PREP_SINK_TABLE_RECORD_WORDS,
  DrawPrepSinkTableHeaderWord,
  DrawPrepSinkTableRecordWord,
} from '../DrawPrepSinkTable';

function makeDrawPrepProgram(sinks: readonly DrawPrepSinkIR[]): DrawPrepProgramIR {
  let indexedRecordCount = 0;
  let nonIndexedRecordCount = 0;
  for (const sink of sinks) {
    if (sink.drawMode === 'indexed') {
      indexedRecordCount += 1;
    } else {
      nonIndexedRecordCount += 1;
    }
  }
  return {
    totalRecordCount: sinks.length,
    indexedRecordCount,
    indexedRegionBaseWords: 0,
    indexedStrideWords: 5,
    nonIndexedRecordCount,
    nonIndexedRegionBaseWords: indexedRecordCount * 5,
    nonIndexedStrideWords: 4,
    sinks,
  };
}

function makeRenderStep(shapeExprId: number): StepRender {
  return {
    kind: 'render',
    instanceId: 'inst-0' as any,
    controlPointsSlot: 10 as any,
    colorSlot: 20 as any,
    shape: { k: 'oneHandle', id: shapeExprId as any },
  };
}

function makeProgram(args: {
  readonly sinks: readonly DrawPrepSinkIR[];
  readonly renderSteps: readonly StepRender[];
  readonly exprArenaOffsetById: ReadonlyMap<number, number>;
}) {
  const scalarExprToArenaAddress = new Map<number, { slot: number; arena: any; component: number }>();
  for (const [exprId, offset] of args.exprArenaOffsetById.entries()) {
    scalarExprToArenaAddress.set(exprId, {
      slot: 0,
      arena: {
        offset,
        stride: 1,
        laneCount: 1,
        length: 1,
      },
      component: 0,
    });
  }

  const slotToArena = new Map<number, any>([
    [10, { offset: 0, stride: 2, laneCount: 32, length: 64, packing: 'soa' }],
    [20, { offset: 128, stride: 4, laneCount: 32, length: 128, packing: 'soa' }],
    [30, { offset: 300, stride: 1, laneCount: 32, length: 32, packing: 'soa' }],
  ]);

  return {
    drawPrepProgram: makeDrawPrepProgram(args.sinks),
    schedule: {
      steps: args.renderSteps,
    },
    runtimeAddressTable: {
      scalarExprToArenaAddress,
      slotToArena,
    },
  } as any;
}

function makeRuntimeState(arenaValues: ArrayLike<number>, dynamicCounts?: ReadonlyMap<string, number>) {
  return {
    arena: Float32Array.from(arenaValues),
    shapeBank: {
      data: new Uint32Array(512),
      volatilePtr: 512,
      staticBoundary: 0,
      topologyIdByHandle: new Uint32Array(512),
      controlPointSlotByHandle: new Int32Array(512),
    },
    cache: {
      frameId: 7,
      instanceLaneCountFrameId: 7,
      instanceLaneCounts: dynamicCounts ? new Map(dynamicCounts) : new Map<string, number>(),
      drawPrepSinkTableWords: undefined,
      drawPrepSinkTableWordCount: 0,
      drawPrepSinkTableFrameId: 0,
    },
  } as any;
}

describe('packDrawPrepSinkTableV1', () => {
  it('packs mixed indexed/non-indexed sink records with runtime firstInstance prefix and assembly metadata', () => {
    const sinks: readonly DrawPrepSinkIR[] = [
      {
        sinkIndex: 0,
        renderStepIndex: 0,
        instanceId: 'inst-static' as any,
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
        instanceId: 'inst-dynamic' as any,
        indirectRecordIndex: 0,
        instanceCountMode: 'dynamic',
        drawMode: 'nonIndexed',
        indirectRegion: 'nonIndexed',
        indirectStrideBytes: 16,
        topologySource: 'shapeHeaderV1',
        firstInstanceSource: 'runtimePacked',
        nonIndexedFirstVertex: 0,
      },
    ];

    const program = makeProgram({
      sinks,
      renderSteps: [makeRenderStep(100), makeRenderStep(101)],
      exprArenaOffsetById: new Map([
        [100, 400],
        [101, 401],
      ]),
    });
    const arena = new Float32Array(512);
    arena[400] = 32;
    arena[401] = 96;
    const state = makeRuntimeState(arena, new Map([['inst-dynamic', 3]]));

    const packed = packDrawPrepSinkTableV1(program, state);
    expect(packed).not.toBeNull();

    const words = packed!.words;
    expect(packed!.wordCount).toBe(
      DRAW_PREP_SINK_TABLE_HEADER_WORDS + DRAW_PREP_SINK_TABLE_RECORD_WORDS * 2,
    );
    expect(words[DrawPrepSinkTableHeaderWord.TotalRecordCount]).toBe(2);
    expect(words[DrawPrepSinkTableHeaderWord.IndexedRecordCount]).toBe(1);
    expect(words[DrawPrepSinkTableHeaderWord.NonIndexedRecordCount]).toBe(1);
    expect(words[DrawPrepSinkTableHeaderWord.NonIndexedRegionBaseWords]).toBe(5);

    const record0 = DRAW_PREP_SINK_TABLE_HEADER_WORDS;
    const record1 = record0 + DRAW_PREP_SINK_TABLE_RECORD_WORDS;

    expect(words[record0 + DrawPrepSinkTableRecordWord.DrawMode]).toBe(0);
    expect(words[record0 + DrawPrepSinkTableRecordWord.ShapeHandleWordOffset]).toBe(32);
    expect(words[record0 + DrawPrepSinkTableRecordWord.InstanceCount]).toBe(2);
    expect(words[record0 + DrawPrepSinkTableRecordWord.FirstInstance]).toBe(0);
    expect(words[record0 + DrawPrepSinkTableRecordWord.ShapeSourceCode]).toBe(0);
    expect(words[record0 + DrawPrepSinkTableRecordWord.PositionBaseOffset]).toBe(0);
    expect(words[record0 + DrawPrepSinkTableRecordWord.PositionLaneStride]).toBe(1);
    expect(words[record0 + DrawPrepSinkTableRecordWord.PositionComponentStride]).toBe(32);

    expect(words[record1 + DrawPrepSinkTableRecordWord.DrawMode]).toBe(1);
    expect(words[record1 + DrawPrepSinkTableRecordWord.ShapeHandleWordOffset]).toBe(96);
    expect(words[record1 + DrawPrepSinkTableRecordWord.InstanceCount]).toBe(3);
    expect(words[record1 + DrawPrepSinkTableRecordWord.FirstInstance]).toBe(2);
    expect(words[record1 + DrawPrepSinkTableRecordWord.ShapeSourceCode]).toBe(0);
  });

  it('fails fast when a dynamic sink count is missing for the current frame', () => {
    const sinks: readonly DrawPrepSinkIR[] = [
      {
        sinkIndex: 0,
        renderStepIndex: 0,
        instanceId: 'inst-missing' as any,
        indirectRecordIndex: 0,
        instanceCountMode: 'dynamic',
        drawMode: 'indexed',
        indirectRegion: 'indexed',
        indirectStrideBytes: 20,
        topologySource: 'shapeHeaderV1',
        firstInstanceSource: 'runtimePacked',
        indexedFirstIndex: 0,
        indexedBaseVertex: 0,
      },
    ];
    const program = makeProgram({
      sinks,
      renderSteps: [makeRenderStep(200)],
      exprArenaOffsetById: new Map([[200, 410]]),
    });
    const arena = new Float32Array(512);
    arena[410] = 16;
    const state = makeRuntimeState(arena);

    expect(() => packDrawPrepSinkTableV1(program, state)).toThrow('missing dynamic instance count');
  });

  it('supports slot-shape sinks when per-lane handles are homogeneous', () => {
    const sinks: readonly DrawPrepSinkIR[] = [
      {
        sinkIndex: 0,
        renderStepIndex: 0,
        instanceId: 'inst-slot' as any,
        indirectRecordIndex: 0,
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
    ];

    const program = makeProgram({
      sinks,
      renderSteps: [
        {
          kind: 'render',
          instanceId: 'inst-slot' as any,
          controlPointsSlot: 10 as any,
          colorSlot: 20 as any,
          shape: { k: 'slot', slot: 30 as any },
        },
      ],
      exprArenaOffsetById: new Map(),
    });

    const arena = new Float32Array(512);
    arena[300] = 64;
    arena[301] = 64;
    arena[302] = 64;
    const state = makeRuntimeState(arena);

    const packed = packDrawPrepSinkTableV1(program, state);
    expect(packed).not.toBeNull();
    const record0 = DRAW_PREP_SINK_TABLE_HEADER_WORDS;
    const words = packed!.words;
    expect(words[record0 + DrawPrepSinkTableRecordWord.ShapeSourceCode]).toBe(1);
    expect(words[record0 + DrawPrepSinkTableRecordWord.ShapeHandleWordOffset]).toBe(64);
    expect(words[record0 + DrawPrepSinkTableRecordWord.ShapeSlotBaseOffset]).toBe(300);
    expect(words[record0 + DrawPrepSinkTableRecordWord.ShapeSlotLaneStride]).toBe(1);
    expect(words[record0 + DrawPrepSinkTableRecordWord.ShapeSlotComponentStride]).toBe(32);
  });

  it('fails fast for heterogeneous slot-shape handles in one sink', () => {
    const sinks: readonly DrawPrepSinkIR[] = [
      {
        sinkIndex: 0,
        renderStepIndex: 0,
        instanceId: 'inst-slot' as any,
        indirectRecordIndex: 0,
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
    ];

    const program = makeProgram({
      sinks,
      renderSteps: [
        {
          kind: 'render',
          instanceId: 'inst-slot' as any,
          controlPointsSlot: 10 as any,
          colorSlot: 20 as any,
          shape: { k: 'slot', slot: 30 as any },
        },
      ],
      exprArenaOffsetById: new Map(),
    });

    const arena = new Float32Array(512);
    arena[300] = 64;
    arena[301] = 72;
    arena[302] = 64;
    const state = makeRuntimeState(arena);

    expect(() => packDrawPrepSinkTableV1(program, state)).toThrow('heterogeneous per-instance shape handles');
  });
});
