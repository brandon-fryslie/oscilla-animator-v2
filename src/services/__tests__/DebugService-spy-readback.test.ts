import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { debugService } from '../DebugService';
import type { EdgeMetadata } from '../mapDebugEdges';
import { FLOAT, VEC2, canonicalManyDef, canonicalScalar } from '../../core/canonical-types';
import { valueSlot } from '../../types';

function edgeMeta(slot: number, type: ReturnType<typeof canonicalScalar>): EdgeMetadata {
  return {
    slotId: valueSlot(slot),
    type,
  };
}

describe('DebugService spy readback integration', () => {
  beforeEach(() => {
    debugService.clear();
  });

  afterEach(() => {
    debugService.clear();
  });

  it('tracks scalar slots from tracked history keys with ref-count semantics', () => {
    const key = { kind: 'edge' as const, edgeId: 'edge-1' };
    const map = new Map<string, EdgeMetadata>([
      ['edge-1', edgeMeta(5, canonicalScalar(FLOAT))],
    ]);

    debugService.setEdgeToSlotMap(map);
    debugService.setPortToSlotMap(new Map());

    expect(debugService.getTrackedSpyScalarSlots()).toEqual([]);

    debugService.trackHistoryKey(key);
    expect(debugService.getTrackedSpyScalarSlots()).toEqual([valueSlot(5)]);

    debugService.trackHistoryKey(key);
    expect(debugService.getTrackedSpyScalarSlots()).toEqual([valueSlot(5)]);

    debugService.untrackHistoryKey(key);
    expect(debugService.getTrackedSpyScalarSlots()).toEqual([valueSlot(5)]);

    debugService.untrackHistoryKey(key);
    expect(debugService.getTrackedSpyScalarSlots()).toEqual([]);
  });

  it('rejects non-scalar (stride>1) payloads from spy-slot tracking', () => {
    const key = { kind: 'edge' as const, edgeId: 'edge-vec2' };
    const map = new Map<string, EdgeMetadata>([
      ['edge-vec2', edgeMeta(11, canonicalScalar(VEC2))],
    ]);

    debugService.setEdgeToSlotMap(map);
    debugService.setPortToSlotMap(new Map());

    debugService.trackHistoryKey(key);
    expect(debugService.getTrackedSpyScalarSlots()).toEqual([]);
  });

  it('applies async spy readback value + metadata and avoids duplicate history writes on query', () => {
    const key = { kind: 'edge' as const, edgeId: 'edge-readback' };
    const slot = valueSlot(17);
    const map = new Map<string, EdgeMetadata>([
      ['edge-readback', edgeMeta(17, canonicalScalar(FLOAT))],
    ]);

    debugService.setEdgeToSlotMap(map);
    debugService.setPortToSlotMap(new Map());
    debugService.setArenaRef(
      new Float32Array([42]),
      new Map([[slot, { offset: 0, stride: 1, laneCount: 1, length: 1 }]]),
    );
    debugService.trackHistoryKey(key);

    debugService.applySpyReadback(slot, 42, 1200, 9);

    const value = debugService.tryGetEdgeValue('edge-readback');
    expect(value).toMatchObject({ kind: 'scalar', value: 42, slotId: slot });

    const meta = debugService.getSlotSpyReadbackMeta(slot);
    expect(meta).toEqual({ capturedAtMs: 1200, frameId: 9 });

    const history = debugService.historyService.getHistory(key);
    expect(history).toBeTruthy();
    expect(history!.writeIndex).toBe(1);
    expect(history!.buffer[0]).toBe(42);
  });

  it('derives lane-window subscriptions for tracked field slots from the canonical arena map', () => {
    const slot = valueSlot(21);
    debugService.setEdgeToSlotMap(new Map([
      ['edge-field', edgeMeta(21, canonicalManyDef(VEC2))],
    ]));
    debugService.setPortToSlotMap(new Map());
    debugService.setArenaRef(
      new Float32Array([0, 1, 2, 3]),
      new Map([[slot, { offset: 0, stride: 2, laneCount: 2, length: 4 }]]),
    );

    debugService.trackField(slot, canonicalManyDef(VEC2));

    expect(debugService.getTrackedDebugProbeSubscriptions()).toEqual([
      {
        targetId: slot as number,
        slotId: slot,
        sampleKind: 'lane_window',
        componentMask: 0b0011,
        priority: 0,
        laneWindow: { start: 0, count: 2 },
      },
    ]);
  });

  it('reports uncapped tracked debug-probe subscription counts to subscribers', () => {
    const entries: Array<[string, EdgeMetadata]> = [];
    for (let i = 0; i < 20; i += 1) {
      entries.push([`edge-${i}`, edgeMeta(i + 1, canonicalScalar(FLOAT))]);
    }
    debugService.setEdgeToSlotMap(new Map(entries));
    debugService.setPortToSlotMap(new Map());

    const counts: number[] = [];
    const unsub = debugService.onTrackedDebugProbeSubscriptionsChange((count) => {
      counts.push(count);
    });
    try {
      for (let i = 0; i < 20; i += 1) {
        debugService.trackHistoryKey({ kind: 'edge', edgeId: `edge-${i}` });
      }
      expect(debugService.getTrackedDebugProbeSubscriptions().length).toBe(16);
      expect(debugService.getTrackedDebugProbeSubscriptionCount()).toBe(20);
      expect(counts.at(-1)).toBe(20);
    } finally {
      unsub();
    }
  });
});
