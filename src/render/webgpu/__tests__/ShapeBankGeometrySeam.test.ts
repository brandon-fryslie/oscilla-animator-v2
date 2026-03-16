/**
 * Tests for ShapeBank geometry route classification seam.
 *
 * // [LAW:behavior-not-structure] Tests assert route classification behavior
 * // (Type1Rigid → shapeBankDirect, other → legacy), not implementation details.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyGeometryRoute,
  classifyAllGeometryRoutes,
  countDirectRoutes,
  hasDirectRoutes,
  dispatchGeometryRoutes,
  type GeometryRoute,
  type ShapeBankDirectGeometry,
} from '../ShapeBankGeometrySeam';
import {
  SHAPE_BANK_HEADER_WORDS,
  ShapeBankHeaderWord,
  createShapeBankHeaderV1,
  iterateShapeBankRecords,
  writeShapeBankHeader,
} from '../../../runtime/RuntimeState';
import { ShapeClass, TopologyMode } from '../../../shapes/types';
import type { RenderShapeBankSource } from '../WebGPUShapeBankManager';

function createTestShapeBankSource(
  requestedWords: number,
  records: Array<{ handle: number; header: ReturnType<typeof createShapeBankHeaderV1>; payloadWords?: number[] }> = [],
): { data: Uint32Array; source: RenderShapeBankSource } {
  const totalWords = records.reduce((maxWords, { handle, header, payloadWords = [] }) => {
    const recordWords = SHAPE_BANK_HEADER_WORDS + Math.max(header.paramBlockWords, payloadWords.length);
    return Math.max(maxWords, handle + recordWords);
  }, requestedWords);
  const data = new Uint32Array(totalWords);
  const topologyIdByHandle = new Uint32Array(totalWords);

  for (const { handle, header, payloadWords = [] } of records) {
    writeShapeBankHeader(data, handle, header);
    data.set(payloadWords, handle + SHAPE_BANK_HEADER_WORDS);
  }

  return {
    data,
    source: {
      data,
      volatilePtr: totalWords,
      staticBoundary: 0,
      topologyIdByHandle,
    },
  };
}

describe('classifyGeometryRoute', () => {
  it('classifies Type1Rigid as shapeBankDirect', () => {
    const { data } = createTestShapeBankSource(SHAPE_BANK_HEADER_WORDS, [
      {
        handle: 0,
        header: createShapeBankHeaderV1({
          kind: ShapeClass.Type1Rigid,
          topologyMode: TopologyMode.Path,
          flags: 1,
          vertexCount: 3,
          paramBlockOffset: 16,
          paramBlockWords: 6,
        }),
      },
    ]);

    const route = classifyGeometryRoute(data, 0);
    expect(route.kind).toBe('shapeBankDirect');

    const geometry = (route as Extract<GeometryRoute, { kind: 'shapeBankDirect' }>).geometry;
    expect(geometry.shapeWordOffset).toBe(0);
    expect(geometry.shapeClass).toBe(ShapeClass.Type1Rigid);
    expect(geometry.topologyMode).toBe(TopologyMode.Path);
    expect(geometry.flags).toBe(1);
    expect(geometry.vertexCount).toBe(3);
    expect(geometry.paramBlockOffset).toBe(16);
    expect(geometry.paramBlockWords).toBe(6);
  });

  it('classifies unknown Kind as legacy', () => {
    const data = new Uint32Array(SHAPE_BANK_HEADER_WORDS);
    data[ShapeBankHeaderWord.Kind] = 99; // Unknown shape class

    const route = classifyGeometryRoute(data, 0);
    expect(route.kind).toBe('legacy');
  });

  it('classifies Kind=0 (unset) as legacy', () => {
    const data = new Uint32Array(SHAPE_BANK_HEADER_WORDS);
    // All zeros — no kind set

    const route = classifyGeometryRoute(data, 0);
    expect(route.kind).toBe('legacy');
  });

  it('reads canonical header fields only (not worker-derived offsets)', () => {
    const { data } = createTestShapeBankSource(SHAPE_BANK_HEADER_WORDS, [
      {
        handle: 0,
        header: createShapeBankHeaderV1({
          kind: ShapeClass.Type1Rigid,
          topologyMode: TopologyMode.NonPath,
          flags: 0,
          vertexCount: 10,
          paramBlockOffset: 32,
          paramBlockWords: 20,
          // Worker-derived fields — seam must not depend on these
          indexCount: 24,
          firstIndex: 100,
          baseVertex: 50,
          firstVertex: 200,
        }),
      },
    ]);

    const route = classifyGeometryRoute(data, 0);
    expect(route.kind).toBe('shapeBankDirect');

    const geometry = (route as Extract<GeometryRoute, { kind: 'shapeBankDirect' }>).geometry;
    // Only canonical fields appear in the route
    expect(geometry.vertexCount).toBe(10);
    expect(geometry.paramBlockOffset).toBe(32);
    expect(geometry.paramBlockWords).toBe(20);
    expect(geometry.topologyMode).toBe(TopologyMode.NonPath);
    // Worker-derived fields are NOT in ShapeBankDirectGeometry
    expect('indexCount' in geometry).toBe(false);
    expect('firstIndex' in geometry).toBe(false);
    expect('baseVertex' in geometry).toBe(false);
    expect('firstVertex' in geometry).toBe(false);
  });

  it('handles non-zero shape word offset', () => {
    const data = new Uint32Array(SHAPE_BANK_HEADER_WORDS * 2);
    const secondHandle = SHAPE_BANK_HEADER_WORDS;
    writeShapeBankHeader(data, secondHandle, createShapeBankHeaderV1({
      kind: ShapeClass.Type1Rigid,
      topologyMode: TopologyMode.Path,
      flags: 0,
      vertexCount: 4,
      paramBlockOffset: 48,
      paramBlockWords: 8,
    }));

    const route = classifyGeometryRoute(data, secondHandle);
    expect(route.kind).toBe('shapeBankDirect');
    const geometry = (route as Extract<GeometryRoute, { kind: 'shapeBankDirect' }>).geometry;
    expect(geometry.shapeWordOffset).toBe(secondHandle);
    expect(geometry.vertexCount).toBe(4);
  });
});

describe('classifyAllGeometryRoutes', () => {
  it('returns empty map for empty source', () => {
    const source: RenderShapeBankSource = {
      data: new Uint32Array(0),
      volatilePtr: 0,
      staticBoundary: 0,
      topologyIdByHandle: new Uint32Array(0),
    };

    const routes = classifyAllGeometryRoutes(source);
    expect(routes.size).toBe(0);
  });

  it('classifies multiple shapes independently', () => {
    const totalWords = SHAPE_BANK_HEADER_WORDS * 3;
    const data = new Uint32Array(totalWords);

    // Shape 0: Type1Rigid
    writeShapeBankHeader(data, 0, createShapeBankHeaderV1({
      kind: ShapeClass.Type1Rigid,
      topologyMode: TopologyMode.Path,
      flags: 1,
      vertexCount: 3,
      paramBlockOffset: 0,
      paramBlockWords: 0,
    }));

    // Shape 1: Unknown kind (legacy)
    writeShapeBankHeader(data, SHAPE_BANK_HEADER_WORDS, createShapeBankHeaderV1({
      kind: 99 as ShapeClass,
      topologyMode: TopologyMode.NonPath,
      vertexCount: 5,
    }));

    // Shape 2: Type1Rigid
    writeShapeBankHeader(data, SHAPE_BANK_HEADER_WORDS * 2, createShapeBankHeaderV1({
      kind: ShapeClass.Type1Rigid,
      topologyMode: TopologyMode.Path,
      flags: 0,
      vertexCount: 6,
      paramBlockOffset: 0,
      paramBlockWords: 0,
    }));

    const source: RenderShapeBankSource = {
      data,
      volatilePtr: totalWords,
      staticBoundary: 0,
      topologyIdByHandle: new Uint32Array(totalWords),
    };

    const routes = classifyAllGeometryRoutes(source);
    expect(routes.size).toBe(3);
    expect(routes.get(0)!.kind).toBe('shapeBankDirect');
    expect(routes.get(SHAPE_BANK_HEADER_WORDS)!.kind).toBe('legacy');
    expect(routes.get(SHAPE_BANK_HEADER_WORDS * 2)!.kind).toBe('shapeBankDirect');
  });

  it('skips empty headers (all-zero words)', () => {
    const totalWords = SHAPE_BANK_HEADER_WORDS * 2;
    const data = new Uint32Array(totalWords);

    // Shape 0: all zeros — skipped
    // Shape 1: Type1Rigid
    writeShapeBankHeader(data, SHAPE_BANK_HEADER_WORDS, createShapeBankHeaderV1({
      kind: ShapeClass.Type1Rigid,
      topologyMode: TopologyMode.Path,
      vertexCount: 3,
    }));

    const source: RenderShapeBankSource = {
      data,
      volatilePtr: totalWords,
      staticBoundary: 0,
      topologyIdByHandle: new Uint32Array(totalWords),
    };

    const routes = classifyAllGeometryRoutes(source);
    expect(routes.size).toBe(1);
    expect(routes.has(0)).toBe(false);
    expect(routes.get(SHAPE_BANK_HEADER_WORDS)!.kind).toBe('shapeBankDirect');
  });

  it('advances across variable-length ShapeBank records by header plus param payload', () => {
    const firstHandle = 0;
    const secondHandle = SHAPE_BANK_HEADER_WORDS + 4;
    const totalWords = secondHandle + SHAPE_BANK_HEADER_WORDS;
    const { source } = createTestShapeBankSource(totalWords, [
      {
        handle: firstHandle,
        header: createShapeBankHeaderV1({
          kind: ShapeClass.Type1Rigid,
          topologyMode: TopologyMode.Path,
          vertexCount: 3,
          paramBlockOffset: SHAPE_BANK_HEADER_WORDS,
          paramBlockWords: 4,
        }),
        payloadWords: [1, 2, 3, 4],
      },
      {
        handle: secondHandle,
        header: createShapeBankHeaderV1({
          kind: 99 as ShapeClass,
          topologyMode: TopologyMode.NonPath,
          vertexCount: 5,
          paramBlockWords: 0,
        }),
      },
    ]);

    const handles = Array.from(iterateShapeBankRecords(source), (record) => record.handle);
    expect(handles).toEqual([firstHandle, secondHandle]);

    const routes = classifyAllGeometryRoutes(source);
    expect(routes.size).toBe(2);
    expect(routes.get(firstHandle)?.kind).toBe('shapeBankDirect');
    expect(routes.get(secondHandle)?.kind).toBe('legacy');
  });
});

describe('route utility functions', () => {
  it('countDirectRoutes counts shapeBankDirect routes', () => {
    const routes = new Map<number, GeometryRoute>([
      [0, { kind: 'shapeBankDirect', geometry: {} as ShapeBankDirectGeometry }],
      [16, { kind: 'legacy' }],
      [32, { kind: 'shapeBankDirect', geometry: {} as ShapeBankDirectGeometry }],
    ]);
    expect(countDirectRoutes(routes)).toBe(2);
  });

  it('countDirectRoutes returns 0 for all-legacy', () => {
    const routes = new Map<number, GeometryRoute>([
      [0, { kind: 'legacy' }],
      [16, { kind: 'legacy' }],
    ]);
    expect(countDirectRoutes(routes)).toBe(0);
  });

  it('hasDirectRoutes returns true when direct routes exist', () => {
    const routes = new Map<number, GeometryRoute>([
      [0, { kind: 'legacy' }],
      [16, { kind: 'shapeBankDirect', geometry: {} as ShapeBankDirectGeometry }],
    ]);
    expect(hasDirectRoutes(routes)).toBe(true);
  });

  it('hasDirectRoutes returns false when no direct routes exist', () => {
    const routes = new Map<number, GeometryRoute>([
      [0, { kind: 'legacy' }],
    ]);
    expect(hasDirectRoutes(routes)).toBe(false);
  });

  it('hasDirectRoutes returns false for empty map', () => {
    expect(hasDirectRoutes(new Map())).toBe(false);
  });
});

describe('dispatchGeometryRoutes', () => {
  it('dispatches shapeBankDirect routes via callback', () => {
    const { source } = createTestShapeBankSource(SHAPE_BANK_HEADER_WORDS * 2, [
      {
        handle: 0,
        header: createShapeBankHeaderV1({
          kind: ShapeClass.Type1Rigid,
          topologyMode: TopologyMode.Path,
          vertexCount: 3,
          paramBlockOffset: 0,
          paramBlockWords: 0,
        }),
      },
      {
        handle: SHAPE_BANK_HEADER_WORDS,
        header: createShapeBankHeaderV1({
          kind: ShapeClass.Type1Rigid,
          topologyMode: TopologyMode.NonPath,
          vertexCount: 5,
          paramBlockOffset: 0,
          paramBlockWords: 0,
        }),
      },
    ]);

    const dispatched: ShapeBankDirectGeometry[] = [];
    const result = dispatchGeometryRoutes(source, (geo) => dispatched.push(geo));

    expect(dispatched.length).toBe(2);
    expect(result.directDispatchCount).toBe(2);
    expect(result.routes.size).toBe(2);
    expect(dispatched[0]!.vertexCount).toBe(3);
    expect(dispatched[1]!.vertexCount).toBe(5);
  });

  it('does not dispatch legacy routes via callback', () => {
    const { source } = createTestShapeBankSource(SHAPE_BANK_HEADER_WORDS * 2, [
      {
        handle: 0,
        header: createShapeBankHeaderV1({
          kind: 99 as ShapeClass,
          topologyMode: TopologyMode.Path,
          vertexCount: 3,
        }),
      },
      {
        handle: SHAPE_BANK_HEADER_WORDS,
        header: createShapeBankHeaderV1({
          kind: 99 as ShapeClass,
          topologyMode: TopologyMode.NonPath,
          vertexCount: 5,
        }),
      },
    ]);

    const dispatched: ShapeBankDirectGeometry[] = [];
    const result = dispatchGeometryRoutes(source, (geo) => dispatched.push(geo));

    expect(dispatched.length).toBe(0);
    expect(result.directDispatchCount).toBe(0);
    expect(result.routes.size).toBe(2);
  });

  it('dispatches only Type1Rigid in mixed bank', () => {
    const { source } = createTestShapeBankSource(SHAPE_BANK_HEADER_WORDS * 3, [
      {
        handle: 0,
        header: createShapeBankHeaderV1({
          kind: ShapeClass.Type1Rigid,
          topologyMode: TopologyMode.Path,
          vertexCount: 3,
        }),
      },
      {
        handle: SHAPE_BANK_HEADER_WORDS,
        header: createShapeBankHeaderV1({
          kind: 99 as ShapeClass,
          topologyMode: TopologyMode.NonPath,
          vertexCount: 5,
        }),
      },
      {
        handle: SHAPE_BANK_HEADER_WORDS * 2,
        header: createShapeBankHeaderV1({
          kind: ShapeClass.Type1Rigid,
          topologyMode: TopologyMode.Path,
          vertexCount: 6,
        }),
      },
    ]);

    const dispatched: ShapeBankDirectGeometry[] = [];
    const result = dispatchGeometryRoutes(source, (geo) => dispatched.push(geo));

    expect(dispatched.length).toBe(2);
    expect(result.directDispatchCount).toBe(2);
    expect(result.routes.size).toBe(3);
    // All dispatched shapes are Type1Rigid
    for (const geo of dispatched) {
      expect(geo.shapeClass).toBe(ShapeClass.Type1Rigid);
    }
  });

  it('returns empty result for empty source', () => {
    const source: RenderShapeBankSource = {
      data: new Uint32Array(0),
      volatilePtr: 0,
      staticBoundary: 0,
      topologyIdByHandle: new Uint32Array(0),
    };

    const dispatched: ShapeBankDirectGeometry[] = [];
    const result = dispatchGeometryRoutes(source, (geo) => dispatched.push(geo));

    expect(dispatched.length).toBe(0);
    expect(result.directDispatchCount).toBe(0);
    expect(result.routes.size).toBe(0);
  });
});
