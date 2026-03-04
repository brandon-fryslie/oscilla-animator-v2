import { describe, expect, it } from 'vitest';
import { canonicalType, FLOAT, HANDLE, floatConst } from '../../core/canonical-types';
import { instanceId } from '../../core/ids';
import type { ValueExprId } from '../../compiler/ir/Indices';
import type { CompiledProgramIR } from '../../compiler/ir/program';
import type { ValueExpr } from '../../compiler/ir/value-expr';
import {
  SHAPE_BANK_NO_CONTROL_POINT_SLOT,
  createRuntimeState,
  readShapeBankHandleMetadata,
} from '../RuntimeState';
import { buildProgramTopologyTableFromIds } from '../../compiler/ir/program-topology';
import { materializeValueExpr } from '../ValueExprMaterializer';
import { registerDynamicTopology } from '../../shapes/registry';
import type { RenderSpace2D } from '../../shapes/types';
import { PathVerb } from '../../shapes/types';

const PATH_TOPOLOGY_ID = registerDynamicTopology(
  {
    params: [{ name: 'radius', type: 'float', default: 1 }],
    render: (_ctx: CanvasRenderingContext2D, _p: Record<string, number>, _space: RenderSpace2D) => {},
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
    render: (_ctx: CanvasRenderingContext2D, _p: Record<string, number>, _space: RenderSpace2D) => {},
  },
  'shape-handle-control-point-slot-non-path',
);

function mockProgram(fieldExprToSlot: ReadonlyMap<number, number> = new Map()): CompiledProgramIR {
  return {
    runtimeAddressTable: {
      fieldExprToSlot,
    },
    topologyTable: buildProgramTopologyTableFromIds([PATH_TOPOLOGY_ID, NON_PATH_TOPOLOGY_ID]),
    kernelRegistry: {},
  } as unknown as CompiledProgramIR;
}

function createState(valueExprCount: number) {
  const state = createRuntimeState(0, 0, valueExprCount, 32);
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
});
