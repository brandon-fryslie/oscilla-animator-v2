/**
 * Parametric Templates — Type 2 ShapeBank ABI tests.
 *
 * Validates template payload generation (ribbon + closed blob) and
 * ShapeBank record packing against the canonical ABI contract.
 */

import { describe, expect, it } from 'vitest';
import {
  buildRibbonTemplate,
  buildClosedBlobTemplate,
  packParametricShapeBankRecord,
  parametricRecordWordCount,
} from '../parametric-templates';
import { TopologyType, ShapeClass } from '../types';
import { ShapeBankHeaderWord } from '../../runtime/RuntimeState';

/** Helper: allocate a buffer and pack a record at offset 0, return the filled region. */
function packIntoFreshBuffer(
  ...args: Parameters<typeof packParametricShapeBankRecord> extends [infer _T, infer _O, ...infer R] ? R : never
): { words: Uint32Array; wordCount: number } {
  const [payload, ...rest] = args;
  const wordCount = parametricRecordWordCount(payload);
  const words = new Uint32Array(wordCount);
  packParametricShapeBankRecord(words, 0, payload, ...rest);
  return { words, wordCount };
}

// =============================================================================
// Ribbon Template
// =============================================================================

describe('buildRibbonTemplate', () => {
  it('generates R+1 evenly-spaced t-values and R*6 draw vertices for resolution R', () => {
    const result = buildRibbonTemplate(4, 8);
    // Draw vertex count is R*6 (6 vertices per quad segment).
    expect(result.vertexCount).toBe(24);
    // Template stores R+1 t-values (segment endpoints).
    expect(result.templateValues.length).toBe(5);
    expect(Array.from(result.templateValues)).toEqual([0.0, 0.25, 0.5, 0.75, 1.0]);
  });

  it('is non-indexed with zero indices', () => {
    const result = buildRibbonTemplate(4, 8);
    expect(result.topologyType).toBe(TopologyType.NonIndexed);
    expect(result.indexCount).toBe(0);
    expect(result.indices.length).toBe(0);
  });

  it('preserves paramStride', () => {
    const result = buildRibbonTemplate(10, 8);
    expect(result.paramStride).toBe(8);
  });

  it('resolution 1 produces [0.0, 1.0]', () => {
    const result = buildRibbonTemplate(1, 4);
    expect(Array.from(result.templateValues)).toEqual([0.0, 1.0]);
  });

  it('throws on resolution < 1', () => {
    expect(() => buildRibbonTemplate(0, 8)).toThrow();
  });
});

// =============================================================================
// Closed Blob Template
// =============================================================================

describe('buildClosedBlobTemplate', () => {
  it('generates centroid + R perimeter vertices', () => {
    const result = buildClosedBlobTemplate(4, 8);
    expect(result.vertexCount).toBe(5); // centroid + 4 perimeter
    expect(result.templateValues.length).toBe(5);
  });

  it('vertex 0 is centroid sentinel t = -1.0', () => {
    const result = buildClosedBlobTemplate(4, 8);
    expect(result.templateValues[0]).toBe(-1.0);
  });

  it('perimeter t-values are [0/R, 1/R, ..., (R-1)/R]', () => {
    const result = buildClosedBlobTemplate(4, 8);
    const perimeter = Array.from(result.templateValues).slice(1);
    expect(perimeter).toEqual([0.0, 0.25, 0.5, 0.75]);
  });

  it('is indexed with R*3 triangle fan indices', () => {
    const result = buildClosedBlobTemplate(4, 8);
    expect(result.topologyType).toBe(TopologyType.Indexed);
    expect(result.indexCount).toBe(12); // 4 * 3
    expect(result.indices.length).toBe(12);
  });

  it('triangle fan indices form [0,1,2, 0,2,3, 0,3,4, 0,4,1]', () => {
    const result = buildClosedBlobTemplate(4, 8);
    const idx = Array.from(result.indices);
    // Triangle 0: centroid, perimeter[0], perimeter[1]
    expect(idx.slice(0, 3)).toEqual([0, 1, 2]);
    // Triangle 1: centroid, perimeter[1], perimeter[2]
    expect(idx.slice(3, 6)).toEqual([0, 2, 3]);
    // Triangle 2: centroid, perimeter[2], perimeter[3]
    expect(idx.slice(6, 9)).toEqual([0, 3, 4]);
    // Triangle 3: centroid, perimeter[3], perimeter[0] (closing fan)
    expect(idx.slice(9, 12)).toEqual([0, 4, 1]);
  });

  it('R=3 produces minimal triangle fan', () => {
    const result = buildClosedBlobTemplate(3, 8);
    expect(result.vertexCount).toBe(4);
    expect(result.indexCount).toBe(9);
    const idx = Array.from(result.indices);
    expect(idx).toEqual([0, 1, 2, 0, 2, 3, 0, 3, 1]);
  });

  it('throws on resolution < 3', () => {
    expect(() => buildClosedBlobTemplate(2, 8)).toThrow();
    expect(() => buildClosedBlobTemplate(0, 8)).toThrow();
  });

  it('preserves paramStride', () => {
    const result = buildClosedBlobTemplate(6, 12);
    expect(result.paramStride).toBe(12);
  });
});

// =============================================================================
// ShapeBank Record Packing
// =============================================================================

