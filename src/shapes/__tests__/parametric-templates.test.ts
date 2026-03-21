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
} from '../parametric-templates';
import { TopologyType, ShapeClass } from '../types';

// =============================================================================
// Ribbon Template
// =============================================================================

describe('buildRibbonTemplate', () => {
  it('generates R+1 evenly-spaced t-values for resolution R', () => {
    const result = buildRibbonTemplate(4, 8);
    expect(result.vertexCount).toBe(5);
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
    const words = packParametricShapeBankRecord(payload, 100, 200, 2);

    // Total: 16 header + 5 t-values = 21 words
    expect(words.length).toBe(21);

    // Header fields
    expect(words[0]).toBe(ShapeClass.Type2Parametric); // Kind
    expect(words[1]).toBe(TopologyType.NonIndexed); // TopologyType
    expect(words[4]).toBe(0); // IndexCount (non-indexed)
    expect(words[5]).toBe(0); // FirstIndex (non-indexed)
    expect(words[6]).toBe(5); // VertexCount (R+1)
    expect(words[7]).toBe(16); // FirstVertex (always 16)
    expect(words[9]).toBe(8); // ParamStride

    // Arena addressing
    expect(words[11]).toBe(100); // CpArenaBaseOffset
    expect(words[14]).toBe(200); // CpArenaLaneStride
    expect(words[15]).toBe(2); // CpArenaComponentStride
  });

  it('blob record has correct header + template + index layout', () => {
    const payload = buildClosedBlobTemplate(4, 8);
    const words = packParametricShapeBankRecord(payload, 0, 0, 0);

    // Total: 16 header + 5 t-values + 12 indices = 33 words
    expect(words.length).toBe(33);

    // Header fields
    expect(words[0]).toBe(ShapeClass.Type2Parametric); // Kind
    expect(words[1]).toBe(TopologyType.Indexed); // TopologyType
    expect(words[4]).toBe(12); // IndexCount (4*3)
    expect(words[5]).toBe(21); // FirstIndex (16 + 5 t-values)
    expect(words[6]).toBe(5); // VertexCount (R+1)
    expect(words[7]).toBe(16); // FirstVertex (always 16)
    expect(words[9]).toBe(8); // ParamStride
  });

  it('template t-values are correctly packed as f32→u32 bit-cast', () => {
    const payload = buildRibbonTemplate(2, 4);
    const words = packParametricShapeBankRecord(payload, 0, 0, 0);

    // t-values at words[16..18]: [0.0, 0.5, 1.0]
    const f32View = new Float32Array(words.buffer, 16 * 4, 3);
    expect(f32View[0]).toBeCloseTo(0.0);
    expect(f32View[1]).toBeCloseTo(0.5);
    expect(f32View[2]).toBeCloseTo(1.0);
  });

  it('blob index payload is correctly packed after t-values', () => {
    const payload = buildClosedBlobTemplate(3, 8);
    const words = packParametricShapeBankRecord(payload, 0, 0, 0);

    // 16 header + 4 t-values + 9 indices = 29 words
    expect(words.length).toBe(29);

    // Index payload starts at word 20 (16 + 4)
    const indexStart = 20;
    const indices = Array.from(words.slice(indexStart, indexStart + 9));
    expect(indices).toEqual([0, 1, 2, 0, 2, 3, 0, 3, 1]);
  });
});
