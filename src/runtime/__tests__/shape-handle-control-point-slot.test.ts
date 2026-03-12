import { describe, expect, it } from 'vitest';
import {
  canonicalMany,
  canonicalType,
  FLOAT,
  HANDLE,
  VEC2,
  floatConst,
  instanceRef,
  unitNone,
  vec2Const,
} from '../../core/canonical-types';
import { domainTypeId, instanceId } from '../../core/ids';
import type { ValueExprId } from '../../compiler/ir/Indices';
import type { CompiledProgramIR } from '../../compiler/ir/program';
import type { ValueExpr } from '../../compiler/ir/value-expr';
import {
  SHAPE_BANK_NO_CONTROL_POINT_SLOT,
  createRuntimeState,
  readShapeBankHeader,
  readShapeBankHandleMetadata,
} from '../RuntimeState';
import { buildProgramTopologyTableFromIds } from '../../compiler/ir/program-topology';
import { materializeValueExpr } from '../ValueExprMaterializer';
import { registerDynamicTopology } from '../../shapes/registry';
import { PathVerb } from '../../shapes/types';

const PATH_TOPOLOGY_ID = registerDynamicTopology(
  {
    params: [{ name: 'radius', type: 'float', default: 1 }],
    verbs: [PathVerb.MOVE, PathVerb.LINE, PathVerb.CLOSE],
    pointsPerVerb: [1, 1, 0],
    totalControlPoints: 2,
    closed: true,
  },
  'shape-handle-control-point-slot-path',
);

const NON_PATH_TOPOLOGY_ID = registerDynamicTopology(
  {
    params: [{ name: 'radius', type: 'float', default: 1 }],
  },
  'shape-handle-control-point-slot-non-path',
);

const TYPE2_CUBIC_TOPOLOGY_ID = registerDynamicTopology(
  {
    params: [
      { name: 'resolution', type: 'float', default: 64 },
      { name: 'thickness', type: 'float', default: 0.02 },
    ],
    verbs: [PathVerb.MOVE, PathVerb.CUBIC, PathVerb.CLOSE],
    pointsPerVerb: [1, 3, 0],
    totalControlPoints: 4,
    closed: true,
  },
  'shape-handle-control-point-slot-type2-cubic',
);

function mockProgram(fieldExprToSlot: ReadonlyMap<number, number> = new Map()): CompiledProgramIR {
  return {
    runtimeAddressTable: {
      fieldExprToSlot,
    },
    topologyTable: buildProgramTopologyTableFromIds([
      PATH_TOPOLOGY_ID,
      NON_PATH_TOPOLOGY_ID,
      TYPE2_CUBIC_TOPOLOGY_ID,
    ]),
    kernelRegistry: {},
  } as unknown as CompiledProgramIR;
}

function createState(valueExprCount: number) {
  const state = createRuntimeState(0, 0, valueExprCount, 256);
  state.time = {
    tAbsMs: 0,
    tMs: 0,
    dt: 16.67,
    phaseA: 0,
    phaseB: 0,
    pulse: 0,
    palette: new Float32Array([1, 1, 1, 1]),
    energy: 0,
  };
  return state;
}

