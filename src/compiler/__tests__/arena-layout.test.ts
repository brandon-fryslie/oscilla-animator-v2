/**
 * Arena Layout Tests
 *
 * Verifies that deriveArenaDescriptor() computes correct arena slot descriptors
 * and that the compiled program's arenaLayout is consistent with slotMeta.
 */

import { describe, it, expect } from 'vitest';
import { deriveArenaDescriptor } from '../ir/storage-class';
import {
  canonicalScalar,
  canonicalMany,
  FLOAT,
  VEC3,
  COLOR,
} from '../../core/canonical-types';
import { instanceRef } from '../../core/canonical-types/instance-ref';
import { instanceId } from '../../core/ids';
import type { InstanceId } from '../../core/ids';
import type { InstanceDecl } from '../ir/types';
import { buildPatch } from '../../graph';
import { compile } from '../compile';
import { createRuntimeState } from '../../runtime';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInstances(
  entries: { id: string; count: number | 'dynamic'; maxCount: number }[],
): ReadonlyMap<InstanceId, InstanceDecl> {
  const map = new Map<InstanceId, InstanceDecl>();
  for (const e of entries) {
    map.set(instanceId(e.id), {
      id: instanceId(e.id),
      domainType: 'test' as any,
      count: e.count,
      maxCount: e.maxCount,
      lifecycle: 'static',
      identityMode: 'none',
    } as InstanceDecl);
  }
  return map;
}

const emptyInstances: ReadonlyMap<InstanceId, InstanceDecl> = new Map();

// ---------------------------------------------------------------------------
// deriveArenaDescriptor — unit tests
// ---------------------------------------------------------------------------

describe('deriveArenaDescriptor', () => {
  it('one (float): stride=1, laneCount=1, length=1', () => {
    const type = canonicalScalar(FLOAT);
    const desc = deriveArenaDescriptor(type, 0, emptyInstances);
    expect(desc).toEqual({ offset: 0, stride: 1, laneCount: 1, length: 1 });
  });

  it('one (vec3): stride=3, laneCount=1, length=3', () => {
    const type = canonicalScalar(VEC3);
    const desc = deriveArenaDescriptor(type, 0, emptyInstances);
    expect(desc).toEqual({ offset: 0, stride: 3, laneCount: 1, length: 3 });
  });

  it('field (many, float, count=10): stride=1, laneCount=10, length=10', () => {
    const ref = instanceRef('grid', 'inst_a');
    const instances = makeInstances([{ id: 'inst_a', count: 10, maxCount: 10 }]);
    const type = canonicalMany(FLOAT, undefined, ref);
    const desc = deriveArenaDescriptor(type, 0, instances);
    expect(desc).toEqual({ offset: 0, stride: 1, laneCount: 10, length: 10 });
  });

  it('field (many, color, count=5): stride=4, laneCount=5, length=20', () => {
    const ref = instanceRef('grid', 'inst_b');
    const instances = makeInstances([{ id: 'inst_b', count: 5, maxCount: 5 }]);
    const type = canonicalMany(COLOR, undefined, ref);
    const desc = deriveArenaDescriptor(type, 0, instances);
    expect(desc).toEqual({ offset: 0, stride: 4, laneCount: 5, length: 20 });
  });

  it('dynamic count uses maxCount', () => {
    const ref = instanceRef('grid', 'inst_dyn');
    const instances = makeInstances([{ id: 'inst_dyn', count: 'dynamic', maxCount: 32 }]);
    const type = canonicalMany(FLOAT, undefined, ref);
    const desc = deriveArenaDescriptor(type, 0, instances);
    expect(desc.laneCount).toBe(32);
    expect(desc.length).toBe(32);
  });

  it('respects arenaOffset for bump allocation', () => {
    const type = canonicalScalar(VEC3);
    const desc = deriveArenaDescriptor(type, 100, emptyInstances);
    expect(desc.offset).toBe(100);
    expect(desc.length).toBe(3);
  });

  it('respects overrideStride', () => {
    const type = canonicalScalar(FLOAT);
    const desc = deriveArenaDescriptor(type, 0, emptyInstances, 4);
    expect(desc.stride).toBe(4);
    expect(desc.length).toBe(4);
  });

  it('two sequential descriptors do not overlap', () => {
    const type1 = canonicalScalar(VEC3);
    const type2 = canonicalScalar(COLOR);

    let offset = 0;
    const desc1 = deriveArenaDescriptor(type1, offset, emptyInstances);
    offset += desc1.length;
    const desc2 = deriveArenaDescriptor(type2, offset, emptyInstances);

    // desc2 starts exactly where desc1 ends
    expect(desc2.offset).toBe(desc1.offset + desc1.length);
    // No overlap: desc1 occupies [0, 3), desc2 occupies [3, 7)
    expect(desc1.offset + desc1.length).toBeLessThanOrEqual(desc2.offset);
  });
});

// ---------------------------------------------------------------------------
// Integration test — compile a patch and verify arena layout
// ---------------------------------------------------------------------------

describe('arenaLayout integration', () => {
  it('compiled program has consistent arenaLayout', () => {
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      b.setPortDefault(time, 'periodAMs', 1000);
      const osc = b.addBlock('Oscillator');
      b.wire(time, 'phaseA', osc, 'phase');
    });

    const result = compile(patch);
    if (result.kind === 'error') {
      throw new Error(`Compile failed: ${result.errors.map((e) => e.message).join(', ')}`);
    }
    const program = result.program;

    // arenaLayout has same length as slotMeta
    expect(program.arenaLayout.length).toBe(program.slotMeta.length);

    // Verify non-overlapping: for all non-sentinel descriptors, regions don't overlap
    const regions = program.arenaLayout
      .filter((d) => d.offset >= 0)
      .map((d) => ({ start: d.offset, end: d.offset + d.length }))
      .sort((a, b) => a.start - b.start);

    for (let i = 1; i < regions.length; i++) {
      expect(regions[i].start).toBeGreaterThanOrEqual(regions[i - 1].end);
    }

    // arenaTotalFloats equals sum of all non-sentinel descriptor lengths
    const totalFromLayout = program.arenaLayout
      .filter((d) => d.offset >= 0)
      .reduce((sum, d) => sum + d.length, 0);
    expect(program.arenaTotalFloats).toBe(totalFromLayout);

    // arenaTotalFloats > 0 (a compiled program with blocks must have slots)
    expect(program.arenaTotalFloats).toBeGreaterThan(0);
  });

  it('runtime state arena length matches compiled arenaTotalFloats', () => {
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      b.setPortDefault(time, 'periodAMs', 1000);
      const osc = b.addBlock('Oscillator');
      b.wire(time, 'phaseA', osc, 'phase');
    });

    const result = compile(patch);
    if (result.kind === 'error') {
      throw new Error(`Compile failed: ${result.errors.map((e) => e.message).join(', ')}`);
    }
    const program = result.program;

    const state = createRuntimeState(
      program.slotMeta.length,
      0, // stateSlotCount
      0, // eventSlotCount
      0, // eventExprCount
      0, // valueExprCount
      program.arenaTotalFloats,
    );

    expect(state.arena).toBeInstanceOf(Float32Array);
    expect(state.arena.length).toBe(program.arenaTotalFloats);
  });
});
