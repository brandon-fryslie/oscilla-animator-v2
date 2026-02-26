/**
 * Temporal Comparison (Cross-Frame Diff) Tests
 *
 * Tests that previousFrameValues flows through executeFrameStepped and
 * StepDebugSession, and that computeSlotDeltas produces correct deltas.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { compile } from '../../compiler/compile';
import { buildPatch } from '../../graph/Patch';
import { executeFrame } from '../ScheduleExecutor';
import { executeFrameStepped } from '../executeFrameStepped';
import { createRuntimeState } from '../RuntimeState';
import { computeRuntimeStorageSizes } from '../../compiler/ir/program';
import type { CompiledProgramIR } from '../../compiler/ir/program';
import type { ValueSlot } from '../../compiler/ir/Indices';
import type { ScheduleIR } from '../../compiler/backend/schedule-program';
import { getTestArena } from './test-arena-helper';
import { StepDebugSession } from '../StepDebugSession';
import type { StepSnapshot, SlotValue } from '../StepDebugTypes';
import { computeSlotDeltas } from '../ValueInspector';

// Ensure all blocks are registered
import { registerAllBlocks } from '../../blocks/all';
registerAllBlocks();

function compileSimplePatch(): CompiledProgramIR {
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
    b.wire(layout, 'controlPoints', render, 'controlPoints');
    b.wire(colorField, 'field', render, 'color');
  });

  const result = compile(patch);
  if (result.kind === 'error') {
    throw new Error(`Compile failed: ${result.errors.map(e => e.message).join(', ')}`);
  }
  return result.program;
}

function compilePhasorPatch(): CompiledProgramIR {
  const patch = buildPatch((b) => {
    b.addBlock('InfiniteTimeRoot');

    const frequency = b.addBlock('Const');
    b.setConfig(frequency, 'value', 7_500);

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
    b.wire(layout, 'controlPoints', render, 'controlPoints');
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

/** Run a generator to completion, collecting all snapshots */
function collectSnapshots(gen: Generator<StepSnapshot, any, void>): StepSnapshot[] {
  const snapshots: StepSnapshot[] = [];
  let result = gen.next();
  while (!result.done) {
    snapshots.push(result.value);
    result = gen.next();
  }
  return snapshots;
}

/** Extract all scalar slot values from a list of snapshots */
function extractScalarValues(snapshots: StepSnapshot[]): Map<ValueSlot, number> {
  const values = new Map<ValueSlot, number>();
  for (const snap of snapshots) {
    for (const [slot, value] of snap.writtenSlots) {
      if (value.kind === 'scalar') {
        values.set(slot, value.value);
      }
    }
  }
  return values;
}

