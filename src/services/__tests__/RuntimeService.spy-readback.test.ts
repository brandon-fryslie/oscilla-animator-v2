import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('starts and stops the readback timer based on tracked spy slots', () => {
    vi.useFakeTimers();
    const runtime = new RuntimeService({} as any);
    const key = { kind: 'edge' as const, edgeId: 'edge-tracked' };
    debugService.setEdgeToSlotMap(new Map([['edge-tracked', edgeMeta(9)]]));
    debugService.setPortToSlotMap(new Map());

    try {
      (runtime as any).bindSpyReadbackTracking();
      expect((runtime as any).spyReadbackTimer).toBeNull();

      debugService.trackHistoryKey(key);
      expect((runtime as any).spyReadbackTimer).not.toBeNull();

      debugService.untrackHistoryKey(key);
      expect((runtime as any).spyReadbackTimer).toBeNull();
    } finally {
      (runtime as any).stopSpyReadbackLoop();
      (runtime as any).unsubSpyTracking?.();
      (runtime as any).unsubSpyTracking = null;
      vi.useRealTimers();
    }
  });

  it('does not reschedule readback after stop is called during a timer callback', () => {
    vi.useFakeTimers();
    const runtime = new RuntimeService({} as any);
    const key = { kind: 'edge' as const, edgeId: 'edge-timer-stop' };
    debugService.setEdgeToSlotMap(new Map([['edge-timer-stop', edgeMeta(10)]]));
    debugService.setPortToSlotMap(new Map());
    debugService.trackHistoryKey(key);

    const runCycleSpy = vi.spyOn(runtime as any, 'runSpyReadbackCycle').mockImplementation(() => {
      (runtime as any).stopSpyReadbackLoop();
    });

    try {
      (runtime as any).bindSpyReadbackTracking();
      expect((runtime as any).spyReadbackTimer).not.toBeNull();

      vi.runOnlyPendingTimers();
      expect((runtime as any).spyReadbackTimer).toBeNull();
      expect(runCycleSpy).toHaveBeenCalledTimes(1);
    } finally {
      (runtime as any).stopSpyReadbackLoop();
      (runtime as any).unsubSpyTracking?.();
      (runtime as any).unsubSpyTracking = null;
      runCycleSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
