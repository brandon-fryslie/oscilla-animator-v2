import { describe, expect, it } from 'vitest';
import type { CompiledProgramIR } from '../../compiler/ir/program';
import type { StepRender } from '../../compiler/ir/types';
import { valueSlot, type ValueSlot } from '../../compiler/ir/Indices';
import { EMPTY_PROGRAM_TOPOLOGY_TABLE } from '../../compiler/ir/program-topology';
import { instanceId } from '../../core/ids';
import { ShapeClass } from '../../shapes/types';
import type { ArenaSlotDescriptor } from '../ArenaValueStore';
import {
  DRAW_PREP_SINK_TABLE_HEADER_WORDS,
  DRAW_PREP_SINK_TABLE_RECORD_WORDS,
  DRAW_PREP_SINK_DESCRIPTOR_WORDS,
  DrawPrepSinkTableRecordWord,
  DrawPrepSinkDescriptorWord,
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
  const sinks = steps.map((step, i) => ({
    sinkIndex: i,
    renderStepIndex: i,
    instanceId: step.instanceId,
    indirectRecordIndex: i,
    instanceCountMode: 'static' as const,
    staticInstanceCount: i + 2, // 2, 3, 4, ...
    shapeClass: ShapeClass.Type1Rigid,
    drawMode: 'indexed' as const,
    indirectRegion: 'indexed' as const,
    indirectStrideBytes: 20,
    topologySource: 'shapeHeaderV1' as const,
    firstInstanceSource: 'runtimePacked' as const,
    indexedFirstIndex: 0,
    indexedBaseVertex: 0,
  }));
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
    memoryManifest: { resources: [] },
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
      totalRecordCount: sinks.length,
      indexedRecordCount: sinks.length,
      indexedRegionBaseWords: 0,
      indexedStrideWords: 5,
      nonIndexedRecordCount: 0,
      nonIndexedRegionBaseWords: 0,
      nonIndexedStrideWords: 4,
      sinks,
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

function descriptorBaseWord(totalRecordCount: number, recordIndex: number): number {
  return DRAW_PREP_SINK_TABLE_HEADER_WORDS
    + totalRecordCount * DRAW_PREP_SINK_TABLE_RECORD_WORDS
    + recordIndex * DRAW_PREP_SINK_DESCRIPTOR_WORDS;
}

// [RECOVER-07] Tests verify static-only packer with compile-time shape word
// offsets. Record fields except drawMode are zero. Descriptors carry shape word
// offsets from the topology install stage (no arena round-trip).

function makeShapeWordOffsets(entries: Array<[slot: ValueSlot, wordOffset: number]>): ReadonlyMap<ValueSlot, number> {
  return new Map(entries);
}

describe('packDrawPrepSinkTableV1 static metadata only', () => {
  it('writes drawMode per record and zeros dynamic fields', () => {
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
    const shapeWordOffsets = makeShapeWordOffsets([[slotsA.shape, 42], [slotsB.shape, 128]]);

    const packed = packDrawPrepSinkTableV1(program, shapeWordOffsets);
    expect(packed).not.toBeNull();
    const words = packed!.words;

    // DrawMode is static — both sinks are indexed
    expect(readRecordU32(words, 0, DrawPrepSinkTableRecordWord.DrawMode)).toBe(0); // indexed
    expect(readRecordU32(words, 1, DrawPrepSinkTableRecordWord.DrawMode)).toBe(0); // indexed

    // Dynamic fields are zero — GPU draw-prep compute (RECOVER-06) will derive them
    expect(readRecordU32(words, 0, DrawPrepSinkTableRecordWord.Count)).toBe(0);
    expect(readRecordU32(words, 0, DrawPrepSinkTableRecordWord.InstanceCount)).toBe(0);
    expect(readRecordU32(words, 0, DrawPrepSinkTableRecordWord.First)).toBe(0);
    expect(readRecordU32(words, 0, DrawPrepSinkTableRecordWord.FirstInstance)).toBe(0);
    expect(readRecordU32(words, 0, DrawPrepSinkTableRecordWord.ShapeWordOffset)).toBe(0);
    expect(readRecordU32(words, 0, DrawPrepSinkTableRecordWord.MaterialId)).toBe(0);
    expect(readRecordU32(words, 1, DrawPrepSinkTableRecordWord.Count)).toBe(0);
    expect(readRecordU32(words, 1, DrawPrepSinkTableRecordWord.InstanceCount)).toBe(0);
    expect(readRecordU32(words, 1, DrawPrepSinkTableRecordWord.FirstInstance)).toBe(0);
  });

  it('writes symbolic descriptor slot ids', () => {
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
    const shapeWordOffsets = makeShapeWordOffsets([[slotsA.shape, 42], [slotsB.shape, 128]]);

    const packed = packDrawPrepSinkTableV1(program, shapeWordOffsets);
    expect(packed).not.toBeNull();
    const words = packed!.words;
    const totalRecords = packed!.header.totalRecordCount;

    // Verify descriptor for first sink (slotsA)
    // [LAW:one-source-of-truth] JS emits symbolic slot IDs; Rust MMU resolves
    // base/lane/component addresses before uploading sink-table words.
    const descA = descriptorBaseWord(totalRecords, 0);
    expect(words[descA + DrawPrepSinkDescriptorWord.PositionBaseOffset]).toBe(Number(slotsA.controlPoints));
    expect(words[descA + DrawPrepSinkDescriptorWord.PositionLaneStride]).toBe(0);
    expect(words[descA + DrawPrepSinkDescriptorWord.PositionComponentStride]).toBe(0);
    expect(words[descA + DrawPrepSinkDescriptorWord.ColorBaseOffset]).toBe(Number(slotsA.color));
    expect(words[descA + DrawPrepSinkDescriptorWord.ColorLaneStride]).toBe(0);
    expect(words[descA + DrawPrepSinkDescriptorWord.ColorComponentStride]).toBe(0);
    expect(words[descA + DrawPrepSinkDescriptorWord.ScaleBaseOffset]).toBe(Number(slotsA.scale));
    expect(words[descA + DrawPrepSinkDescriptorWord.ScaleLaneStride]).toBe(0);
    expect(words[descA + DrawPrepSinkDescriptorWord.ScaleComponentStride]).toBe(0);

    // Verify descriptor for second sink (slotsB)
    const descB = descriptorBaseWord(totalRecords, 1);
    expect(words[descB + DrawPrepSinkDescriptorWord.PositionBaseOffset]).toBe(Number(slotsB.controlPoints));
    expect(words[descB + DrawPrepSinkDescriptorWord.PositionLaneStride]).toBe(0);
    expect(words[descB + DrawPrepSinkDescriptorWord.PositionComponentStride]).toBe(0);
    expect(words[descB + DrawPrepSinkDescriptorWord.ColorBaseOffset]).toBe(Number(slotsB.color));
    expect(words[descB + DrawPrepSinkDescriptorWord.ColorLaneStride]).toBe(0);
    expect(words[descB + DrawPrepSinkDescriptorWord.ColorComponentStride]).toBe(0);
  });

  it('writes shape-slot address and instance-count metadata in descriptor', () => {
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
    const shapeWordOffsets = makeShapeWordOffsets([[slotsA.shape, 42], [slotsB.shape, 128]]);

    const packed = packDrawPrepSinkTableV1(program, shapeWordOffsets);
    expect(packed).not.toBeNull();
    const words = packed!.words;
    const totalRecords = packed!.header.totalRecordCount;

    // [RECOVER-05] Shape-slot descriptor is symbolic (slot id only).
    const descA = descriptorBaseWord(totalRecords, 0);
    expect(words[descA + DrawPrepSinkDescriptorWord.ShapeSlotBaseOffset]).toBe(Number(slotsA.shape));
    expect(words[descA + DrawPrepSinkDescriptorWord.ShapeSlotLaneStride]).toBe(0);
    expect(words[descA + DrawPrepSinkDescriptorWord.ShapeSlotComponentStride]).toBe(0);
    // Instance count metadata: static mode with count=2
    expect(words[descA + DrawPrepSinkDescriptorWord.InstanceCountMode]).toBe(0); // static
    expect(words[descA + DrawPrepSinkDescriptorWord.StaticInstanceCount]).toBe(2);
    // [RECOVER-07] Shape word offset from compile-time topology install
    expect(words[descA + DrawPrepSinkDescriptorWord.ShapeWordOffset]).toBe(42);

    const descB = descriptorBaseWord(totalRecords, 1);
    expect(words[descB + DrawPrepSinkDescriptorWord.ShapeSlotBaseOffset]).toBe(Number(slotsB.shape));
    expect(words[descB + DrawPrepSinkDescriptorWord.ShapeSlotLaneStride]).toBe(0);
    expect(words[descB + DrawPrepSinkDescriptorWord.ShapeSlotComponentStride]).toBe(0);
    // Instance count metadata: static mode with count=3
    expect(words[descB + DrawPrepSinkDescriptorWord.InstanceCountMode]).toBe(0); // static
    expect(words[descB + DrawPrepSinkDescriptorWord.StaticInstanceCount]).toBe(3);
    // [RECOVER-07] Shape word offset from compile-time topology install
    expect(words[descB + DrawPrepSinkDescriptorWord.ShapeWordOffset]).toBe(128);
  });

  it('returns null for empty sinks', () => {
    const program = {
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
    } as unknown as CompiledProgramIR;

    const packed = packDrawPrepSinkTableV1(program, new Map());
    expect(packed).toBeNull();
  });

  it('word capacity includes expanded descriptor size', () => {
    const slotsA: TestSinkSlotSet = {
      shape: valueSlot(1),
      controlPoints: valueSlot(2),
      color: valueSlot(3),
      scale: valueSlot(4),
    };
    const instanceA = instanceId('instance-a');
    const steps = [makeRenderStep(instanceA, slotsA)];
    const slotToArena = new Map<ValueSlot, ArenaSlotDescriptor>([
      [slotsA.shape, { offset: 0, stride: 1, laneCount: 1, length: 1 }],
      [slotsA.controlPoints, { offset: 10, stride: 2, laneCount: 1, length: 2 }],
      [slotsA.color, { offset: 20, stride: 4, laneCount: 1, length: 4 }],
      [slotsA.scale, { offset: 30, stride: 1, laneCount: 1, length: 1 }],
    ]);
    const program = makeMinimalProgram(steps, slotToArena);
    // Override to single sink
    (program as any).drawPrepProgram = {
      ...program.drawPrepProgram,
      totalRecordCount: 1,
      indexedRecordCount: 1,
      sinks: [program.drawPrepProgram.sinks[0]],
    };

    const shapeWordOffsets = makeShapeWordOffsets([[slotsA.shape, 16]]);
    const packed = packDrawPrepSinkTableV1(program, shapeWordOffsets);
    expect(packed).not.toBeNull();
    // header(8) + records(1*8) + descriptors(1*26) = 42
    expect(packed!.wordCount).toBe(DRAW_PREP_SINK_TABLE_HEADER_WORDS + 1 * DRAW_PREP_SINK_TABLE_RECORD_WORDS + 1 * DRAW_PREP_SINK_DESCRIPTOR_WORDS);
    expect(packed!.wordCount).toBe(8 + 8 + 26);
  });

  it('fails fast for unsupported dynamic instance counts', () => {
    const slots: TestSinkSlotSet = {
      shape: valueSlot(1),
      controlPoints: valueSlot(2),
      color: valueSlot(3),
      scale: valueSlot(4),
    };
    const instance = instanceId('instance-dynamic');
    const steps = [makeRenderStep(instance, slots)];
    const slotToArena = new Map<ValueSlot, ArenaSlotDescriptor>([
      [slots.shape, { offset: 0, stride: 1, laneCount: 1, length: 1 }],
      [slots.controlPoints, { offset: 10, stride: 2, laneCount: 1, length: 2 }],
      [slots.color, { offset: 20, stride: 4, laneCount: 1, length: 4 }],
      [slots.scale, { offset: 30, stride: 1, laneCount: 1, length: 1 }],
    ]);
    const program = makeMinimalProgram(steps, slotToArena);
    (program as any).drawPrepProgram = {
      ...program.drawPrepProgram,
      sinks: [
        {
          ...program.drawPrepProgram.sinks[0],
          instanceCountMode: 'dynamic',
          staticInstanceCount: undefined,
        },
      ],
    };

    expect(() => packDrawPrepSinkTableV1(program, makeShapeWordOffsets([[slots.shape, 16]]))).toThrow(
      /unsupported dynamic instance count/,
    );
  });
});