describe('shape handle control-point slot invariants', () => {
  it('fails when a path shapeRef omits controlPointField', () => {
    const state = createState(2);
    const valueExprs: ValueExpr[] = [
      {
        kind: 'shapeRef',
        type: canonicalType(HANDLE),
        topologyId: PATH_TOPOLOGY_ID,
        paramArgs: [],
      },
    ];

    // [LAW:single-enforcer] Materializer is the runtime boundary that rejects
    // missing path control-point metadata.
    expect(() =>
      materializeValueExpr(
        0 as ValueExprId,
        { nodes: valueExprs },
        instanceId('shape-instance'),
        1,
        state,
        mockProgram(),
      ),
    ).toThrow(/requires controlPointField/);
  });

  it('fails when a path shapeRef controlPointField has no runtime slot mapping', () => {
    const state = createState(3);
    const valueExprs: ValueExpr[] = [
      {
        kind: 'shapeRef',
        type: canonicalType(HANDLE),
        topologyId: PATH_TOPOLOGY_ID,
        paramArgs: [],
        controlPointField: 1 as ValueExprId,
      },
      {
        kind: 'const',
        value: floatConst(0),
        type: canonicalType(FLOAT),
      },
    ];

    // [LAW:one-source-of-truth] RuntimeAddressTable is authoritative for field
    // slot lookup; missing entries must fail-fast.
    expect(() =>
      materializeValueExpr(
        0 as ValueExprId,
        { nodes: valueExprs },
        instanceId('shape-instance'),
        1,
        state,
        mockProgram(new Map()),
      ),
    ).toThrow(/missing runtimeAddressTable fieldExprToSlot entry/);
  });

  it('allows non-path shapeRefs to keep NO_CONTROL_POINT_SLOT metadata', () => {
    const state = createState(2);
    const valueExprs: ValueExpr[] = [
      {
        kind: 'shapeRef',
        type: canonicalType(HANDLE),
        topologyId: NON_PATH_TOPOLOGY_ID,
        paramArgs: [],
      },
    ];

    const out = materializeValueExpr(
      0 as ValueExprId,
      { nodes: valueExprs },
      instanceId('shape-instance'),
      1,
      state,
      mockProgram(),
    );

    const handle = Math.trunc(out[0] ?? -1);
    expect(handle).toBeGreaterThanOrEqual(0);
    const metadata = readShapeBankHandleMetadata(state.shapeBank!, handle);
    expect(metadata.controlPointSlot).toBe(SHAPE_BANK_NO_CONTROL_POINT_SLOT);
  });

  it('materializes type2 cubic shapeRef into indexed ribbon payload with finite coordinates', () => {
    const controlInstance = instanceId('shape-handle-type2-control');
    const controlFieldExprId = 1 as ValueExprId;
    const controlFieldSlot = 17;
    const valueExprs: ValueExpr[] = [
      {
        kind: 'shapeRef',
        type: canonicalType(HANDLE),
        topologyId: TYPE2_CUBIC_TOPOLOGY_ID,
        paramArgs: [2 as ValueExprId, 3 as ValueExprId],
        controlPointField: controlFieldExprId,
      },
      {
        kind: 'const',
        value: vec2Const(0, 0),
        type: canonicalMany(
          VEC2,
          unitNone(),
          instanceRef('shape-domain', 'shape-handle-type2-control'),
        ),
      },
      {
        kind: 'const',
        value: floatConst(12),
        type: canonicalType(FLOAT),
      },
      {
        kind: 'const',
        value: floatConst(0.04),
        type: canonicalType(FLOAT),
      },
    ];
    const program = {
      ...mockProgram(new Map([[controlFieldExprId, controlFieldSlot]])),
      valueExprs: { nodes: valueExprs },
      schedule: {
        instances: new Map([
          [
            controlInstance,
            {
              id: controlInstance,
              domainType: domainTypeId('shape-domain'),
              count: 4,
              maxCount: 4,
              lifecycle: 'static',
              identityMode: 'none',
            },
          ],
        ]),
      },
    } as unknown as CompiledProgramIR;
    const state = createState(8);
    const out = materializeValueExpr(
      0 as ValueExprId,
      { nodes: valueExprs },
      instanceId('shape-instance'),
      1,
      state,
      program,
    );

    const handle = Math.trunc(out[0] ?? -1);
    expect(handle).toBeGreaterThanOrEqual(0);
    const header = readShapeBankHeader(state.shapeBank!.data, handle);
    expect(header.kind).toBe(2);
    expect(header.topologyMode).toBe(1);
    expect(header.flags & 1).toBe(1);
    expect(header.vertexCount).toBe(26);
    expect(header.indexCount).toBe((26 - 2) * 3);
    expect(header.paramBlockWords).toBe(52);
    const metadata = readShapeBankHandleMetadata(state.shapeBank!, handle);
    expect(metadata.controlPointSlot).toBe(controlFieldSlot);

    const payloadStart = header.paramBlockOffset;
    const payloadEnd = payloadStart + header.paramBlockWords;
    const payload = state.shapeBank!.data.subarray(payloadStart, payloadEnd);
    const decodeF32 = new Float32Array(1);
    const decodeU32 = new Uint32Array(decodeF32.buffer);
    for (const word of payload) {
      decodeU32[0] = word;
      expect(Number.isFinite(decodeF32[0])).toBe(true);
    }
  });
});
