/**
 * Arena Layout Tests
 *
 * Verifies that deriveArenaDescriptor() computes correct arena slot descriptors
 * and that the compiled program's arenaLayout is consistent with slotMeta.
 */

import { describe, it, expect } from 'vitest';
import {
  deriveArenaDescriptor,
  deriveArenaZonePlan,
  DEFAULT_ARENA_ALIGNMENT_POLICY,
} from '../ir/storage-class';
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
import type { ScheduleIR } from '../backend/schedule-program';
import type { ValueSlot } from '../../types';

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
    expect(desc).toEqual(expect.objectContaining({
      offset: 0,
      stride: 1,
      laneCount: 1,
      length: 1,
      packing: 'soa',
      laneStride: 1,
      componentStride: 1,
    }));
  });

  it('one (vec3): stride=3, laneCount=1, length=3', () => {
    const type = canonicalScalar(VEC3);
    const desc = deriveArenaDescriptor(type, 0, emptyInstances);
    expect(desc).toEqual(expect.objectContaining({
      offset: 0,
      stride: 3,
      laneCount: 1,
      length: 3,
      packing: 'soa',
      laneStride: 1,
      componentStride: 1,
    }));
  });

  it('field (many, float, count=10): stride=1, laneCount=10, length=10', () => {
    const ref = instanceRef('grid', 'inst_a');
    const instances = makeInstances([{ id: 'inst_a', count: 10, maxCount: 10 }]);
    const type = canonicalMany(FLOAT, undefined, ref);
    const desc = deriveArenaDescriptor(type, 0, instances);
    expect(desc).toEqual(expect.objectContaining({
      offset: 0,
      stride: 1,
      laneCount: 10,
      length: 10,
      packing: 'soa',
      laneStride: 1,
      componentStride: 10,
    }));
  });

  it('field (many, color, count=5): stride=4, laneCount=5, length=20', () => {
    const ref = instanceRef('grid', 'inst_b');
    const instances = makeInstances([{ id: 'inst_b', count: 5, maxCount: 5 }]);
    const type = canonicalMany(COLOR, undefined, ref);
    const desc = deriveArenaDescriptor(type, 0, instances);
    expect(desc).toEqual(expect.objectContaining({
      offset: 0,
      stride: 4,
      laneCount: 5,
      length: 20,
      packing: 'soa',
      laneStride: 1,
      componentStride: 5,
    }));
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

describe('deriveArenaZonePlan', () => {
  it('emits header/scalar/field/state/gauge zones with deterministic ordering', () => {
    const ref = instanceRef('grid', 'inst_zone');
    const instances = makeInstances([{ id: 'inst_zone', count: 8, maxCount: 8 }]);
    const plan = deriveArenaZonePlan(
      [
        {
          slot: 1 as ValueSlot,
          type: canonicalScalar(FLOAT),
          packingPreference: 'aos',
        },
        {
          slot: 2 as ValueSlot,
          type: canonicalMany(VEC3, undefined, ref),
          packingPreference: 'soa',
        },
      ],
      instances,
      DEFAULT_ARENA_ALIGNMENT_POLICY,
    );
    const zones = plan.toIR().zones;
    expect(zones.map((z) => z.kind)).toEqual(['header', 'scalar', 'field', 'state', 'gauge']);
    expect(zones[0].length).toBe(DEFAULT_ARENA_ALIGNMENT_POLICY.headerFloats);
  });

  it('aligns field zone start to scalar->field alignment boundary', () => {
    const ref = instanceRef('grid', 'inst_align');
    const instances = makeInstances([{ id: 'inst_align', count: 5, maxCount: 5 }]);
    const plan = deriveArenaZonePlan(
      [
        {
          slot: 1 as ValueSlot,
          type: canonicalScalar(VEC3), // length 3 to force non-aligned scalar end
          packingPreference: 'aos',
        },
        {
          slot: 2 as ValueSlot,
          type: canonicalMany(COLOR, undefined, ref),
          packingPreference: 'soa',
        },
      ],
      instances,
      DEFAULT_ARENA_ALIGNMENT_POLICY,
    );
    const zones = plan.toIR().zones;
    const fieldZone = zones.find((z) => z.kind === 'field');
    expect(fieldZone).toBeDefined();
    expect(fieldZone!.start % DEFAULT_ARENA_ALIGNMENT_POLICY.scalarToFieldAlignFloats).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Integration test — compile a patch and verify arena layout
// ---------------------------------------------------------------------------

describe('arenaLayout integration', () => {
  it('emits deterministic arena offsets across repeated compilation of identical input', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');

      const ellipse = b.addBlock('Ellipse');
      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 6);
      b.wire(ellipse, 'shape', array, 'element');

      const grid = b.addBlock('GridLayoutUV');
      b.setPortDefault(grid, 'rows', 2);
      b.setPortDefault(grid, 'cols', 3);
      b.wire(array, 'elements', grid, 'elements');

      const colorSignal = b.addBlock('Const');
      b.setConfig(colorSignal, 'value', { r: 0.1, g: 0.4, b: 0.8, a: 1 });
      const colorField = b.addBlock('Broadcast');
      b.wire(colorSignal, 'out', colorField, 'one');

      const render = b.addBlock('RenderInstances2D');
      b.wire(grid, 'controlPoints', render, 'controlPoints');
      b.wire(colorField, 'field', render, 'color');
    });

    const first = compile(patch);
    const second = compile(patch);
    if (first.kind === 'error') {
      throw new Error(`First compile failed: ${first.errors.map((e) => e.message).join(', ')}`);
    }
    if (second.kind === 'error') {
      throw new Error(`Second compile failed: ${second.errors.map((e) => e.message).join(', ')}`);
    }

    const normalizeDescriptors = (layout: readonly { offset: number; stride: number; laneCount: number; length: number; packing?: string; laneStride?: number; componentStride?: number }[]) =>
      layout.map((d) => ({
        offset: d.offset,
        stride: d.stride,
        laneCount: d.laneCount,
        length: d.length,
        packing: d.packing ?? 'soa',
        laneStride: d.laneStride ?? 1,
        componentStride: d.componentStride ?? d.laneCount,
      }));

    expect(normalizeDescriptors(first.program.arenaLayout)).toEqual(normalizeDescriptors(second.program.arenaLayout));
    expect(first.program.arenaTotalFloats).toBe(second.program.arenaTotalFloats);
    expect(first.program.arenaZones).toEqual(second.program.arenaZones);
  });

  it('keeps continuity-owned multi-component render slots in SoA descriptors', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');

      const ellipse = b.addBlock('Ellipse');
      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 4);
      b.wire(ellipse, 'shape', array, 'element');

      const grid = b.addBlock('GridLayoutUV');
      b.setPortDefault(grid, 'rows', 2);
      b.setPortDefault(grid, 'cols', 2);
      b.wire(array, 'elements', grid, 'elements');

      const colorSignal = b.addBlock('Const');
      b.setConfig(colorSignal, 'value', { r: 1, g: 0.25, b: 0.1, a: 1 });
      const colorField = b.addBlock('Broadcast');
      b.wire(colorSignal, 'out', colorField, 'one');

      const render = b.addBlock('RenderInstances2D');
      b.wire(grid, 'controlPoints', render, 'controlPoints');
      b.wire(colorField, 'field', render, 'color');
    });

    const result = compile(patch);
    if (result.kind === 'error') {
      throw new Error(`Compile failed: ${result.errors.map((e) => e.message).join(', ')}`);
    }
    const schedule = result.program.schedule as ScheduleIR;
    const renderStep = schedule.steps.find((s) => s.kind === 'render');
    expect(renderStep).toBeDefined();
    if (!renderStep || renderStep.kind !== 'render') return;

    const continuityOutputSlots = new Set(
      schedule.steps
        .filter((s): s is Extract<ScheduleIR['steps'][number], { kind: 'continuityApply' }> => s.kind === 'continuityApply')
        .map((s) => s.outputSlot),
    );
    expect(continuityOutputSlots.has(renderStep.controlPointsSlot)).toBe(true);
    expect(continuityOutputSlots.has(renderStep.colorSlot)).toBe(true);

    const positionDesc = result.program.runtimeAddressTable?.slotToArena.get(renderStep.controlPointsSlot);
    const colorDesc = result.program.runtimeAddressTable?.slotToArena.get(renderStep.colorSlot);
    // [LAW:dataflow-not-control-flow] Continuity does not change packing mode;
    // render multi-component lanes stay channel-separated in SoA layout.
    expect(positionDesc?.packing).toBe('soa');
    expect(colorDesc?.packing).toBe('soa');
  });

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

    // arenaTotalFloats includes zone padding (header + alignment), so it must
    // be >= payload descriptor sum and match emitted zone metadata total.
    const totalFromLayout = program.arenaLayout
      .filter((d) => d.offset >= 0)
      .reduce((sum, d) => sum + d.length, 0);
    expect(program.arenaTotalFloats).toBeGreaterThanOrEqual(totalFromLayout);
    const arenaZones = program.arenaZones;
    expect(arenaZones).toBeDefined();
    if (!arenaZones) {
      throw new Error('Compiled program missing arenaZones metadata');
    }
    expect(program.arenaTotalFloats).toBe(arenaZones.totalFloats);

    // arenaTotalFloats > 0 (a compiled program with blocks must have slots)
    expect(program.arenaTotalFloats).toBeGreaterThan(0);

    // Zone contract is explicit and ordered.
    expect(arenaZones.zones.map((z) => z.kind)).toEqual([
      'header',
      'scalar',
      'field',
      'state',
      'gauge',
    ]);
    const fieldZone = arenaZones.zones.find((z) => z.kind === 'field');
    if (fieldZone && fieldZone.length > 0) {
      expect(fieldZone.start % arenaZones.alignment.scalarToFieldAlignFloats).toBe(0);
    }
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
