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
import {
  PARAMETRIC_CUBIC_CONTROL_POINT_COUNT,
  PARAMETRIC_RESOLUTION_DEFAULT,
  PARAMETRIC_THICKNESS_DEFAULT,
} from '../../shapes/parametric-contract';

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
      { name: 'resolution', type: 'float', default: PARAMETRIC_RESOLUTION_DEFAULT },
      { name: 'thickness', type: 'float', default: PARAMETRIC_THICKNESS_DEFAULT },
    ],
    verbs: [PathVerb.MOVE, PathVerb.CUBIC, PathVerb.CLOSE],
    pointsPerVerb: [1, 3, 0],
    totalControlPoints: PARAMETRIC_CUBIC_CONTROL_POINT_COUNT,
    closed: true,
  },
  'shape-handle-control-point-slot-type2-cubic',
);

const TYPE2_CUBIC_REORDERED_PARAMS_TOPOLOGY_ID = registerDynamicTopology(
  {
    params: [
      { name: 'thickness', type: 'float', default: PARAMETRIC_THICKNESS_DEFAULT },
      { name: 'resolution', type: 'float', default: PARAMETRIC_RESOLUTION_DEFAULT },
    ],
    verbs: [PathVerb.MOVE, PathVerb.CUBIC, PathVerb.CLOSE],
    pointsPerVerb: [1, 3, 0],
    totalControlPoints: PARAMETRIC_CUBIC_CONTROL_POINT_COUNT,
    closed: true,
  },
  'shape-handle-control-point-slot-type2-cubic-reordered-params',
);

const TYPE2_CUBIC_MISSING_THICKNESS_TOPOLOGY_ID = registerDynamicTopology(
  {
    params: [
      { name: 'resolution', type: 'float', default: PARAMETRIC_RESOLUTION_DEFAULT },
    ],
    verbs: [PathVerb.MOVE, PathVerb.CUBIC, PathVerb.CLOSE],
    pointsPerVerb: [1, 3, 0],
    totalControlPoints: PARAMETRIC_CUBIC_CONTROL_POINT_COUNT,
    closed: true,
  },
  'shape-handle-control-point-slot-type2-cubic-missing-thickness',
);

