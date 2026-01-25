/**
 * ExternalChannel System Tests
 *
 * Tests the generic external channel infrastructure (Sprint 1):
 * - ExternalWriteBus (write-side API)
 * - ExternalChannelSnapshot (read-side API)
 * - ExternalChannelSystem (commit lifecycle)
 *
 * Spec Reference: design-docs/external-input/02-External-Input-Spec.md Section 10
 */

import { describe, it, expect } from 'vitest';
import { ExternalWriteBus, ExternalChannelSnapshot, ExternalChannelSystem } from '../ExternalChannel';

describe('ExternalWriteBus', () => {
  it('should queue set operations', () => {
    const bus = new ExternalWriteBus();
    bus.set('mouse.x', 0.5);
    bus.set('mouse.y', 0.7);

    const records = bus.drain();
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({ op: 'set', name: 'mouse.x', v: 0.5 });
    expect(records[1]).toEqual({ op: 'set', name: 'mouse.y', v: 0.7 });
  });

  it('should queue pulse operations', () => {
    const bus = new ExternalWriteBus();
    bus.pulse('key.space.down');
    bus.pulse('key.enter.down');

    const records = bus.drain();
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({ op: 'pulse', name: 'key.space.down' });
    expect(records[1]).toEqual({ op: 'pulse', name: 'key.enter.down' });
  });

  it('should queue add operations', () => {
    const bus = new ExternalWriteBus();
    bus.add('mouse.wheel.dy', 1.5);
    bus.add('mouse.wheel.dy', -0.5);

    const records = bus.drain();
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({ op: 'add', name: 'mouse.wheel.dy', dv: 1.5 });
    expect(records[1]).toEqual({ op: 'add', name: 'mouse.wheel.dy', dv: -0.5 });
  });

  it('should clear queue after drain', () => {
    const bus = new ExternalWriteBus();
    bus.set('test.channel', 42);

    const first = bus.drain();
    expect(first).toHaveLength(1);

    const second = bus.drain();
    expect(second).toHaveLength(0);
  });

  it('should handle multiple drains returning empty', () => {
    const bus = new ExternalWriteBus();

    expect(bus.drain()).toHaveLength(0);
    expect(bus.drain()).toHaveLength(0);
    expect(bus.drain()).toHaveLength(0);
  });
});

