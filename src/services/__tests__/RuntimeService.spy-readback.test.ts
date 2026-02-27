import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RuntimeService } from '../RuntimeService';
import { debugService } from '../DebugService';
import type { EdgeMetadata } from '../mapDebugEdges';
import { FLOAT, canonicalScalar } from '../../core/canonical-types';
import { valueSlot } from '../../types';

function edgeMeta(slot: number): EdgeMetadata {
  return {
    slotId: valueSlot(slot),
    type: canonicalScalar(FLOAT),
  };
}

describe('RuntimeService spy readback packet selection', () => {
  beforeEach(() => {
    debugService.clear();
  });

  afterEach(() => {
    debugService.clear();
  });

  it('builds packets from tracked scalar slots only (no fallback derivation)', () => {
    const runtime = new RuntimeService({} as any);
    const trackedSlot = valueSlot(3);

    debugService.setEdgeToSlotMap(new Map([
      ['edge-tracked', edgeMeta(3)],
    ]));
    debugService.setPortToSlotMap(new Map());
    debugService.trackHistoryKey({ kind: 'edge', edgeId: 'edge-tracked' });

    (runtime as any).compileState.currentProgram = {
      runtimeAddressTable: {
        slotLookup: new Map([
          [valueSlot(3), {
            storage: 'f32',
            offset: 3,
            stride: 1,
            slot: valueSlot(3),
            type: canonicalScalar(FLOAT),
            arena: { offset: 3, stride: 1, laneCount: 1, length: 1 },
          }],
          [valueSlot(4), {
            storage: 'f32',
            offset: 4,
            stride: 1,
            slot: valueSlot(4),
            type: canonicalScalar(FLOAT),
            arena: { offset: 4, stride: 1, laneCount: 1, length: 1 },
          }],
        ]),
      },
    };
    (runtime as any).compileState.currentState = {
      arena: new Float32Array([0, 0, 0, 31, 77]),
      cache: { frameId: 22 },
    };

    const packet = (runtime as any).buildSpyReadbackPacket(500);
    expect(packet).toBeTruthy();
    if (!packet) {
      throw new Error('Expected spy readback packet');
    }
    expect(packet.frameId).toBe(22);
    expect(packet.entries).toEqual([
      { slotId: trackedSlot, value: 31 },
    ]);
  });

  it('returns null when there are no tracked debug slots', () => {
    const runtime = new RuntimeService({} as any);

    (runtime as any).compileState.currentProgram = {
      runtimeAddressTable: {
        slotLookup: new Map([
          [valueSlot(1), {
            storage: 'f32',
            offset: 1,
            stride: 1,
            slot: valueSlot(1),
            type: canonicalScalar(FLOAT),
            arena: { offset: 1, stride: 1, laneCount: 1, length: 1 },
          }],
        ]),
      },
    };
    (runtime as any).compileState.currentState = {
      arena: new Float32Array([0, 99]),
      cache: { frameId: 3 },
    };

    const packet = (runtime as any).buildSpyReadbackPacket(100);
    expect(packet).toBeNull();
  });
});
