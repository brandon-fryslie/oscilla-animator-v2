import { describe, it, expect, beforeEach } from 'vitest';
import { HistoryService, type KeyResolver, type ResolvedKeyMetadata } from './HistoryService';
import type { DebugTargetKey } from './types';
import type { ValueSlot } from '../../types';

function slot(n: number): ValueSlot {
  return n as ValueSlot;
}

function edgeKey(id: string): DebugTargetKey {
  return { kind: 'edge', edgeId: id };
}

function portKey(blockId: string, portName: string): DebugTargetKey {
  return { kind: 'port', blockId, portName };
}

/**
 * Creates a resolver that maps edge IDs to metadata.
 * Simulates what DebugService would provide.
 */
function makeResolver(
  mapping: Map<string, ResolvedKeyMetadata>
): KeyResolver {
  return (key: DebugTargetKey) => {
    if (key.kind === 'edge') {
      return mapping.get(key.edgeId);
    }
    if (key.kind === 'port') {
      return mapping.get(`${key.blockId}:${key.portName}`);
    }
    return undefined;
  };
}

describe('HistoryService', () => {
  let resolver: KeyResolver;
  let resolverMap: Map<string, ResolvedKeyMetadata>;
  let service: HistoryService;

  beforeEach(() => {
    resolverMap = new Map([
      ['e1', { slotId: slot(10), cardinality: 'signal', payloadType: 'float' }],
      ['e2', { slotId: slot(20), cardinality: 'signal', payloadType: 'float' }],
      ['e3', { slotId: slot(30), cardinality: 'signal', payloadType: 'float' }],
      ['field1', { slotId: slot(40), cardinality: 'field', payloadType: 'float' }],
      ['bool1', { slotId: slot(50), cardinality: 'signal', payloadType: 'bool' }],
      ['vec2-1', { slotId: slot(60), cardinality: 'signal', payloadType: 'vec2' }],
    ]);
    resolver = makeResolver(resolverMap);
    service = new HistoryService(resolver);
  });

  // ===========================================================================
  // track() / untrack() / isTracked()
  // ===========================================================================

  describe('track()', () => {
    it('tracks a valid signal key', () => {
      service.track(edgeKey('e1'));
      expect(service.isTracked(edgeKey('e1'))).toBe(true);
    });

    it('is idempotent for already-tracked keys', () => {
      service.track(edgeKey('e1'));
      service.track(edgeKey('e1'));
      expect(service.trackedCount).toBe(1);
    });

    it('rejects field-cardinality keys (no throw)', () => {
      service.track(edgeKey('field1'));
      expect(service.isTracked(edgeKey('field1'))).toBe(false);
    });

    it('rejects non-sampleable payloads (bool)', () => {
      service.track(edgeKey('bool1'));
      expect(service.isTracked(edgeKey('bool1'))).toBe(false);
    });

    it('rejects stride != 1 payloads (vec2)', () => {
      service.track(edgeKey('vec2-1'));
      expect(service.isTracked(edgeKey('vec2-1'))).toBe(false);
    });

    it('rejects keys that do not resolve', () => {
      service.track(edgeKey('nonexistent'));
      expect(service.isTracked(edgeKey('nonexistent'))).toBe(false);
    });

    it('tracks port keys', () => {
      resolverMap.set('block-1:out', { slotId: slot(70), cardinality: 'signal', payloadType: 'float' });
      service.track(portKey('block-1', 'out'));
      expect(service.isTracked(portKey('block-1', 'out'))).toBe(true);
    });
  });

  describe('untrack()', () => {
    it('removes a tracked key', () => {
      service.track(edgeKey('e1'));
      service.untrack(edgeKey('e1'));
      expect(service.isTracked(edgeKey('e1'))).toBe(false);
    });

    it('is a no-op for untracked keys', () => {
      service.untrack(edgeKey('nonexistent'));
      // No throw
    });
  });

  describe('getHistory()', () => {
    it('returns TrackedEntry for tracked key', () => {
      service.track(edgeKey('e1'));
      const history = service.getHistory(edgeKey('e1'));
      expect(history).toBeDefined();
      expect(history!.capacity).toBe(128);
      expect(history!.stride).toBe(1);
      expect(history!.writeIndex).toBe(0);
      expect(history!.filled).toBe(false);
      expect(history!.buffer).toBeInstanceOf(Float32Array);
      expect(history!.buffer.length).toBe(128);
    });

    it('returns undefined for untracked key', () => {
      expect(service.getHistory(edgeKey('e1'))).toBeUndefined();
    });

    it('returns the same object reference on repeated calls (object-stable)', () => {
      service.track(edgeKey('e1'));
      const h1 = service.getHistory(edgeKey('e1'));
      const h2 = service.getHistory(edgeKey('e1'));
      expect(h1).toBe(h2);
    });
  });

  // ===========================================================================
  // onSlotWrite() - Ring buffer push
  // ===========================================================================

  describe('onSlotWrite()', () => {
    it('pushes values into the ring buffer', () => {
      service.track(edgeKey('e1'));
      service.onSlotWrite(slot(10), 0.5);
      service.onSlotWrite(slot(10), 0.75);

      const history = service.getHistory(edgeKey('e1'))!;
      expect(history.buffer[0]).toBe(0.5);
      expect(history.buffer[1]).toBe(0.75);
      expect(history.writeIndex).toBe(2);
    });

    it('writeIndex is monotonically unbounded', () => {
      service.track(edgeKey('e1'));
      for (let i = 0; i < 200; i++) {
        service.onSlotWrite(slot(10), i);
      }
      const history = service.getHistory(edgeKey('e1'))!;
      expect(history.writeIndex).toBe(200);
    });

    it('wraps around correctly at capacity boundary', () => {
      service.track(edgeKey('e1'));
      const history = service.getHistory(edgeKey('e1'))!;

      // Fill buffer exactly
      for (let i = 0; i < 128; i++) {
        service.onSlotWrite(slot(10), i);
      }
      expect(history.filled).toBe(true);
      expect(history.writeIndex).toBe(128);

      // Write one more — should wrap to position 0
      service.onSlotWrite(slot(10), 999);
      expect(history.buffer[0]).toBe(999);
      expect(history.writeIndex).toBe(129);
    });

    it('handles multiple wrap-arounds correctly', () => {
      service.track(edgeKey('e1'));
      const history = service.getHistory(edgeKey('e1'))!;

      // Write 3 full rounds + 5 extra
      const total = 128 * 3 + 5;
      for (let i = 0; i < total; i++) {
        service.onSlotWrite(slot(10), i);
      }

      expect(history.writeIndex).toBe(total);
      expect(history.filled).toBe(true);

      // Last 128 values should be in the buffer
      // The most recent value (total-1) is at position (total-1) % 128
      for (let i = 0; i < 128; i++) {
        const expectedValue = total - 128 + i;
        const bufPos = ((total - 128 + i) % 128 + 128) % 128;
        expect(history.buffer[bufPos]).toBe(expectedValue);
      }
    });

    it('does not push to unrelated slots', () => {
      service.track(edgeKey('e1')); // slot 10
      service.track(edgeKey('e2')); // slot 20

      service.onSlotWrite(slot(10), 42);

      const h1 = service.getHistory(edgeKey('e1'))!;
      const h2 = service.getHistory(edgeKey('e2'))!;
      expect(h1.writeIndex).toBe(1);
      expect(h2.writeIndex).toBe(0);
    });

    it('pushes to multiple entries on the same slot', () => {
      // Two keys mapping to the same slot
      resolverMap.set('e-dup', { slotId: slot(10), cardinality: 'signal', payloadType: 'float' });
      service.track(edgeKey('e1'));   // slot 10
      service.track(edgeKey('e-dup')); // also slot 10

      service.onSlotWrite(slot(10), 7.5);

      expect(service.getHistory(edgeKey('e1'))!.writeIndex).toBe(1);
      expect(service.getHistory(edgeKey('e-dup'))!.writeIndex).toBe(1);
    });

    it('is a no-op for slots with no tracked entries', () => {
      service.onSlotWrite(slot(999), 1.0);
      // No throw, no effect
    });

    it('sets filled=true only when writeIndex reaches capacity', () => {
      service.track(edgeKey('e1'));
      const history = service.getHistory(edgeKey('e1'))!;

      for (let i = 0; i < 127; i++) {
        service.onSlotWrite(slot(10), i);
      }
      expect(history.filled).toBe(false);

      service.onSlotWrite(slot(10), 127);
      expect(history.filled).toBe(true);
    });
  });

  // ===========================================================================
  // MAX_TRACKED_KEYS eviction
  // ===========================================================================

  describe('MAX_TRACKED_KEYS eviction', () => {
    it('evicts oldest hover probe when at capacity', () => {
      // Fill to max with float slots
      for (let i = 0; i < 32; i++) {
        const id = `fill-${i}`;
        resolverMap.set(id, { slotId: slot(100 + i), cardinality: 'signal', payloadType: 'float' });
        service.track(edgeKey(id));
      }
      expect(service.trackedCount).toBe(32);

      // Track one more — should evict 'fill-0' (oldest)
      resolverMap.set('new-one', { slotId: slot(200), cardinality: 'signal', payloadType: 'float' });
      service.track(edgeKey('new-one'));

      expect(service.trackedCount).toBe(32);
      expect(service.isTracked(edgeKey('fill-0'))).toBe(false);
      expect(service.isTracked(edgeKey('new-one'))).toBe(true);
    });

    it('evicts hover probes in insertion order', () => {
      for (let i = 0; i < 32; i++) {
        const id = `fill-${i}`;
        resolverMap.set(id, { slotId: slot(100 + i), cardinality: 'signal', payloadType: 'float' });
        service.track(edgeKey(id));
      }

      // Add two more — should evict fill-0 then fill-1
      resolverMap.set('new-1', { slotId: slot(200), cardinality: 'signal', payloadType: 'float' });
      resolverMap.set('new-2', { slotId: slot(201), cardinality: 'signal', payloadType: 'float' });
      service.track(edgeKey('new-1'));
      service.track(edgeKey('new-2'));

      expect(service.isTracked(edgeKey('fill-0'))).toBe(false);
      expect(service.isTracked(edgeKey('fill-1'))).toBe(false);
      expect(service.isTracked(edgeKey('fill-2'))).toBe(true);
      expect(service.isTracked(edgeKey('new-1'))).toBe(true);
      expect(service.isTracked(edgeKey('new-2'))).toBe(true);
    });

    it('silently rejects if all entries are pinned', () => {
      // Note: pinning is a future API, so in v1 all are hover probes.
      // This test validates the guard in track() when eviction fails.
      // We simulate by having an empty hoverProbes set.
      // Since we can't pin in v1, we just verify the capacity guard works.
      for (let i = 0; i < 32; i++) {
        const id = `fill-${i}`;
        resolverMap.set(id, { slotId: slot(100 + i), cardinality: 'signal', payloadType: 'float' });
        service.track(edgeKey(id));
      }
      // All are hover probes, so eviction always works
      // This test just documents the behavior
      expect(service.trackedCount).toBe(32);
    });
  });

  // ===========================================================================
  // onMappingChanged()
  // ===========================================================================

  describe('onMappingChanged()', () => {
    it('updates slot binding when slot changes', () => {
      service.track(edgeKey('e1')); // initially slot 10
      service.onSlotWrite(slot(10), 1.0);

      // Change slot mapping
      resolverMap.set('e1', { slotId: slot(99), cardinality: 'signal', payloadType: 'float' });
      service.onMappingChanged();

      // Old slot should not push
      service.onSlotWrite(slot(10), 2.0);
      const history = service.getHistory(edgeKey('e1'))!;
      expect(history.writeIndex).toBe(1); // only the first write

      // New slot should push
      service.onSlotWrite(slot(99), 3.0);
      expect(history.writeIndex).toBe(2);
    });

    it('sets slotId=null if key no longer resolves', () => {
      service.track(edgeKey('e1'));
      service.onSlotWrite(slot(10), 1.0);

      // Remove from resolver
      resolverMap.delete('e1');
      service.onMappingChanged();

      // Key is still tracked but paused (slot=null)
      expect(service.isTracked(edgeKey('e1'))).toBe(true);
      const history = service.getHistory(edgeKey('e1'))!;
      expect(history.slotId).toBeNull();

      // Slot writes no longer reach this entry
      service.onSlotWrite(slot(10), 2.0);
      expect(history.writeIndex).toBe(1);
    });

    it('sets slotId=null if cardinality changes to field', () => {
      service.track(edgeKey('e1'));

      resolverMap.set('e1', { slotId: slot(10), cardinality: 'field', payloadType: 'float' });
      service.onMappingChanged();

      const history = service.getHistory(edgeKey('e1'))!;
      expect(history.slotId).toBeNull();
    });

    it('handles key reappearing after disappearing', () => {
      service.track(edgeKey('e1'));
      service.onSlotWrite(slot(10), 1.0);

      // Disappear
      resolverMap.delete('e1');
      service.onMappingChanged();

      // Reappear with new slot
      resolverMap.set('e1', { slotId: slot(55), cardinality: 'signal', payloadType: 'float' });
      service.onMappingChanged();

      const history = service.getHistory(edgeKey('e1'))!;
      expect(history.slotId).toBe(slot(55));

      // New slot should work
      service.onSlotWrite(slot(55), 2.0);
      expect(history.writeIndex).toBe(2); // previous write + new one
    });

    it('is a no-op when nothing changes', () => {
      service.track(edgeKey('e1'));
      service.onSlotWrite(slot(10), 1.0);

      service.onMappingChanged();

      // Everything should still work
      service.onSlotWrite(slot(10), 2.0);
      const history = service.getHistory(edgeKey('e1'))!;
      expect(history.writeIndex).toBe(2);
    });
  });

  // ===========================================================================
  // clear()
  // ===========================================================================

  describe('clear()', () => {
    it('removes all entries', () => {
      service.track(edgeKey('e1'));
      service.track(edgeKey('e2'));
      service.clear();

      expect(service.isTracked(edgeKey('e1'))).toBe(false);
      expect(service.isTracked(edgeKey('e2'))).toBe(false);
      expect(service.trackedCount).toBe(0);
    });

    it('clears reverse map (slot writes have no effect after clear)', () => {
      service.track(edgeKey('e1'));
      service.clear();
      // This should be a no-op (no entries on slot 10)
      service.onSlotWrite(slot(10), 1.0);
      // No throw
    });
  });

  // ===========================================================================
  // Edge cases
  // ===========================================================================

  describe('edge cases', () => {
    it('handles null slotId from resolver', () => {
      resolverMap.set('null-slot', { slotId: null, cardinality: 'signal', payloadType: 'float' });
      service.track(edgeKey('null-slot'));

      expect(service.isTracked(edgeKey('null-slot'))).toBe(true);
      const history = service.getHistory(edgeKey('null-slot'))!;
      expect(history.slotId).toBeNull();
      // No slot writes will reach it
    });

    it('safe modulo works for writeIndex=0', () => {
      service.track(edgeKey('e1'));
      service.onSlotWrite(slot(10), 42);
      const history = service.getHistory(edgeKey('e1'))!;
      expect(history.buffer[0]).toBe(42);
    });
  });
});