const CUBIC_FOUR_POINT_NON_TYPE2_TOPOLOGY_ID = registerDynamicTopology(
  {
    params: [],
    verbs: [PathVerb.MOVE, PathVerb.CUBIC, PathVerb.CLOSE],
    pointsPerVerb: [1, 3, 0],
    totalControlPoints: PARAMETRIC_CUBIC_CONTROL_POINT_COUNT,
    closed: true,
  },
  'shape-handle-control-point-slot-cubic-four-point-non-type2',
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
      TYPE2_CUBIC_REORDERED_PARAMS_TOPOLOGY_ID,
      TYPE2_CUBIC_MISSING_THICKNESS_TOPOLOGY_ID,
      CUBIC_FOUR_POINT_NON_TYPE2_TOPOLOGY_ID,
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
              count: PARAMETRIC_CUBIC_CONTROL_POINT_COUNT,
              maxCount: PARAMETRIC_CUBIC_CONTROL_POINT_COUNT,
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

  it('uses Type 2 topology defaults when paramArgs are omitted', () => {
    const controlInstance = instanceId('shape-handle-type2-default-control');
    const controlFieldExprId = 1 as ValueExprId;
    const valueExprs: ValueExpr[] = [
      {
        kind: 'shapeRef',
        type: canonicalType(HANDLE),
        topologyId: TYPE2_CUBIC_TOPOLOGY_ID,
        paramArgs: [],
        controlPointField: controlFieldExprId,
      },
      {
        kind: 'const',
        value: vec2Const(0, 0),
        type: canonicalMany(
          VEC2,
          unitNone(),
          instanceRef('shape-domain', 'shape-handle-type2-default-control'),
        ),
      },
    ];
    const program = {
      ...mockProgram(new Map([[controlFieldExprId, 19]])),
      valueExprs: { nodes: valueExprs },
      schedule: {
        instances: new Map([
          [
            controlInstance,
            {
              id: controlInstance,
              domainType: domainTypeId('shape-domain'),
              count: PARAMETRIC_CUBIC_CONTROL_POINT_COUNT,
              maxCount: PARAMETRIC_CUBIC_CONTROL_POINT_COUNT,
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
    const expectedVertexCount = (PARAMETRIC_RESOLUTION_DEFAULT + 1) * 2;
    expect(header.vertexCount).toBe(expectedVertexCount);
    expect(header.paramBlockWords).toBe(expectedVertexCount * 2);
  });

  it('rejects Type 2 many-cardinality paramArgs', () => {
    const controlInstance = instanceId('shape-handle-type2-many-param-control');
    const controlFieldExprId = 1 as ValueExprId;
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
          instanceRef('shape-domain', 'shape-handle-type2-many-param-control'),
        ),
      },
      {
        kind: 'const',
        value: floatConst(16),
        type: canonicalMany(
          FLOAT,
          unitNone(),
          instanceRef('shape-domain', 'shape-handle-type2-many-param-control'),
        ),
      },
      {
        kind: 'const',
        value: floatConst(0.04),
        type: canonicalType(FLOAT),
      },
    ];
    const program = {
      ...mockProgram(new Map([[controlFieldExprId, 23]])),
      valueExprs: { nodes: valueExprs },
      schedule: {
        instances: new Map([
          [
            controlInstance,
            {
              id: controlInstance,
              domainType: domainTypeId('shape-domain'),
              count: PARAMETRIC_CUBIC_CONTROL_POINT_COUNT,
              maxCount: PARAMETRIC_CUBIC_CONTROL_POINT_COUNT,
              lifecycle: 'static',
              identityMode: 'none',
            },
          ],
        ]),
      },
    } as unknown as CompiledProgramIR;
    const state = createState(8);
    expect(() =>
      materializeValueExpr(
        0 as ValueExprId,
        { nodes: valueExprs },
        instanceId('shape-instance'),
        1,
        state,
        program,
      ),
    ).toThrow(/must be scalar\/const cardinality/);
  });

  it('resolves Type 2 defaults by param name when topology param order differs', () => {
    const controlInstance = instanceId('shape-handle-type2-reordered-default-control');
    const controlFieldExprId = 1 as ValueExprId;
    const valueExprs: ValueExpr[] = [
      {
        kind: 'shapeRef',
        type: canonicalType(HANDLE),
        topologyId: TYPE2_CUBIC_REORDERED_PARAMS_TOPOLOGY_ID,
        paramArgs: [],
        controlPointField: controlFieldExprId,
      },
      {
        kind: 'const',
        value: vec2Const(0, 0),
        type: canonicalMany(
          VEC2,
          unitNone(),
          instanceRef('shape-domain', 'shape-handle-type2-reordered-default-control'),
        ),
      },
    ];
    const program = {
      ...mockProgram(new Map([[controlFieldExprId, 29]])),
      valueExprs: { nodes: valueExprs },
      schedule: {
        instances: new Map([
          [
            controlInstance,
            {
              id: controlInstance,
              domainType: domainTypeId('shape-domain'),
              count: PARAMETRIC_CUBIC_CONTROL_POINT_COUNT,
              maxCount: PARAMETRIC_CUBIC_CONTROL_POINT_COUNT,
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
    const expectedVertexCount = (PARAMETRIC_RESOLUTION_DEFAULT + 1) * 2;
    expect(header.vertexCount).toBe(expectedVertexCount);
    expect(header.paramBlockWords).toBe(expectedVertexCount * 2);
  });

  it('resolves Type 2 explicit params by param name when topology param order differs', () => {
    const controlInstance = instanceId('shape-handle-type2-reordered-explicit-control');
    const controlFieldExprId = 1 as ValueExprId;
    const valueExprs: ValueExpr[] = [
      {
        kind: 'shapeRef',
        type: canonicalType(HANDLE),
        topologyId: TYPE2_CUBIC_REORDERED_PARAMS_TOPOLOGY_ID,
        // Topology order is [thickness, resolution].
        paramArgs: [2 as ValueExprId, 3 as ValueExprId],
        controlPointField: controlFieldExprId,
      },
      {
        kind: 'const',
        value: vec2Const(0, 0),
        type: canonicalMany(
          VEC2,
          unitNone(),
          instanceRef('shape-domain', 'shape-handle-type2-reordered-explicit-control'),
        ),
      },
      {
        kind: 'const',
        value: floatConst(0.04),
        type: canonicalType(FLOAT),
      },
      {
        kind: 'const',
        value: floatConst(12),
        type: canonicalType(FLOAT),
      },
    ];
    const program = {
      ...mockProgram(new Map([[controlFieldExprId, 31]])),
      valueExprs: { nodes: valueExprs },
      schedule: {
        instances: new Map([
          [
            controlInstance,
            {
              id: controlInstance,
              domainType: domainTypeId('shape-domain'),
              count: PARAMETRIC_CUBIC_CONTROL_POINT_COUNT,
              maxCount: PARAMETRIC_CUBIC_CONTROL_POINT_COUNT,
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
    expect(header.vertexCount).toBe(26);
    expect(header.paramBlockWords).toBe(52);
  });

  it('fails fast when Type 2 topology omits required thickness param', () => {
    const controlInstance = instanceId('shape-handle-type2-missing-thickness-control');
    const controlFieldExprId = 1 as ValueExprId;
    const valueExprs: ValueExpr[] = [
      {
        kind: 'shapeRef',
        type: canonicalType(HANDLE),
        topologyId: TYPE2_CUBIC_MISSING_THICKNESS_TOPOLOGY_ID,
        paramArgs: [],
        controlPointField: controlFieldExprId,
      },
      {
        kind: 'const',
        value: vec2Const(0, 0),
        type: canonicalMany(
          VEC2,
          unitNone(),
          instanceRef('shape-domain', 'shape-handle-type2-missing-thickness-control'),
        ),
      },
    ];
    const program = {
      ...mockProgram(new Map([[controlFieldExprId, 37]])),
      valueExprs: { nodes: valueExprs },
      schedule: {
        instances: new Map([
          [
            controlInstance,
            {
              id: controlInstance,
              domainType: domainTypeId('shape-domain'),
              count: PARAMETRIC_CUBIC_CONTROL_POINT_COUNT,
              maxCount: PARAMETRIC_CUBIC_CONTROL_POINT_COUNT,
              lifecycle: 'static',
              identityMode: 'none',
            },
          ],
        ]),
      },
    } as unknown as CompiledProgramIR;
    const state = createState(8);
    expect(() =>
      materializeValueExpr(
        0 as ValueExprId,
        { nodes: valueExprs },
        instanceId('shape-instance'),
        1,
        state,
        program,
      ),
    ).toThrow(/missing required param 'thickness'/);
  });

  it('keeps cubic-4 path without Type 2 params on rigid path materialization path', () => {
    const controlInstance = instanceId('shape-handle-cubic-four-point-non-type2-control');
    const controlFieldExprId = 1 as ValueExprId;
    const valueExprs: ValueExpr[] = [
      {
        kind: 'shapeRef',
        type: canonicalType(HANDLE),
        topologyId: CUBIC_FOUR_POINT_NON_TYPE2_TOPOLOGY_ID,
        paramArgs: [],
        controlPointField: controlFieldExprId,
      },
      {
        kind: 'const',
        value: vec2Const(0, 0),
        type: canonicalMany(
          VEC2,
          unitNone(),
          instanceRef('shape-domain', 'shape-handle-cubic-four-point-non-type2-control'),
        ),
      },
    ];
    const program = {
      ...mockProgram(new Map([[controlFieldExprId, 41]])),
      valueExprs: { nodes: valueExprs },
      schedule: {
        instances: new Map([
          [
            controlInstance,
            {
              id: controlInstance,
              domainType: domainTypeId('shape-domain'),
              count: PARAMETRIC_CUBIC_CONTROL_POINT_COUNT,
              maxCount: PARAMETRIC_CUBIC_CONTROL_POINT_COUNT,
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
    expect(header.kind).toBe(1);
    expect(header.vertexCount).toBe(4);
    expect(header.paramBlockWords).toBe(8);
  });
});
