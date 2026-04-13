import { describe, expect, it } from 'vitest';
import { FLOAT, canonicalScalar } from '../../core/canonical-types';
import { valueSlot } from '../../types';
import {
  createDebugProbeRuntimeSnapshot,
  extractDebugProbeSamplesFromRuntimeSnapshot,
} from '../DebugProbeRuntimeSnapshot';
import type { DebugProbeSubscription } from '../DebugProbeProtocol';

function makeProgramAndState() {
  const scalarSlot = valueSlot(3);
  const fieldSlot = valueSlot(5);
  const program = {
    runtimeAddressTable: {
      slotLookup: new Map([
        [scalarSlot, {
          storage: 'f32',
          offset: 3,
          stride: 1,
          slot: scalarSlot,
          type: canonicalScalar(FLOAT),
          arena: { offset: 3, stride: 1, laneCount: 1, length: 1 },
        }],
        [fieldSlot, {
          storage: 'f32',
          offset: 0,
          stride: 2,
          slot: fieldSlot,
          type: canonicalScalar(FLOAT),
          arena: { offset: 0, stride: 2, laneCount: 2, length: 4 },
        }],
      ]),
      fieldExprToSlot: new Map(),
      scalarExprToArenaAddress: new Map(),
      slotToArena: new Map([
        [scalarSlot, { offset: 3, stride: 1, laneCount: 1, length: 1 }],
        [fieldSlot, { offset: 0, stride: 2, laneCount: 2, length: 4 }],
      ]),
    },
  };
  const state = {
    arena: new Float32Array([10, 20, 30, 41]),
    cache: { frameId: 9 },
  };

  return { scalarSlot, fieldSlot, program, state };
}

describe('DebugProbeRuntimeSnapshot', () => {
  it('captures slot-local runtime regions for debug probe extraction', () => {
    const { scalarSlot, fieldSlot, program, state } = makeProgramAndState();
    const subscriptions: DebugProbeSubscription[] = [
      {
        targetId: scalarSlot as number,
        slotId: scalarSlot,
        sampleKind: 'scalar',
        componentMask: 0b0001,
        priority: 0,
      },
      {
        targetId: fieldSlot as number,
        slotId: fieldSlot,
        sampleKind: 'lane_window',
        componentMask: 0b0011,
        priority: 0,
        laneWindow: { start: 0, count: 2 },
      },
    ];

    const snapshot = createDebugProbeRuntimeSnapshot(program as any, state as any, subscriptions);
    expect(snapshot).toBeTruthy();
    if (!snapshot) {
      throw new Error('Expected debug probe runtime snapshot');
    }

    expect(snapshot.runtimeFrameId).toBe(9);
    expect(snapshot.slots).toHaveLength(2);
    expect(snapshot.slots[0]).toMatchObject({
      slotId: scalarSlot,
      descriptor: { offset: 0, stride: 1, laneCount: 1, length: 1 },
    });
    expect(Array.from(snapshot.slots[0]!.values)).toEqual([41]);
    expect(Array.from(snapshot.slots[1]!.values)).toEqual([10, 20, 30, 41]);

  });

  it('extracts scalar and lane-window samples from the shared snapshot contract', () => {
    const { scalarSlot, fieldSlot, program, state } = makeProgramAndState();
    const subscriptions: DebugProbeSubscription[] = [
      {
        targetId: scalarSlot as number,
        slotId: scalarSlot,
        sampleKind: 'scalar',
        componentMask: 0b0001,
        priority: 0,
      },
      {
        targetId: fieldSlot as number,
        slotId: fieldSlot,
        sampleKind: 'lane_window',
        componentMask: 0b0011,
        priority: 0,
        laneWindow: { start: 0, count: 2 },
      },
    ];

    const snapshot = createDebugProbeRuntimeSnapshot(program as any, state as any, subscriptions);
    if (!snapshot) {
      throw new Error('Expected debug probe runtime snapshot');
    }

    expect(extractDebugProbeSamplesFromRuntimeSnapshot(snapshot, subscriptions)).toMatchObject({
      packetFlags: 0,
      samples: [
        {
          slotId: scalarSlot,
          payloadKind: 'scalar',
          values: [41],
        },
        {
          slotId: fieldSlot,
          payloadKind: 'lane_window',
          stride: 2,
          laneCount: 2,
          values: [10, 30, 20, 41],
        },
      ],
    });
  });

  it('applies component masks during lane-window extraction', () => {
    const { fieldSlot, program, state } = makeProgramAndState();
    const subscriptions: DebugProbeSubscription[] = [
      {
        targetId: fieldSlot as number,
        slotId: fieldSlot,
        sampleKind: 'lane_window',
        componentMask: 0b0001,
        priority: 0,
        laneWindow: { start: 0, count: 2 },
      },
    ];

    const snapshot = createDebugProbeRuntimeSnapshot(program as any, state as any, subscriptions);
    if (!snapshot) {
      throw new Error('Expected debug probe runtime snapshot');
    }

    expect(extractDebugProbeSamplesFromRuntimeSnapshot(snapshot, subscriptions)).toMatchObject({
      packetFlags: 0,
      samples: [
        {
          slotId: fieldSlot,
          payloadKind: 'lane_window',
          stride: 1,
          laneCount: 2,
          values: [10, 20],
        },
      ],
    });
  });
});
