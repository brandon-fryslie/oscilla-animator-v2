/**
 * Memory Leak Guard Tests
 *
 * Verifies that maps and caches are properly bounded/pruned to prevent
 * unbounded memory growth over long-running sessions.
 */

import { describe, it, expect } from 'vitest';
import {
  CONTINUITY_DORMANT_PRUNE_HOTSWAPS,
  createContinuityState,
  getOrCreateTargetState,
  pruneStaleContinuity,
} from '../ContinuityState';
import type { StableTargetId } from '../ContinuityState';
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

  function pruneUntilHardDelete(cs: ReturnType<typeof createContinuityState>, active: ReadonlySet<string>): void {
    for (let i = 0; i < CONTINUITY_DORMANT_PRUNE_HOTSWAPS; i++) {
      pruneStaleContinuity(cs, active);
    }
  }

  it('moves inactive instances to dormant before hard delete', () => {
    const cs = createContinuityState();
    cs.prevDomains.set('instance-a', makeDomain(10));
    cs.prevDomains.set('instance-b', makeDomain(20));
    cs.prevDomains.set('instance-c', makeDomain(5));

    // First prune pass: mark missing instances dormant.
    pruneStaleContinuity(cs, new Set(['instance-a']));
    expect(cs.prevDomains.size).toBe(3);
    expect(cs.dormantInstanceMisses.get('instance-b')).toBe(1);
    expect(cs.dormantInstanceMisses.get('instance-c')).toBe(1);

    // Second pass: dormant window elapsed, now hard-delete.
    pruneStaleContinuity(cs, new Set(['instance-a']));

    expect(cs.prevDomains.size).toBe(1);
    expect(cs.prevDomains.has('instance-a')).toBe(true);
    expect(cs.prevDomains.has('instance-b')).toBe(false);
    expect(cs.prevDomains.has('instance-c')).toBe(false);
  });

  it('hard-deletes mappings and placementBasis after dormant window', () => {
    const cs = createContinuityState();
    cs.prevDomains.set('instance-a', makeDomain(3));
    cs.prevDomains.set('instance-b', makeDomain(2));
    cs.mappings.set('instance-a', { newToOld: new Int32Array([0, 1, 2]) });
    cs.mappings.set('instance-b', { newToOld: new Int32Array([0, 1]) });
    cs.placementBasis.set('instance-a', { x: new Float32Array(3), y: new Float32Array(3) } as any);
    cs.placementBasis.set('instance-b', { x: new Float32Array(2), y: new Float32Array(2) } as any);

    pruneUntilHardDelete(cs, new Set(['instance-b']));

    expect(cs.mappings.size).toBe(1);
    expect(cs.mappings.has('instance-b')).toBe(true);
    expect(cs.placementBasis.size).toBe(1);
    expect(cs.placementBasis.has('instance-b')).toBe(true);
  });

  it('clears dormant mark when instance becomes active again (undo/redo)', () => {
    const cs = createContinuityState();
    cs.prevDomains.set('undo-target', makeDomain(4));

    pruneStaleContinuity(cs, new Set());
    expect(cs.dormantInstanceMisses.get('undo-target')).toBe(1);
    expect(cs.prevDomains.has('undo-target')).toBe(true);

    // Instance returns before hard prune.
    pruneStaleContinuity(cs, new Set(['undo-target']));
    expect(cs.dormantInstanceMisses.has('undo-target')).toBe(false);
    expect(cs.prevDomains.has('undo-target')).toBe(true);
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

  it('handles empty active set with deterministic dormant->delete lifecycle', () => {
    const cs = createContinuityState();
    cs.prevDomains.set('a', makeDomain(1));
    cs.prevDomains.set('b', makeDomain(2));

    pruneStaleContinuity(cs, new Set());
    expect(cs.prevDomains.size).toBe(2);
    expect(cs.dormantInstanceMisses.size).toBe(2);

    pruneStaleContinuity(cs, new Set());
    expect(cs.prevDomains.size).toBe(0);
    expect(cs.dormantInstanceMisses.size).toBe(0);
  });

  it('tracks target ownership by instance id and prunes colon-bearing ids safely', () => {
    const cs = createContinuityState();
    const targetId = 'position:inst:alpha:render:block:controlPoints' as StableTargetId;
    getOrCreateTargetState(cs, targetId, 4, 'inst:alpha');

    pruneStaleContinuity(cs, new Set());
    expect(cs.targets.has(targetId)).toBe(true);
    pruneStaleContinuity(cs, new Set());
    expect(cs.targets.has(targetId)).toBe(false);
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
    expect(cs.prevDomains.size).toBe(5);
    expect(cs.dormantInstanceMisses.get('s3')).toBe(1);
    expect(cs.dormantInstanceMisses.get('s5')).toBe(1);

    // Hot-swap 3: add s6, remove s1
    cs.prevDomains.set('s6', makeDomain(5));
    pruneStaleContinuity(cs, new Set(['s2', 's4', 's6']));
    expect(cs.prevDomains.size).toBe(4);
    expect(cs.prevDomains.has('s3')).toBe(false);
    expect(cs.prevDomains.has('s5')).toBe(false);
    expect(cs.prevDomains.has('s1')).toBe(true);

    // Hot-swap 4: s1 is still absent, now it hard-prunes.
    pruneStaleContinuity(cs, new Set(['s2', 's4', 's6']));
    expect(cs.prevDomains.has('s1')).toBe(false);

    // After all swaps, size equals active count.
    expect(cs.prevDomains.size).toBe(3);
  });
});

// =============================================================================
// DomainChangeDetector throttle cleanup
// =============================================================================

describe('DomainChangeDetector throttle cleanup', () => {
  it('prevInstanceCounts map does not accumulate removed instances', async () => {
    const { createDomainChangeDetector } = await import(
      '../../services/DomainChangeDetector'
    );
    const detector = createDomainChangeDetector();

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
    }) as any;

    // Simulate adding instances
    const prog1 = makeProgram({ a: 10, b: 20, c: 5 });
    detector.detectAndLogDomainChanges(store, makeProgram({}), prog1);

    const counts = detector.getPrevInstanceCounts();
    expect(counts.size).toBe(3);

    // Simulate removing instance 'c'
    const prog2 = makeProgram({ a: 10, b: 20 });
    detector.detectAndLogDomainChanges(store, prog1, prog2);

    expect(counts.size).toBe(2);
    expect(counts.has('c')).toBe(false);
  });
});