describe('Temporal Comparison (Cross-Frame Diff)', () => {
  let simpleProgram: CompiledProgramIR;
  let phasorProgram: CompiledProgramIR;

  beforeAll(() => {
    // [LAW:one-source-of-truth] Reuse canonical compiled fixtures; per-test runtime state remains isolated.
    simpleProgram = compileSimplePatch();
    phasorProgram = compilePhasorPatch();
  });

  describe('executeFrameStepped previousFrameValues parameter', () => {
    it('snapshots have null previousFrameValues when no previous frame data is passed', () => {
      const program = simpleProgram;
      const state = createStateForProgram(program);
      const arena = getTestArena();

      const snapshots = collectSnapshots(
        executeFrameStepped(program, state, arena, 100),
      );

      expect(snapshots.length).toBeGreaterThan(0);
      for (const snap of snapshots) {
        expect(snap.previousFrameValues).toBeNull();
      }
    });

    it('snapshots carry previousFrameValues when previous frame data is passed', () => {
      const program = simpleProgram;
      const state = createStateForProgram(program);
      const arena = getTestArena();

      // Run first frame to get slot values
      const frame1Snapshots = collectSnapshots(
        executeFrameStepped(program, state, arena, 100),
      );
      const frame1Values = extractScalarValues(frame1Snapshots);
      expect(frame1Values.size).toBeGreaterThan(0);

      // Run second frame with previous values
      const arena2 = getTestArena();
      const frame2Snapshots = collectSnapshots(
        executeFrameStepped(program, state, arena2, 200, frame1Values),
      );

      expect(frame2Snapshots.length).toBeGreaterThan(0);
      for (const snap of frame2Snapshots) {
        expect(snap.previousFrameValues).toBe(frame1Values);
      }
    });
  });

  describe('StepDebugSession cross-frame state', () => {
    it('lastFrameValues is null before any frame completes', () => {
      const program = simpleProgram;
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      expect(session.lastFrameValues).toBeNull();
    });

    it('lastFrameValues is populated after first frame completes via finishFrame', () => {
      const program = simpleProgram;
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      session.startFrame(100);
      session.finishFrame();

      expect(session.lastFrameValues).not.toBeNull();
      expect(session.lastFrameValues!.size).toBeGreaterThan(0);
    });

    it('lastFrameValues is populated after frame completes via stepNext exhaustion', () => {
      const program = simpleProgram;
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      session.startFrame(100);
      while (session.stepNext() !== null) { /* drain */ }

      expect(session.lastFrameValues).not.toBeNull();
      expect(session.lastFrameValues!.size).toBeGreaterThan(0);
    });

    it('second frame snapshots carry previousFrameValues from first frame', () => {
      const program = simpleProgram;
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      // Complete first frame
      session.startFrame(100);
      session.finishFrame();
      const firstFrameValues = session.lastFrameValues;
      expect(firstFrameValues).not.toBeNull();

      // Start second frame
      const snap = session.startFrame(200);
      // The pre-frame snapshot should carry the previous frame values
      expect(snap.previousFrameValues).toBe(firstFrameValues);

      // Step through and verify all snapshots carry the previous frame values
      let next = session.stepNext();
      while (next !== null) {
        expect(next.previousFrameValues).toBe(firstFrameValues);
        next = session.stepNext();
      }
    });

    it('lastFrameValues is populated after frame completes via runToBreakpoint', () => {
      const program = simpleProgram;
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      // No breakpoints → runToBreakpoint runs to completion
      session.startFrame(100);
      session.runToBreakpoint();

      expect(session.mode).toBe('completed');
      expect(session.lastFrameValues).not.toBeNull();
    });

    it('lastFrameValues persists across frame restarts', () => {
      const program = simpleProgram;
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      // Frame 1
      session.startFrame(100);
      session.finishFrame();
      const frame1Values = session.lastFrameValues;

      // Frame 2
      session.startFrame(200);
      session.finishFrame();
      const frame2Values = session.lastFrameValues;

      // Frame 2 values should be different from frame 1 (different object)
      expect(frame2Values).not.toBe(frame1Values);
      // But both should have entries
      expect(frame2Values!.size).toBeGreaterThan(0);
    });
  });

  describe('computeSlotDeltas', () => {
    it('returns empty map when previousValues is null', () => {
      const currentSlots = new Map<ValueSlot, SlotValue>();
      currentSlots.set(1 as ValueSlot, {
        kind: 'scalar',
        value: 5,
        type: { payload: { kind: 'float' }, unit: { kind: 'none' }, extent: {} } as any,
      });

      const deltas = computeSlotDeltas(currentSlots, null);
      expect(deltas.size).toBe(0);
    });

    it('returns empty map when no slots overlap', () => {
      const currentSlots = new Map<ValueSlot, SlotValue>();
      currentSlots.set(1 as ValueSlot, {
        kind: 'scalar',
        value: 5,
        type: { payload: { kind: 'float' }, unit: { kind: 'none' }, extent: {} } as any,
      });

      const previousValues = new Map<ValueSlot, number>();
      previousValues.set(2 as ValueSlot, 3);

      const deltas = computeSlotDeltas(currentSlots, previousValues);
      expect(deltas.size).toBe(0);
    });

    it('computes correct delta for overlapping scalar slots', () => {
      const slot = 42 as ValueSlot;
      const currentSlots = new Map<ValueSlot, SlotValue>();
      currentSlots.set(slot, {
        kind: 'scalar',
        value: 7.5,
        type: { payload: { kind: 'float' }, unit: { kind: 'none' }, extent: {} } as any,
      });

      const previousValues = new Map<ValueSlot, number>();
      previousValues.set(slot, 3.0);

      const deltas = computeSlotDeltas(currentSlots, previousValues);
      expect(deltas.size).toBe(1);

      const d = deltas.get(slot)!;
      expect(d.current).toBe(7.5);
      expect(d.previous).toBe(3.0);
      expect(d.delta).toBeCloseTo(4.5);
    });

    it('handles multiple overlapping slots', () => {
      const slot1 = 10 as ValueSlot;
      const slot2 = 20 as ValueSlot;
      const slot3 = 30 as ValueSlot;

      const currentSlots = new Map<ValueSlot, SlotValue>();
      const fakeType = { payload: { kind: 'float' }, unit: { kind: 'none' }, extent: {} } as any;
      currentSlots.set(slot1, { kind: 'scalar', value: 1.0, type: fakeType });
      currentSlots.set(slot2, { kind: 'scalar', value: 5.0, type: fakeType });
      currentSlots.set(slot3, { kind: 'buffer', buffer: new Float32Array([1, 2]), count: 2, type: fakeType });

      const previousValues = new Map<ValueSlot, number>();
      previousValues.set(slot1, 0.5);
      previousValues.set(slot2, 10.0);
      previousValues.set(slot3, 999); // buffer slots are skipped

      const deltas = computeSlotDeltas(currentSlots, previousValues);
      // slot3 is buffer, so not included
      expect(deltas.size).toBe(2);

      expect(deltas.get(slot1)!.delta).toBeCloseTo(0.5);
      expect(deltas.get(slot2)!.delta).toBeCloseTo(-5.0);
      expect(deltas.has(slot3)).toBe(false);
    });

    it('handles NaN values gracefully', () => {
      const slot = 5 as ValueSlot;
      const currentSlots = new Map<ValueSlot, SlotValue>();
      currentSlots.set(slot, {
        kind: 'scalar',
        value: NaN,
        type: { payload: { kind: 'float' }, unit: { kind: 'none' }, extent: {} } as any,
      });

      const previousValues = new Map<ValueSlot, number>();
      previousValues.set(slot, 1.0);

      const deltas = computeSlotDeltas(currentSlots, previousValues);
      expect(deltas.size).toBe(1);
      const d = deltas.get(slot)!;
      expect(d.current).toBeNaN();
      expect(d.previous).toBe(1.0);
      expect(d.delta).toBeNaN(); // NaN - 1.0 = NaN
    });

    it('handles zero delta correctly', () => {
      const slot = 1 as ValueSlot;
      const currentSlots = new Map<ValueSlot, SlotValue>();
      currentSlots.set(slot, {
        kind: 'scalar',
        value: 42.0,
        type: { payload: { kind: 'float' }, unit: { kind: 'none' }, extent: {} } as any,
      });

      const previousValues = new Map<ValueSlot, number>();
      previousValues.set(slot, 42.0);

      const deltas = computeSlotDeltas(currentSlots, previousValues);
      expect(deltas.get(slot)!.delta).toBe(0);
    });
  });

  describe('Integration: two frames with executeFrameStepped', () => {
    it('second frame gets previousFrameValues matching first frame slot values', () => {
      const program = simpleProgram;
      const state = createStateForProgram(program);

      // Frame 1 — no previous values
      const arena1 = getTestArena();
      const frame1Snapshots = collectSnapshots(
        executeFrameStepped(program, state, arena1, 100),
      );
      const frame1Values = extractScalarValues(frame1Snapshots);

      // Frame 2 — with previous values from frame 1
      const arena2 = getTestArena();
      const frame2Snapshots = collectSnapshots(
        executeFrameStepped(program, state, arena2, 200, frame1Values),
      );

      // Find a phase1 snapshot with written slots and verify deltas
      const frame2WithSlots = frame2Snapshots.filter(
        s => s.phase === 'phase1' && s.writtenSlots.size > 0,
      );
      expect(frame2WithSlots.length).toBeGreaterThan(0);

      // Compute deltas for a snapshot that has scalar slots overlapping with frame 1
      let foundDelta = false;
      for (const snap of frame2WithSlots) {
        const deltas = computeSlotDeltas(snap.writtenSlots, snap.previousFrameValues);
        if (deltas.size > 0) {
          foundDelta = true;
          for (const [slot, d] of deltas) {
            // previous should match what frame 1 produced
            expect(d.previous).toBe(frame1Values.get(slot));
          }
        }
      }
      // At least one snapshot should produce a delta (static values -> delta = 0)
      expect(foundDelta).toBe(true);
    });
  });

  describe('Long-horizon state stability', () => {
    it('keeps phasor accumulator bounded under executeFrame over long runs', () => {
      const program = phasorProgram;
      const schedule = program.schedule as ScheduleIR;
      const phasorMapping = schedule.stateMappings.find((mapping) => mapping.stateId.endsWith(':phasor'));
      expect(phasorMapping).toBeDefined();
      if (!phasorMapping) return;

      const state = createStateForProgram(program);
      const arena = getTestArena();

      let timeMs = 0;
      for (let frame = 0; frame < 2048; frame++) {
        timeMs += 8.33;
        arena.reset();
        executeFrame(program, state, arena, timeMs);
        const value = state.state[phasorMapping.slotStart] ?? NaN;
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('keeps phasor state phase-locked after a 4-hour absolute-time fast-forward', () => {
      const program = compilePhasorPatch();
      const schedule = program.schedule as ScheduleIR;
      const phasorMapping = schedule.stateMappings.find((mapping) => mapping.stateId.endsWith(':phasor'));
      expect(phasorMapping).toBeDefined();
      if (!phasorMapping) return;

      const baselineState = createStateForProgram(program);
      const offsetState = createStateForProgram(program);
      const baselineArena = getTestArena();
      const offsetArena = getTestArena();

      // [LAW:verifiable-goals] Same dt sequence at T=0 and T=4h must produce
      // equivalent wrapped phasor state, proving no absolute-time dependency.
      const dtMs = 16;
      const offsetMs = 14_400_000; // 4 hours
      for (let frame = 0; frame < 100; frame++) {
        const frameTime = (frame + 1) * dtMs;
        baselineArena.reset();
        offsetArena.reset();

        executeFrame(program, baselineState, baselineArena, frameTime);
        executeFrame(program, offsetState, offsetArena, offsetMs + frameTime);

        const baseline = baselineState.state[phasorMapping.slotStart] ?? NaN;
        const offset = offsetState.state[phasorMapping.slotStart] ?? NaN;
        expect(Number.isFinite(baseline)).toBe(true);
        expect(Number.isFinite(offset)).toBe(true);
        expect(offset).toBeCloseTo(baseline, 7);
        expect(offset).toBeGreaterThanOrEqual(0);
        expect(offset).toBeLessThan(1);
      }
    });
  });
});
