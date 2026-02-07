/**
 * executeFrameStepped — Generator Executor Tests
 *
 * Tests that the generator-based stepped executor produces the same results
 * as executeFrame() and yields snapshots with correct phase ordering.
 */

import { describe, it, expect } from 'vitest';
import { compile } from '../../compiler/compile';
import { buildPatch } from '../../graph/Patch';
import { executeFrame } from '../ScheduleExecutor';
import { executeFrameStepped } from '../executeFrameStepped';
import { createRuntimeState } from '../RuntimeState';
import { computeStorageSizes } from '../../compiler/ir/program';
import type { CompiledProgramIR } from '../../compiler/ir/program';
import type { ScheduleIR } from '../../compiler/backend/schedule-program';
import { getTestArena } from './test-arena-helper';
import type { StepSnapshot, ExecutionPhase } from '../StepDebugTypes';

// Ensure all blocks are registered
import '../../blocks/all';

function compileSimplePatch() {
  const patch = buildPatch((b) => {
    b.addBlock('InfiniteTimeRoot');

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

  const result = compile(patch);
  if (result.kind === 'error') {
    throw new Error(`Compile failed: ${result.errors.map(e => e.message).join(', ')}`);
  }
  return result.program;
}

function createStateForProgram(program: CompiledProgramIR) {
  const schedule = program.schedule as ScheduleIR;
  const sizes = computeStorageSizes(program.slotMeta);
  return createRuntimeState(
    sizes.f64,
    schedule.stateSlotCount ?? 0,
    (schedule as any).eventSlotCount ?? 0,
    (schedule as any).eventCount ?? 0,
    program.valueExprs.nodes.length,
  );
}

describe('executeFrameStepped', () => {
  it('produces correct phase sequence: pre-frame -> phase1... -> phase-boundary -> phase2... -> post-frame', () => {
    const program = compileSimplePatch();
    const state = createStateForProgram(program);
    const arena = getTestArena();

    const gen = executeFrameStepped(program, state, arena, 100);
    const phases: ExecutionPhase[] = [];

    let result = gen.next();
    while (!result.done) {
      const snapshot = result.value as StepSnapshot;
      phases.push(snapshot.phase);
      result = gen.next();
    }

    // First must be pre-frame
    expect(phases[0]).toBe('pre-frame');

    // Last must be post-frame
    expect(phases[phases.length - 1]).toBe('post-frame');

    // Must have exactly one phase-boundary
    const boundaryCount = phases.filter(p => p === 'phase-boundary').length;
    expect(boundaryCount).toBe(1);

    // Phase ordering: pre-frame, then phase1*, then phase-boundary, then phase2*, then post-frame
    let seenBoundary = false;
    for (const phase of phases) {
      if (phase === 'phase-boundary') {
        seenBoundary = true;
        continue;
      }
      if (phase === 'pre-frame' || phase === 'post-frame') continue;
      if (!seenBoundary) {
        expect(phase).toBe('phase1');
      } else {
        expect(phase).toBe('phase2');
      }
    }
  });

  it('returns a valid RenderFrameIR', () => {
    const program = compileSimplePatch();
    const state = createStateForProgram(program);
    const arena = getTestArena();

    const gen = executeFrameStepped(program, state, arena, 100);
    let result = gen.next();
    while (!result.done) {
      result = gen.next();
    }

    const frame = result.value;
    expect(frame).toBeDefined();
    expect(frame.ops).toBeDefined();
    expect(frame.ops.length).toBeGreaterThan(0);
  });

  it('f64 slot values match executeFrame output', () => {
    const program = compileSimplePatch();

    // Run executeFrame
    const state1 = createStateForProgram(program);
    const arena1 = getTestArena();
    executeFrame(program, state1, arena1, 100);

    // Run executeFrameStepped
    const state2 = createStateForProgram(program);
    const arena2 = getTestArena();
    const gen = executeFrameStepped(program, state2, arena2, 100);
    let result = gen.next();
    while (!result.done) {
      result = gen.next();
    }

    // Compare f64 value stores
    expect(state2.values.f64.length).toBe(state1.values.f64.length);
    for (let i = 0; i < state1.values.f64.length; i++) {
      const v1 = state1.values.f64[i];
      const v2 = state2.values.f64[i];
      if (Number.isNaN(v1)) {
        expect(Number.isNaN(v2)).toBe(true);
      } else {
        expect(v2).toBeCloseTo(v1, 10);
      }
    }
  });

  it('phase1 snapshots have valid step indices and step references', () => {
    const program = compileSimplePatch();
    const state = createStateForProgram(program);
    const arena = getTestArena();

    const gen = executeFrameStepped(program, state, arena, 100);
    const phase1Snapshots: StepSnapshot[] = [];

    let result = gen.next();
    while (!result.done) {
      const snapshot = result.value as StepSnapshot;
      if (snapshot.phase === 'phase1') {
        phase1Snapshots.push(snapshot);
      }
      result = gen.next();
    }

    expect(phase1Snapshots.length).toBeGreaterThan(0);

    for (const snapshot of phase1Snapshots) {
      expect(snapshot.stepIndex).toBeGreaterThanOrEqual(0);
      expect(snapshot.step).not.toBeNull();
      expect(snapshot.totalSteps).toBeGreaterThan(0);
      expect(snapshot.frameId).toBe(state.cache.frameId);
      expect(snapshot.tMs).toBe(100);
    }
  });

  it('phase markers have stepIndex -1 and null step', () => {
    const program = compileSimplePatch();
    const state = createStateForProgram(program);
    const arena = getTestArena();

    const gen = executeFrameStepped(program, state, arena, 100);
    let result = gen.next();
    while (!result.done) {
      const snapshot = result.value as StepSnapshot;
      if (snapshot.phase === 'pre-frame' || snapshot.phase === 'phase-boundary' || snapshot.phase === 'post-frame') {
        expect(snapshot.stepIndex).toBe(-1);
        expect(snapshot.step).toBeNull();
      }
      result = gen.next();
    }
  });

  it('evalValue steps capture written slots', () => {
    const program = compileSimplePatch();
    const state = createStateForProgram(program);
    const arena = getTestArena();

    const gen = executeFrameStepped(program, state, arena, 100);
    let foundWrittenSlots = false;

    let result = gen.next();
    while (!result.done) {
      const snapshot = result.value as StepSnapshot;
      if (snapshot.phase === 'phase1' && snapshot.writtenSlots.size > 0) {
        foundWrittenSlots = true;
        for (const [_slot, value] of snapshot.writtenSlots) {
          expect(['scalar', 'buffer', 'event', 'object']).toContain(value.kind);
        }
      }
      result = gen.next();
    }

    expect(foundWrittenSlots).toBe(true);
  });
});
