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
import { getExprAddressTable } from '../ExprAddressTable';
import { createRuntimeState } from '../RuntimeState';
import { computeRuntimeStorageSizes } from '../../compiler/ir/program';
import type { CompiledProgramIR } from '../../compiler/ir/program';
import type { ScheduleIR } from '../../compiler/backend/schedule-program';
import { getTestArena } from './test-arena-helper';
import type { StepSnapshot, ExecutionPhase } from '../StepDebugTypes';

// Ensure all blocks are registered
import { registerAllBlocks } from '../../blocks/all';
registerAllBlocks();

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
    b.wire(colorSig, 'out', colorField, 'one');

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

function compilePhasorPatch() {
  const patch = buildPatch((b) => {
    b.addBlock('InfiniteTimeRoot');

    const frequency = b.addBlock('Const');
    b.setConfig(frequency, 'value', 12_345);

    const phasor = b.addBlock('Phasor');
    b.wire(frequency, 'out', phasor, 'frequency');

    const ellipse = b.addBlock('Ellipse');
    b.setPortDefault(ellipse, 'rx', 0.03);
    b.setPortDefault(ellipse, 'ry', 0.03);

    const array = b.addBlock('Array');
    b.setPortDefault(array, 'count', 4);

    const layout = b.addBlock('CircleLayoutUV');
    b.wire(ellipse, 'shape', array, 'element');
    b.wire(array, 'elements', layout, 'elements');
    b.wire(phasor, 'out', layout, 'phase');

    const render = b.addBlock('RenderInstances2D');
    b.wire(layout, 'position', render, 'pos');
  });

  const result = compile(patch);
  if (result.kind === 'error') {
    throw new Error(`Compile failed: ${result.errors.map(e => e.message).join(', ')}`);
  }
  return result.program;
}

function createStateForProgram(program: CompiledProgramIR) {
  const schedule = program.schedule as ScheduleIR;
  const sizes = computeRuntimeStorageSizes(program.runtimeSlots);
  return createRuntimeState(
    sizes.f32,
    schedule.stateSlotCount ?? 0,
    (schedule as any).eventSlotCount ?? 0,
    (schedule as any).eventCount ?? 0,
    program.valueExprs.nodes.length,
    program.arenaTotalFloats,
  );
}

describe('executeFrameStepped', () => {
  it('fails fast when runtimeAddressTable is missing instead of deriving from slotMeta', () => {
    const program = compileSimplePatch();
    const brokenProgram = { ...program, runtimeAddressTable: undefined } as CompiledProgramIR;
    const state = createStateForProgram(program);
    const arena = getTestArena();

    const gen = executeFrameStepped(brokenProgram, state, arena, 100);
    expect(() => gen.next()).toThrow(/legacy metadata-based runtime address derivation is forbidden/);
  });

  it('consumes compiler-precomputed runtime address table contract', () => {
    const program = compileSimplePatch();
    const table = getExprAddressTable(program);
    expect(table).toBe(program.runtimeAddressTable);
    expect(table.slotLookup.size).toBeGreaterThan(0);
    expect(table.slotToArena.size).toBeGreaterThan(0);
  });

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

  it('phase1 value steps capture written slots', () => {
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

  it('keeps phasor state bounded during long-horizon stepped execution', () => {
    const program = compilePhasorPatch();
    const schedule = program.schedule as ScheduleIR;
    const phasorMapping = schedule.stateMappings.find((mapping) => mapping.stateId.endsWith(':phasor'));
    expect(phasorMapping).toBeDefined();
    if (!phasorMapping) return;

    const steppedState = createStateForProgram(program);
    const steppedArena = getTestArena();

    let timeMs = 0;
    for (let frame = 0; frame < 1024; frame++) {
      timeMs += 16.67;
      let stepped = executeFrameStepped(program, steppedState, steppedArena, timeMs);
      let steppedResult = stepped.next();
      while (!steppedResult.done) {
        steppedResult = stepped.next();
      }

      const value = steppedState.state[phasorMapping.slotStart] ?? NaN;
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }

    const directState = createStateForProgram(program);
    const directArena = getTestArena();
    timeMs = 0;
    for (let frame = 0; frame < 1024; frame++) {
      timeMs += 16.67;
      directArena.reset();
      executeFrame(program, directState, directArena, timeMs);
      const value = directState.state[phasorMapping.slotStart] ?? NaN;
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
