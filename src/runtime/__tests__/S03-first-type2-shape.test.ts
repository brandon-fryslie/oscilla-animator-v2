import { describe, expect, it } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../../compiler/compile';
import type { ScheduleIR } from '../../compiler/backend/schedule-program';
import { executeFrame } from '../ScheduleExecutor';
import {
  createRuntimeState,
  readShapeBankHeader,
  SHAPE_BANK_HEADER_WORDS,
} from '../RuntimeState';
import { getTestArena } from './test-arena-helper';
import { packDrawPrepSinkTableV1 } from '../DrawPrepSinkTablePacker';
import {
  DRAW_PREP_SINK_TABLE_HEADER_WORDS,
  DrawPrepSinkTableRecordWord,
} from '../DrawPrepSinkTable';

const u32Bits = new Uint32Array(1);
const f32Bits = new Float32Array(u32Bits.buffer);

function u32ToF32(value: number): number {
  u32Bits[0] = value >>> 0;
  return f32Bits[0];
}

function executeType2Fixture(opts: {
  p0: [number, number];
  p1: [number, number];
  p2: [number, number];
  p3: [number, number];
  resolution: number;
}) {
  const patch = buildPatch((b) => {
    const time = b.addBlock('InfiniteTimeRoot');
    void time;

    const curve = b.addBlock('CubicBezier2D');
    b.setPortDefault(curve, 'p0x', opts.p0[0]);
    b.setPortDefault(curve, 'p0y', opts.p0[1]);
    b.setPortDefault(curve, 'p1x', opts.p1[0]);
    b.setPortDefault(curve, 'p1y', opts.p1[1]);
    b.setPortDefault(curve, 'p2x', opts.p2[0]);
    b.setPortDefault(curve, 'p2y', opts.p2[1]);
    b.setPortDefault(curve, 'p3x', opts.p3[0]);
    b.setPortDefault(curve, 'p3y', opts.p3[1]);
    b.setPortDefault(curve, 'resolution', opts.resolution);

    const array = b.addBlock('Array');
    b.setPortDefault(array, 'count', 1);

    const layout = b.addBlock('GridLayoutUV');
    b.setPortDefault(layout, 'rows', 1);
    b.setPortDefault(layout, 'cols', 1);

    const render = b.addBlock('RenderInstances2D');

    const color = b.addBlock('Const');
    b.setConfig(color, 'value', { r: 0.2, g: 0.6, b: 1.0, a: 1 });
    const colorField = b.addBlock('Broadcast');

    b.wire(curve, 'shape', array, 'element');
    b.wire(array, 'elements', layout, 'elements');
    b.wire(layout, 'controlPoints', render, 'controlPoints');
    b.wire(color, 'out', colorField, 'one');
    b.wire(colorField, 'field', render, 'color');
  });

  const compileResult = compile(patch);
  expect(compileResult.kind).toBe('ok');
  if (compileResult.kind !== 'ok') {
    throw new Error('compile failed');
  }
  const program = compileResult.program;
  const schedule = program.schedule as ScheduleIR;
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
  executeFrame(program, state, arena, 0);
  const packed = packDrawPrepSinkTableV1(program, state);
  expect(packed).not.toBeNull();
  if (!packed) {
    throw new Error('draw-prep sink table pack failed');
  }

  const recordBase = DRAW_PREP_SINK_TABLE_HEADER_WORDS;
  const shapeHandleWordOffset = packed.words[recordBase + DrawPrepSinkTableRecordWord.ShapeHandleWordOffset] >>> 0;
  const header = readShapeBankHeader(state.shapeBank.data, shapeHandleWordOffset);
  const vertices = new Float32Array(header.vertexCount * 2);
  for (let point = 0; point < header.vertexCount; point++) {
    const wordBase = header.paramBlockOffset + point * 2;
    vertices[point * 2] = u32ToF32(state.shapeBank.data[wordBase] ?? 0);
    vertices[point * 2 + 1] = u32ToF32(state.shapeBank.data[wordBase + 1] ?? 0);
  }

  return { packedWords: packed.words, shapeHandleWordOffset, header, vertices, shapeBank: state.shapeBank };
}

describe('S03 first type2 parametric shape fixture', () => {
  it('materializes sampled cubic Bezier payload with deterministic shape-bank contract', () => {
    const result = executeType2Fixture({
      p0: [0, 0],
      p1: [0, 1],
      p2: [1, 1],
      p3: [1, 0],
      resolution: 4,
    });

    expect(result.header.vertexCount).toBe(10);
    expect(result.header.paramBlockWords).toBe(20);
    expect(result.header.paramBlockOffset).toBe(result.shapeHandleWordOffset + SHAPE_BANK_HEADER_WORDS);
    expect(result.header.flags & 1).toBe(1);
    expect(Array.from(result.vertices).every(Number.isFinite)).toBe(true);

    // Ribbon midpoint samples should straddle the analytic centerline at B(0.5)=(0.5, 0.75).
    const upperMidX = result.vertices[4];
    const upperMidY = result.vertices[5];
    const lowerMidX = result.vertices[14];
    const lowerMidY = result.vertices[15];
    expect(upperMidX).toBeCloseTo(0.5, 6);
    expect(lowerMidX).toBeCloseTo(0.5, 6);
    expect((upperMidY + lowerMidY) * 0.5).toBeCloseTo(0.75, 5);
    expect(Math.abs(upperMidY - lowerMidY)).toBeGreaterThan(0);
  });

  it('guards degenerate control points without emitting NaN payload', () => {
    const result = executeType2Fixture({
      p0: [0, 0],
      p1: [0, 0],
      p2: [0, 0],
      p3: [0, 0],
      resolution: 16,
    });

    expect(result.header.vertexCount).toBe(34);
    expect(result.vertices.every((value) => Number.isFinite(value))).toBe(true);
    expect(result.vertices.every((value) => Math.abs(value) <= 1e-7)).toBe(true);
  });
});