describe('packParametricShapeBankRecord', () => {
  it('ribbon record has correct header + template layout', () => {
    const payload = buildRibbonTemplate(4, 8);
    const { words, wordCount } = packIntoFreshBuffer(payload, 100, 200, 2);

    // Total: 16 header + 5 t-values = 21 words
    expect(wordCount).toBe(21);

    // Header fields via ShapeBankHeaderWord enum
    expect(words[ShapeBankHeaderWord.Kind]).toBe(ShapeClass.Type2Parametric);
    expect(words[ShapeBankHeaderWord.TopologyMode]).toBe(TopologyType.NonIndexed);
    expect(words[ShapeBankHeaderWord.IndexCount]).toBe(0); // non-indexed
    expect(words[ShapeBankHeaderWord.FirstIndex]).toBe(0); // non-indexed
    expect(words[ShapeBankHeaderWord.VertexCount]).toBe(24); // R*6
    expect(words[ShapeBankHeaderWord.FirstVertex]).toBe(16); // always 16
    expect(words[ShapeBankHeaderWord.ParamBlockOffset]).toBe(8); // ParamStride

    // Arena addressing
    expect(words[ShapeBankHeaderWord.CpArenaBaseOffset]).toBe(100);
    expect(words[ShapeBankHeaderWord.CpArenaLaneStride]).toBe(200);
    expect(words[ShapeBankHeaderWord.CpArenaComponentStride]).toBe(2);
  });

  it('blob record has correct header + template + index layout', () => {
    const payload = buildClosedBlobTemplate(4, 8);
    const { words, wordCount } = packIntoFreshBuffer(payload, 0, 0, 0);

    // Total: 16 header + 5 t-values + 12 indices = 33 words
    expect(wordCount).toBe(33);

    // Header fields via ShapeBankHeaderWord enum
    expect(words[ShapeBankHeaderWord.Kind]).toBe(ShapeClass.Type2Parametric);
    expect(words[ShapeBankHeaderWord.TopologyMode]).toBe(TopologyType.Indexed);
    expect(words[ShapeBankHeaderWord.IndexCount]).toBe(12); // 4*3
    expect(words[ShapeBankHeaderWord.FirstIndex]).toBe(21); // 16 + 5 t-values
    expect(words[ShapeBankHeaderWord.VertexCount]).toBe(5); // R+1
    expect(words[ShapeBankHeaderWord.FirstVertex]).toBe(16); // always 16
    expect(words[ShapeBankHeaderWord.ParamBlockOffset]).toBe(8); // ParamStride
  });

  it('template t-values are correctly packed as f32→u32 bit-cast', () => {
    const payload = buildRibbonTemplate(2, 4);
    const { words } = packIntoFreshBuffer(payload, 0, 0, 0);

    // t-values at words[16..18]: [0.0, 0.5, 1.0]
    const f32View = new Float32Array(words.buffer, 16 * 4, 3);
    expect(f32View[0]).toBeCloseTo(0.0);
    expect(f32View[1]).toBeCloseTo(0.5);
    expect(f32View[2]).toBeCloseTo(1.0);
  });

  it('blob index payload is correctly packed after t-values', () => {
    const payload = buildClosedBlobTemplate(3, 8);
    const { words, wordCount } = packIntoFreshBuffer(payload, 0, 0, 0);

    // 16 header + 4 t-values + 9 indices = 29 words
    expect(wordCount).toBe(29);

    // Index payload starts at word 20 (16 + 4)
    const indexStart = 20;
    const indices = Array.from(words.slice(indexStart, indexStart + 9));
    expect(indices).toEqual([0, 1, 2, 0, 2, 3, 0, 3, 1]);
  });

  it('writes at non-zero offset into pre-allocated buffer', () => {
    const payload = buildRibbonTemplate(2, 4);
    const recordWords = parametricRecordWordCount(payload);
    const bufferOffset = 32; // simulate writing after another record
    const target = new Uint32Array(bufferOffset + recordWords);
    const written = packParametricShapeBankRecord(target, bufferOffset, payload, 50, 100, 3);

    expect(written).toBe(recordWords);

    // Header at offset
    expect(target[bufferOffset + ShapeBankHeaderWord.Kind]).toBe(ShapeClass.Type2Parametric);
    expect(target[bufferOffset + ShapeBankHeaderWord.VertexCount]).toBe(12); // R*6 = 2*6
    expect(target[bufferOffset + ShapeBankHeaderWord.CpArenaBaseOffset]).toBe(50);
    expect(target[bufferOffset + ShapeBankHeaderWord.CpArenaLaneStride]).toBe(100);
    expect(target[bufferOffset + ShapeBankHeaderWord.CpArenaComponentStride]).toBe(3);

    // t-values at offset + 16
    const f32View = new Float32Array(target.buffer, (bufferOffset + 16) * 4, 3);
    expect(f32View[0]).toBeCloseTo(0.0);
    expect(f32View[1]).toBeCloseTo(0.5);
    expect(f32View[2]).toBeCloseTo(1.0);

    // Words before offset are untouched
    expect(target[0]).toBe(0);
  });

  it('parametricRecordWordCount matches actual written words', () => {
    const ribbon = buildRibbonTemplate(4, 8);
    expect(parametricRecordWordCount(ribbon)).toBe(21); // 16 + 5

    const blob = buildClosedBlobTemplate(4, 8);
    expect(parametricRecordWordCount(blob)).toBe(33); // 16 + 5 + 12
  });
});
