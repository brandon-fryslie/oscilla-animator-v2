import { describe, expect, it } from 'vitest';
import type { DrawPathInstancesOp } from '../../types';
import {
  RustRenderPayloadPacker,
  RUST_RENDER_INSTANCE_FLOATS,
  type DrawPrepSinkDescriptor,
} from '../RustRenderPayloadPacker';

function makeShapeBank(topologyId: number): {
  data: Uint32Array;
  volatilePtr: number;
  staticBoundary: number;
  topologyIdByHandle: Uint32Array;
} {
  const data = new Uint32Array(4);
  // indexCount=6, indexOffset=0, vertexCount=4, flags=closed
  data[0] = 6;
  data[1] = 0;
  data[2] = 4;
  data[3] = 1;
  const topologyIdByHandle = new Uint32Array(4);
  topologyIdByHandle[0] = topologyId >>> 0;
  return {
    data,
    volatilePtr: 4,
    staticBoundary: 0,
    topologyIdByHandle,
  };
}

function makeOp(topologyId: number, count: number, withStroke: boolean): DrawPathInstancesOp {
  return {
    kind: 'drawPathInstances',
    geometry: {
      topologyId,
      verbs: new Uint8Array([0, 1, 1, 1, 4]),
      points: new Float32Array([
        -1, -1,
        1, -1,
        1, 1,
        -1, 1,
      ]),
      pointsCount: 4,
      flags: 0,
    },
    instances: {
      count,
      position: new Float32Array(Array.from({ length: count * 2 }, (_, i) => (i % 2 === 0 ? 0.5 : 0.5))),
      size: new Float32Array(Array.from({ length: count }, () => 0.2)),
      rotation: new Float32Array(Array.from({ length: count }, () => 0)),
      scale2: new Float32Array(Array.from({ length: count * 2 }, (_, i) => (i % 2 === 0 ? 1 : 1))),
    },
    style: {
      fillColor: new Uint8ClampedArray([255, 0, 0, 255]),
      strokeColor: withStroke ? new Uint8ClampedArray([0, 255, 0, 255]) : undefined,
      strokeWidth: withStroke ? 0.02 : undefined,
    },
  };
}

describe('RustRenderPayloadPacker', () => {
  it('packs fill pass payload into topology/instance/indirect buffers', () => {
    const packer = new RustRenderPayloadPacker();
    const payload = packer.pack(
      {
        version: 2,
        ops: [makeOp(7, 1, false)],
      },
      makeShapeBank(7),
    );

    expect(payload.drawRecordCount).toBe(1);
    expect(payload.topologyWords).toEqual(new Uint32Array([6, 0, 4, 1]));
    expect(payload.instanceFloats.length).toBe(RUST_RENDER_INSTANCE_FLOATS);
    expect(payload.instanceFloats[6]).toBe(0);
    expect(payload.instanceFloats[8]).toBeCloseTo(1);
    expect(payload.instanceFloats[9]).toBeCloseTo(0);
    expect(payload.instanceFloats[10]).toBeCloseTo(0);
    expect(payload.instanceFloats[11]).toBeCloseTo(1);

    expect(payload.indirectArgsWords.length).toBe(5);
    expect(payload.indirectArgsWords[0]).toBe(6);
    expect(payload.indirectArgsWords[1]).toBe(1);
    expect(payload.indirectArgsWords[2]).toBe(0);
    expect(payload.indirectArgsWords[4]).toBe(0);

    expect(payload.vertexFloats.length).toBeGreaterThan(0);
    expect(payload.indexWords.length).toBe(6);
  });

  it('applies static draw-prep counts to each pass emitted from one source sink', () => {
    const packer = new RustRenderPayloadPacker();
    const sinks: DrawPrepSinkDescriptor[] = [{
      sinkIndex: 0,
      indirectRecordIndex: 0,
      instanceCountMode: 'static',
      staticInstanceCount: 1,
    }];

    const payload = packer.pack(
      {
        version: 2,
        ops: [makeOp(9, 2, true)],
      },
      makeShapeBank(9),
      sinks,
    );

    expect(payload.drawRecordCount).toBe(2);
    expect(payload.indirectArgsWords[1]).toBe(1);
    expect(payload.indirectArgsWords[6]).toBe(1);
    expect(payload.indirectArgsWords[9]).toBe(2);
  });

  it('fails when frame topology is missing from shape bank', () => {
    const packer = new RustRenderPayloadPacker();

    expect(() => packer.pack(
      {
        version: 2,
        ops: [makeOp(123, 1, false)],
      },
      makeShapeBank(999),
    )).toThrow(/missing from shape bank/i);
  });
});
