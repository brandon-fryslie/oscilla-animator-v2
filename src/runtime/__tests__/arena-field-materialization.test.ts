/**
 * Arena Field Materialization Tests
 *
 * Verifies that field materialization writes to the arena region
 * (in addition to the objects map) for many-cardinality slots.
 *
 * [LAW:one-source-of-truth] Arena is the canonical flat buffer for all numeric
 * values. These tests prove materialized field data appears in the arena at the
 * correct descriptor offset after executeFrame.
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../../compiler/compile';
import type { ScheduleIR } from '../../compiler/backend/schedule-program';
import { computeStorageSizes } from '../../compiler/ir/program';
import { createRuntimeState, executeFrame } from '../../runtime';
import { arenaSlice } from '../ArenaValueStore';
import { getTestArena } from './test-arena-helper';
import type { Step } from '../../compiler/ir/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function compileOk(patch: ReturnType<typeof buildPatch>) {
  const result = compile(patch);
  if (result.kind === 'error') {
    throw new Error(
      `Compilation failed:\n${result.errors.map((e) => `  [${e.code}] ${e.message}`).join('\n')}`,
    );
  }
  return result.program;
}

function stateFor(program: ReturnType<typeof compileOk>) {
  const schedule = program.schedule as ScheduleIR;
  const sizes = computeStorageSizes(program.slotMeta);
  return createRuntimeState(
    sizes.f64,
    schedule.stateSlotCount,
    schedule.eventSlotCount ?? 0,
    schedule.eventCount ?? 0,
    program.valueExprs.nodes.length,
    program.arenaTotalFloats,
  );
}

/** Collect target slots from materialize steps in the schedule. */
function materializeTargets(program: ReturnType<typeof compileOk>): Set<number> {
  const schedule = program.schedule as ScheduleIR;
  const targets = new Set<number>();
  for (const step of schedule.steps as readonly Step[]) {
    if (step.kind === 'materialize') {
      targets.add(step.target as number);
    }
  }
  return targets;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('arena field materialization', () => {
  it('arena contains materialized field values matching objects map for materialize targets', () => {
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      b.setPortDefault(time, 'periodAMs', 1000);
      const ellipse = b.addBlock('Ellipse');
      b.setPortDefault(ellipse, 'rx', 0.03);
      b.setPortDefault(ellipse, 'ry', 0.03);
      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 4);
      const layout = b.addBlock('GridLayoutUV');
      b.setPortDefault(layout, 'rows', 2);
      b.setPortDefault(layout, 'cols', 2);
      const render = b.addBlock('RenderInstances2D');

      const colorSig = b.addBlock('Const');
      b.setConfig(colorSig, 'value', { r: 1, g: 0.5, b: 0.2, a: 1 });
      const colorField = b.addBlock('Broadcast');
      b.wire(colorSig, 'out', colorField, 'signal');

      b.wire(ellipse, 'shape', array, 'element');
      b.wire(array, 'elements', layout, 'elements');
      b.wire(layout, 'position', render, 'pos');
      b.wire(colorField, 'field', render, 'color');
    });

    const program = compileOk(patch);
    const state = stateFor(program);
    const renderArena = getTestArena();

    executeFrame(program, state, renderArena, 0);

    // Only check slots that are targets of materialize steps
    const targets = materializeTargets(program);
    expect(targets.size).toBeGreaterThan(0);

    let checked = 0;
    for (const slotId of targets) {
      const desc = program.arenaLayout[slotId];
      if (!desc || desc.offset < 0) continue;

      const arenaRegion = arenaSlice(state.arena, desc);
      const objectsBuf = state.values.objects.get(slotId as any) as Float32Array | undefined;
      if (!objectsBuf || objectsBuf.length === 0) continue;

      // Arena region must match the objects buffer (byte-for-byte for materialized range)
      const compareLen = Math.min(objectsBuf.length, desc.length);
      for (let i = 0; i < compareLen; i++) {
        expect(arenaRegion[i]).toBe(objectsBuf[i]);
      }
      checked++;
    }

    expect(checked).toBeGreaterThan(0);
  });

  it('arena region is non-zero for circle layout position field', () => {
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      b.setPortDefault(time, 'periodAMs', 1000);
      const ellipse = b.addBlock('Ellipse');
      b.setPortDefault(ellipse, 'rx', 0.05);
      b.setPortDefault(ellipse, 'ry', 0.05);
      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 8);
      const layout = b.addBlock('CircleLayoutUV');
      b.setPortDefault(layout, 'radius', 0.3);
      const render = b.addBlock('RenderInstances2D');

      const colorSig = b.addBlock('Const');
      b.setConfig(colorSig, 'value', { r: 0, g: 1, b: 0, a: 1 });
      const colorField = b.addBlock('Broadcast');
      b.wire(colorSig, 'out', colorField, 'signal');

      b.wire(ellipse, 'shape', array, 'element');
      b.wire(array, 'elements', layout, 'elements');
      b.wire(layout, 'position', render, 'pos');
      b.wire(colorField, 'field', render, 'color');
    });

    const program = compileOk(patch);
    const state = stateFor(program);
    const renderArena = getTestArena();

    executeFrame(program, state, renderArena, 0);

    // Collect arena regions for materialize targets
    const targets = materializeTargets(program);
    const fieldRegions: Float32Array[] = [];
    for (const slotId of targets) {
      const desc = program.arenaLayout[slotId];
      if (!desc || desc.offset < 0) continue;
      if (desc.laneCount <= 1) continue;
      fieldRegions.push(arenaSlice(state.arena, desc));
    }

    expect(fieldRegions.length).toBeGreaterThan(0);

    // At least one field region should contain non-zero data
    const hasNonZero = fieldRegions.some((region) => {
      for (let i = 0; i < region.length; i++) {
        if (region[i] !== 0) return true;
      }
      return false;
    });
    expect(hasNonZero).toBe(true);
  });

  it('arena size matches compiled arenaTotalFloats when state is created with it', () => {
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      b.setPortDefault(time, 'periodAMs', 1000);
      const ellipse = b.addBlock('Ellipse');
      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 4);
      const layout = b.addBlock('GridLayoutUV');
      const render = b.addBlock('RenderInstances2D');

      const colorSig = b.addBlock('Const');
      b.setConfig(colorSig, 'value', { r: 1, g: 0, b: 0, a: 1 });
      const colorField = b.addBlock('Broadcast');
      b.wire(colorSig, 'out', colorField, 'signal');

      b.wire(ellipse, 'shape', array, 'element');
      b.wire(array, 'elements', layout, 'elements');
      b.wire(layout, 'position', render, 'pos');
      b.wire(colorField, 'field', render, 'color');
    });

    const program = compileOk(patch);
    const state = stateFor(program);

    expect(state.arena.length).toBe(program.arenaTotalFloats);
    expect(program.arenaTotalFloats).toBeGreaterThan(0);
  });
});
