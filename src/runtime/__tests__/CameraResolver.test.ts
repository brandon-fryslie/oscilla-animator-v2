import { describe, it, expect } from 'vitest';
import type { CompiledProgramIR, CameraDeclIR } from '../../compiler/ir/program';
import { EMPTY_PROGRAM_TOPOLOGY_TABLE } from '../../compiler/ir/program-topology';
import type { ValueSlot } from '../../compiler/ir/Indices';
import { valueSlot } from '../../compiler/ir/Indices';
import { resolveCameraDecl, resolveCameraFromGlobals, DEFAULT_CAMERA } from '../CameraResolver';
import type { RuntimeState } from '../RuntimeState';
import type { ArenaSlotDescriptor } from '../ArenaValueStore';

function mockProgram(
  slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>,
  renderGlobals: readonly CameraDeclIR[] = [],
): CompiledProgramIR {
  return {
    irVersion: 1,
    valueExprs: { nodes: [] },
    constants: { json: [] },
    schedule: {
      steps: [],
      timeModel: { periodAMs: 4000, periodBMs: 8000 },
      instances: new Map(),
      stateMappings: [],
      stateSlotCount: 0,
      eventSlotCount: 0,
      eventCount: 0,
    } as any,
    outputs: [],
    slotMeta: [],
    runtimeSlots: [],
    runtimeAddressTable: {
      slotLookup: new Map(),
      fieldExprToSlot: new Map(),
      scalarExprToArenaAddress: new Map(),
      slotToArena,
    },
    debugIndex: {
      stepToBlock: new Map(),
      slotToBlock: new Map(),
      exprToBlock: new Map(),
      ports: [],
      slotToPort: new Map(),
      blockMap: new Map(),
    },
    fieldSlotRegistry: new Map(),
    renderGlobals,
    kernelRegistry: { resolve: () => undefined, entries: () => [] } as any,
    topologyTable: EMPTY_PROGRAM_TOPOLOGY_TABLE,
    arenaLayout: [],
    arenaPayloadFloats: 0,
    arenaTotalFloats: 0,
  };
}

function mockRuntimeState(arena: Float32Array): RuntimeState {
  return { arena } as RuntimeState;
}

function mockCameraDecl(): CameraDeclIR {
  return {
    kind: 'camera',
    projectionSlot: valueSlot(0),
    centerXSlot: valueSlot(1),
    centerYSlot: valueSlot(2),
    distanceSlot: valueSlot(3),
    tiltDegSlot: valueSlot(4),
    yawDegSlot: valueSlot(5),
    fovYDegSlot: valueSlot(6),
    nearSlot: valueSlot(7),
    farSlot: valueSlot(8),
  };
}

describe('CameraResolver', () => {
  it('returns DEFAULT_CAMERA when no camera global is declared', () => {
    const program = mockProgram(new Map(), []);
    const state = mockRuntimeState(new Float32Array(0));
    expect(resolveCameraFromGlobals(program, state)).toEqual(DEFAULT_CAMERA);
  });

  it('throws when a declared camera slot has no arena descriptor', () => {
    const decl = mockCameraDecl();
    const program = mockProgram(new Map(), [decl]);
    const state = mockRuntimeState(new Float32Array(0));
    expect(() => resolveCameraDecl(decl, program, state))
      .toThrow(/missing arena descriptor for camera slot/);
  });

  it('resolves camera values from canonical slotToArena descriptors', () => {
    const decl = mockCameraDecl();
    const slotToArena = new Map<ValueSlot, ArenaSlotDescriptor>([
      [decl.projectionSlot, { offset: 0, stride: 1, laneCount: 1, length: 1 }],
      [decl.centerXSlot, { offset: 1, stride: 1, laneCount: 1, length: 1 }],
      [decl.centerYSlot, { offset: 2, stride: 1, laneCount: 1, length: 1 }],
      [decl.distanceSlot, { offset: 3, stride: 1, laneCount: 1, length: 1 }],
      [decl.tiltDegSlot, { offset: 4, stride: 1, laneCount: 1, length: 1 }],
      [decl.yawDegSlot, { offset: 5, stride: 1, laneCount: 1, length: 1 }],
      [decl.fovYDegSlot, { offset: 6, stride: 1, laneCount: 1, length: 1 }],
      [decl.nearSlot, { offset: 7, stride: 1, laneCount: 1, length: 1 }],
      [decl.farSlot, { offset: 8, stride: 1, laneCount: 1, length: 1 }],
    ]);
    const program = mockProgram(slotToArena, [decl]);
    const state = mockRuntimeState(new Float32Array([
      1,    // projection -> perspective
      0.25, // centerX
      0.75, // centerY
      2.5,  // distance
      10,   // tilt deg
      90,   // yaw deg
      60,   // fovY deg
      0.1,  // near
      100,  // far
    ]));

    const resolved = resolveCameraDecl(decl, program, state);
    expect(resolved.projection).toBe('persp');
    expect(resolved.centerX).toBeCloseTo(0.25);
    expect(resolved.centerY).toBeCloseTo(0.75);
    expect(resolved.distance).toBeCloseTo(2.5);
    expect(resolved.yawRad).toBeCloseTo(Math.PI / 2);
    expect(resolved.near).toBeCloseTo(0.1);
    expect(resolved.far).toBeCloseTo(100);
  });
});
