import { describe, expect, it } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../../compiler/compile';
import type { ScheduleIR } from '../../compiler/backend/schedule-program';
import { computeRuntimeStorageSizes } from '../../compiler/ir/program';
import { executeFrame } from '../ScheduleExecutor';
import { createRuntimeState, readShapeBankHeader, SHAPE_BANK_HEADER_WORDS } from '../RuntimeState';
import { getTestArena } from './test-arena-helper';
import { packDrawPrepSinkTableV1 } from '../DrawPrepSinkTablePacker';
import {
  DRAW_PREP_SINK_TABLE_HEADER_WORDS,
  DrawPrepSinkTableHeaderWord,
  DrawPrepSinkTableRecordWord,
} from '../DrawPrepSinkTable';
import { ShapeBankHeaderWord } from '../RuntimeState';

const u32ToF32Scratch = new Uint32Array(1);
const f32FromU32Scratch = new Float32Array(u32ToF32Scratch.buffer);

function uint32BitsToFloat32(value: number): number {
  u32ToF32Scratch[0] = value >>> 0;
  return f32FromU32Scratch[0];
}

describe('S02 first type1 shape fixture', () => {
  it('compiles -> executes -> packs draw-prep + shape payload contract ready for render', () => {
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      void time;
      const ellipse = b.addBlock('Ellipse');
      b.setPortDefault(ellipse, 'rx', 0.06);
      b.setPortDefault(ellipse, 'ry', 0.04);

      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 1);

      const grid = b.addBlock('GridLayoutUV');
      b.setPortDefault(grid, 'rows', 1);
      b.setPortDefault(grid, 'cols', 1);

      const render = b.addBlock('RenderInstances2D');

      const color = b.addBlock('Const');
      b.setConfig(color, 'value', { r: 0.9, g: 0.4, b: 0.2, a: 1 });
      const colorField = b.addBlock('Broadcast');

      b.wire(ellipse, 'shape', array, 'element');
      b.wire(array, 'elements', grid, 'elements');
      b.wire(grid, 'controlPoints', render, 'controlPoints');
      b.wire(color, 'out', colorField, 'one');
      b.wire(colorField, 'field', render, 'color');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const program = result.program;
    const schedule = program.schedule as ScheduleIR;
    const sizes = computeRuntimeStorageSizes(program.runtimeSlots);
    void sizes;

    const state = createRuntimeState(
      schedule.stateSlotCount,
      schedule.eventSlotCount,
      program.valueExprs.nodes.length,
      program.arenaTotalFloats,
      undefined,
      undefined,
      program.arenaRuntimeLayout,
    );

    const arena = getTestArena();
    const frame = executeFrame(program, state, arena, 0);
    expect(frame.ops.length).toBeGreaterThan(0);
    expect(frame.ops[0]?.instances.count ?? 0).toBe(1);

    const packed = packDrawPrepSinkTableV1(program, state);
    expect(packed).not.toBeNull();
    if (!packed) return;

    const words = packed.words;
    expect(words[DrawPrepSinkTableHeaderWord.TotalRecordCount]).toBe(1);
    expect(words[DrawPrepSinkTableHeaderWord.IndexedRecordCount]).toBe(1);
    expect(words[DrawPrepSinkTableHeaderWord.NonIndexedRecordCount]).toBe(0);

    const recordBase = DRAW_PREP_SINK_TABLE_HEADER_WORDS;
    expect(words[recordBase + DrawPrepSinkTableRecordWord.DrawMode]).toBe(0);
    expect(words[recordBase + DrawPrepSinkTableRecordWord.Count]).toBeGreaterThan(0);
    expect(words[recordBase + DrawPrepSinkTableRecordWord.InstanceCount]).toBe(1);
    expect(words[recordBase + DrawPrepSinkTableRecordWord.FirstInstance]).toBe(0);

    const shapeHandleWordOffset = words[recordBase + DrawPrepSinkTableRecordWord.ShapeWordOffset] >>> 0;
    const shapeHeader = readShapeBankHeader(state.shapeBank.data, shapeHandleWordOffset);

    expect(shapeHeader.vertexCount).toBeGreaterThanOrEqual(3);
    expect(shapeHeader.paramBlockWords).toBe(shapeHeader.vertexCount * 2);
    expect(shapeHeader.paramBlockOffset).toBe(shapeHandleWordOffset + SHAPE_BANK_HEADER_WORDS);
    const expectedIndexCount = (shapeHeader.vertexCount - 2) * 3;
    expect(shapeHeader.indexCount).toBe(expectedIndexCount);
    expect(shapeHeader.flags & 1).toBe(1);

    const pointPayloadEnd = shapeHeader.paramBlockOffset + shapeHeader.paramBlockWords;
    expect(pointPayloadEnd).toBeLessThanOrEqual(state.shapeBank.volatilePtr);
    const realizedVertices = new Float32Array(shapeHeader.vertexCount * 2);
    for (let point = 0; point < shapeHeader.vertexCount; point++) {
      const wordBase = shapeHeader.paramBlockOffset + point * 2;
      realizedVertices[point * 2] = uint32BitsToFloat32(state.shapeBank.data[wordBase] ?? 0);
      realizedVertices[point * 2 + 1] = uint32BitsToFloat32(state.shapeBank.data[wordBase + 1] ?? 0);
    }
    expect(realizedVertices.length).toBe(shapeHeader.vertexCount * 2);
    expect(realizedVertices.every((value) => Number.isFinite(value))).toBe(true);
    const nonZeroPointCount = Array.from(realizedVertices).reduce((sum, value) => (
      sum + (Math.abs(value) > 1e-6 ? 1 : 0)
    ), 0);
    expect(nonZeroPointCount).toBeGreaterThan(2);

    const realizedIndices: number[] = [];
    if ((shapeHeader.flags & 1) !== 0 && shapeHeader.vertexCount >= 3) {
      for (let fan = 1; fan < shapeHeader.vertexCount - 1; fan++) {
        realizedIndices.push(shapeHeader.firstVertex);
        realizedIndices.push(shapeHeader.firstVertex + fan);
        realizedIndices.push(shapeHeader.firstVertex + fan + 1);
      }
    }
    expect(realizedIndices.length).toBe(shapeHeader.indexCount);
    expect(realizedIndices.length).toBeGreaterThan(0);

    const indexedIndirect = {
      indexCount: words[recordBase + DrawPrepSinkTableRecordWord.Count] >>> 0,
      instanceCount: words[recordBase + DrawPrepSinkTableRecordWord.InstanceCount] >>> 0,
      firstIndex: words[recordBase + DrawPrepSinkTableRecordWord.First] >>> 0,
      baseVertex: words[recordBase + DrawPrepSinkTableRecordWord.BaseVertex] | 0,
      firstInstance: words[recordBase + DrawPrepSinkTableRecordWord.FirstInstance] >>> 0,
    };

    expect(indexedIndirect.indexCount).toBeGreaterThan(0);
    expect(indexedIndirect.instanceCount).toBe(1);
    expect(state.shapeBank.data[shapeHandleWordOffset + ShapeBankHeaderWord.ParamBlockWords]).toBe(shapeHeader.paramBlockWords);
  });
});
