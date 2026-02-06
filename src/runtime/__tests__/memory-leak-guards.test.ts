/**
 * Memory Leak Guard Tests
 *
 * Verifies that maps and caches are properly bounded/pruned to prevent
 * unbounded memory growth over long-running sessions.
 */

import { describe, it, expect } from 'vitest';
import {
  createContinuityState,
  pruneStaleContinuity,
} from '../ContinuityState';
import type { DomainInstance } from '../../compiler/ir/types';

// =============================================================================
// pruneStaleContinuity
// =============================================================================

describe('pruneStaleContinuity', () => {
  function makeDomain(count: number): DomainInstance {
    return {
      count,
      elementId: new Uint32Array(count),
      identityMode: 'stable',
    };
  }

  it('removes prevDomains entries for inactive instances', () => {
    const cs = createContinuityState();
    cs.prevDomains.set('instance-a', makeDomain(10));
    cs.prevDomains.set('instance-b', makeDomain(20));
    cs.prevDomains.set('instance-c', makeDomain(5));

    // Only instance-a is still active
    pruneStaleContinuity(cs, new Set(['instance-a']));

    expect(cs.prevDomains.size).toBe(1);
    expect(cs.prevDomains.has('instance-a')).toBe(true);
    expect(cs.prevDomains.has('instance-b')).toBe(false);
    expect(cs.prevDomains.has('instance-c')).toBe(false);
  });

  it('removes mappings entries for inactive instances', () => {
    const cs = createContinuityState();
    cs.mappings.set('instance-a', { newToOld: new Int32Array([0, 1, 2]) });
    cs.mappings.set('instance-b', { newToOld: new Int32Array([0, 1]) });

    pruneStaleContinuity(cs, new Set(['instance-b']));

    expect(cs.mappings.size).toBe(1);
    expect(cs.mappings.has('instance-b')).toBe(true);
  });

  it('removes placementBasis entries for inactive instances', () => {
    const cs = createContinuityState();
    cs.placementBasis.set('instance-a', { x: new Float32Array(10), y: new Float32Array(10) } as any);
    cs.placementBasis.set('instance-b', { x: new Float32Array(5), y: new Float32Array(5) } as any);

    pruneStaleContinuity(cs, new Set(['instance-a']));

    expect(cs.placementBasis.size).toBe(1);
    expect(cs.placementBasis.has('instance-a')).toBe(true);
  });

  it('preserves all entries when all instances are active', () => {
    const cs = createContinuityState();
    cs.prevDomains.set('a', makeDomain(1));
    cs.prevDomains.set('b', makeDomain(2));
    cs.mappings.set('a', { newToOld: new Int32Array([0]) });
    cs.mappings.set('b', { newToOld: new Int32Array([0, 1]) });

    pruneStaleContinuity(cs, new Set(['a', 'b']));

    expect(cs.prevDomains.size).toBe(2);
    expect(cs.mappings.size).toBe(2);
  });

  it('handles empty active set by clearing all', () => {
    const cs = createContinuityState();
    cs.prevDomains.set('a', makeDomain(1));
    cs.prevDomains.set('b', makeDomain(2));

    pruneStaleContinuity(cs, new Set());

    expect(cs.prevDomains.size).toBe(0);
  });

  it('simulates repeated hot-swaps with shrinking instances', () => {
    const cs = createContinuityState();

    // Simulate 5 hot-swaps where instances are added and removed
    const allInstances = ['s1', 's2', 's3', 's4', 's5'];

    // Hot-swap 1: all 5 active
    for (const id of allInstances) {
      cs.prevDomains.set(id, makeDomain(10));
    }
    pruneStaleContinuity(cs, new Set(allInstances));
    expect(cs.prevDomains.size).toBe(5);

    // Hot-swap 2: remove s3, s5
    pruneStaleContinuity(cs, new Set(['s1', 's2', 's4']));
    expect(cs.prevDomains.size).toBe(3);
    expect(cs.prevDomains.has('s3')).toBe(false);
    expect(cs.prevDomains.has('s5')).toBe(false);

    // Hot-swap 3: add s6, remove s1
    cs.prevDomains.set('s6', makeDomain(5));
    pruneStaleContinuity(cs, new Set(['s2', 's4', 's6']));
    expect(cs.prevDomains.size).toBe(3);
    expect(cs.prevDomains.has('s1')).toBe(false);

    // After all swaps, size equals active count
    expect(cs.prevDomains.size).toBe(3);
  });
});

// =============================================================================
// DomainChangeDetector throttle cleanup
// =============================================================================

describe('DomainChangeDetector throttle cleanup', () => {
  // We test indirectly: detectAndLogDomainChanges should clean up
  // domainChangeLogThrottle entries for removed instances.
  // Since the throttle map is module-level, we test the function behavior.

  it('prevInstanceCounts map does not accumulate removed instances', async () => {
    const { detectAndLogDomainChanges, getPrevInstanceCounts } = await import(
      '../../services/DomainChangeDetector'
    );

    // Mock store with minimal interface
    const store = {
      continuity: {
        recordDomainChange: () => {},
      },
    } as any;

    const makeProgram = (instances: Record<string, number>) => ({
      schedule: {
        instances: new Map(Object.entries(instances).map(([k, v]) => [k, { count: v }])),
      },
    });

    // Simulate adding instances
    const prog1 = makeProgram({ a: 10, b: 20, c: 5 });
    detectAndLogDomainChanges(store, makeProgram({}), prog1);

    const counts = getPrevInstanceCounts();
    expect(counts.size).toBe(3);

    // Simulate removing instance 'c'
    const prog2 = makeProgram({ a: 10, b: 20 });
    detectAndLogDomainChanges(store, prog1, prog2);

    expect(counts.size).toBe(2);
    expect(counts.has('c')).toBe(false);
  });
});