describe('ExternalChannelSnapshot', () => {
  it('should return 0 for unknown channels', () => {
    const snapshot = new ExternalChannelSnapshot(new Map());

    expect(snapshot.getFloat('unknown.channel')).toBe(0);
    expect(snapshot.getFloat('midi.nonexistent')).toBe(0);
  });

  it('should return stored values for known channels', () => {
    const values = new Map([
      ['mouse.x', 0.3],
      ['mouse.y', 0.8],
      ['key.space.down', 1],
    ]);
    const snapshot = new ExternalChannelSnapshot(values);

    expect(snapshot.getFloat('mouse.x')).toBe(0.3);
    expect(snapshot.getFloat('mouse.y')).toBe(0.8);
    expect(snapshot.getFloat('key.space.down')).toBe(1);
  });

  it('should return {0,0} for unknown vec2 channels', () => {
    const snapshot = new ExternalChannelSnapshot(new Map());

    const result = snapshot.getVec2('unknown.pos');
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it('should return vec2 from .x and .y channels', () => {
    const values = new Map([
      ['mouse.x', 0.25],
      ['mouse.y', 0.75],
    ]);
    const snapshot = new ExternalChannelSnapshot(values);

    const result = snapshot.getVec2('mouse');
    expect(result).toEqual({ x: 0.25, y: 0.75 });
  });

  it('should be immutable (frozen)', () => {
    const snapshot = new ExternalChannelSnapshot(new Map());

    expect(Object.isFrozen(snapshot)).toBe(true);
  });
});

describe('ExternalChannelSystem', () => {
  describe('commit lifecycle', () => {
    it('should commit set operations (value channels persist)', () => {
      // Spec Section 10, Test 1: Value persists
      const system = new ExternalChannelSystem();

      system.writeBus.set('mouse.x', 0.2);
      system.commit();

      expect(system.snapshot.getFloat('mouse.x')).toBe(0.2);

      // Next frame with no writes - value should persist
      system.commit();
      expect(system.snapshot.getFloat('mouse.x')).toBe(0.2);
    });

    it('should commit pulse operations (reads 1 for one frame)', () => {
      // Spec Section 10, Test 2: Pulse is one frame
      const system = new ExternalChannelSystem();

      system.writeBus.pulse('key.space.down');
      system.commit();

      expect(system.snapshot.getFloat('key.space.down')).toBe(1);

      // Next frame with no pulse - should read 0
      system.commit();
      expect(system.snapshot.getFloat('key.space.down')).toBe(0);
    });

    it('should commit add operations (accum clears each frame)', () => {
      // Spec Section 10, Test 3: Accum clears
      const system = new ExternalChannelSystem();

      system.writeBus.add('mouse.wheel.dy', 1);
      system.writeBus.add('mouse.wheel.dy', 1);
      system.commit();

      expect(system.snapshot.getFloat('mouse.wheel.dy')).toBe(2);

      // Next frame with no adds - should read 0
      system.commit();
      expect(system.snapshot.getFloat('mouse.wheel.dy')).toBe(0);
    });

    it('should handle unknown channels gracefully', () => {
      // Spec Section 10, Test 4: Unknown returns 0
      const system = new ExternalChannelSystem();

      expect(system.snapshot.getFloat('midi.nonexistent')).toBe(0);
    });
  });

  describe('channel kind detection (naming convention)', () => {
    it('should detect pulse channels by .down suffix', () => {
      const system = new ExternalChannelSystem();

      system.writeBus.pulse('key.a.down');
      system.commit();
      expect(system.snapshot.getFloat('key.a.down')).toBe(1);

      system.commit(); // Pulse should clear
      expect(system.snapshot.getFloat('key.a.down')).toBe(0);
    });

    it('should detect pulse channels by .up suffix', () => {
      const system = new ExternalChannelSystem();

      system.writeBus.pulse('key.a.up');
      system.commit();
      expect(system.snapshot.getFloat('key.a.up')).toBe(1);

      system.commit(); // Pulse should clear
      expect(system.snapshot.getFloat('key.a.up')).toBe(0);
    });

    it('should detect accum channels by .wheel suffix', () => {
      const system = new ExternalChannelSystem();

      system.writeBus.add('mouse.wheel.dy', 5);
      system.commit();
      expect(system.snapshot.getFloat('mouse.wheel.dy')).toBe(5);

      system.commit(); // Accum should clear
      expect(system.snapshot.getFloat('mouse.wheel.dy')).toBe(0);
    });

    it('should detect accum channels by .delta suffix', () => {
      const system = new ExternalChannelSystem();

      system.writeBus.add('audio.pitch.delta', 2.5);
      system.commit();
      expect(system.snapshot.getFloat('audio.pitch.delta')).toBe(2.5);

      system.commit(); // Accum should clear
      expect(system.snapshot.getFloat('audio.pitch.delta')).toBe(0);
    });

    it('should treat unknown patterns as value channels', () => {
      const system = new ExternalChannelSystem();

      system.writeBus.set('custom.channel', 42);
      system.commit();
      expect(system.snapshot.getFloat('custom.channel')).toBe(42);

      system.commit(); // Value should persist
      expect(system.snapshot.getFloat('custom.channel')).toBe(42);
    });
  });

  describe('multiple operations per frame', () => {
    it('should apply last write for value channels', () => {
      const system = new ExternalChannelSystem();

      system.writeBus.set('mouse.x', 0.1);
      system.writeBus.set('mouse.x', 0.2);
      system.writeBus.set('mouse.x', 0.3);
      system.commit();

      expect(system.snapshot.getFloat('mouse.x')).toBe(0.3);
    });

    it('should set pulse to 1 if any pulse occurs', () => {
      const system = new ExternalChannelSystem();

      system.writeBus.pulse('key.space.down');
      system.writeBus.pulse('key.space.down');
      system.commit();

      expect(system.snapshot.getFloat('key.space.down')).toBe(1);
    });

    it('should sum all add operations', () => {
      const system = new ExternalChannelSystem();

      system.writeBus.add('mouse.wheel.dy', 1);
      system.writeBus.add('mouse.wheel.dy', 2);
      system.writeBus.add('mouse.wheel.dy', 3);
      system.commit();

      expect(system.snapshot.getFloat('mouse.wheel.dy')).toBe(6);
    });
  });

  describe('mixed operations', () => {
    it('should handle set + pulse + add in same frame', () => {
      const system = new ExternalChannelSystem();

      system.writeBus.set('mouse.x', 0.5);
      system.writeBus.pulse('key.space.down');
      system.writeBus.add('mouse.wheel.dy', 2);
      system.commit();

      expect(system.snapshot.getFloat('mouse.x')).toBe(0.5);
      expect(system.snapshot.getFloat('key.space.down')).toBe(1);
      expect(system.snapshot.getFloat('mouse.wheel.dy')).toBe(2);

      // Next frame - value persists, pulse and accum clear
      system.commit();
      expect(system.snapshot.getFloat('mouse.x')).toBe(0.5);
      expect(system.snapshot.getFloat('key.space.down')).toBe(0);
      expect(system.snapshot.getFloat('mouse.wheel.dy')).toBe(0);
    });
  });

  describe('snapshot immutability', () => {
    it('should not change snapshot until next commit', () => {
      const system = new ExternalChannelSystem();

      system.writeBus.set('test', 1);
      system.commit();

      const firstSnapshot = system.snapshot;
      expect(firstSnapshot.getFloat('test')).toBe(1);

      // Write more values but don't commit
      system.writeBus.set('test', 2);

      // First snapshot should still read old value
      expect(firstSnapshot.getFloat('test')).toBe(1);
      expect(system.snapshot.getFloat('test')).toBe(1);

      // Commit should create new snapshot
      system.commit();
      expect(system.snapshot.getFloat('test')).toBe(2);

      // First snapshot should still be unchanged (true immutability)
      expect(firstSnapshot.getFloat('test')).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle empty commits', () => {
      const system = new ExternalChannelSystem();

      system.commit();
      system.commit();
      system.commit();

      expect(system.snapshot.getFloat('anything')).toBe(0);
    });

    it('should handle negative values', () => {
      const system = new ExternalChannelSystem();

      system.writeBus.set('test.value', -5.5);
      system.writeBus.add('test.accum', -2);
      system.commit();

      expect(system.snapshot.getFloat('test.value')).toBe(-5.5);
      expect(system.snapshot.getFloat('test.accum')).toBe(-2);
    });

    it('should handle zero values', () => {
      const system = new ExternalChannelSystem();

      system.writeBus.set('test', 0);
      system.commit();

      expect(system.snapshot.getFloat('test')).toBe(0);
    });

    it('should handle very large values', () => {
      const system = new ExternalChannelSystem();

      system.writeBus.set('test', Number.MAX_SAFE_INTEGER);
      system.commit();

      expect(system.snapshot.getFloat('test')).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle special float values', () => {
      const system = new ExternalChannelSystem();

      system.writeBus.set('test.inf', Infinity);
      system.writeBus.set('test.ninf', -Infinity);
      system.writeBus.set('test.nan', NaN);
      system.commit();

      expect(system.snapshot.getFloat('test.inf')).toBe(Infinity);
      expect(system.snapshot.getFloat('test.ninf')).toBe(-Infinity);
      expect(Number.isNaN(system.snapshot.getFloat('test.nan'))).toBe(true);
    });
  });
});
