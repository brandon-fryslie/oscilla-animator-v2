/**
 * StepDebugSession Tests
 *
 * Tests session lifecycle, breakpoint matching, and execution control.
 */

import { describe, it, expect } from 'vitest';
import { compile } from '../../compiler/compile';
import { buildPatch } from '../../graph/Patch';
import { createRuntimeState } from '../RuntimeState';
import { computeStorageSizes } from '../../compiler/ir/program';
import type { CompiledProgramIR } from '../../compiler/ir/program';
import type { ScheduleIR } from '../../compiler/backend/schedule-program';
import { getTestArena } from './test-arena-helper';
import { StepDebugSession } from '../StepDebugSession';
import type { Breakpoint } from '../StepDebugTypes';

// Ensure all blocks are registered
import '../../blocks/all';

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

describe('StepDebugSession', () => {
  describe('lifecycle', () => {
    it('starts in idle mode', () => {
      const program = compileSimplePatch();
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      expect(session.mode).toBe('idle');
      expect(session.currentSnapshot).toBeNull();
      expect(session.frameResult).toBeNull();
    });

    it('transitions to paused after startFrame', () => {
      const program = compileSimplePatch();
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      const snap = session.startFrame(100);
      expect(session.mode).toBe('paused');
      expect(snap.phase).toBe('pre-frame');
      expect(session.currentSnapshot).toBe(snap);
    });

    it('transitions to completed after exhausting steps', () => {
      const program = compileSimplePatch();
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      session.startFrame(100);

      let snap = session.stepNext();
      while (snap !== null) {
        snap = session.stepNext();
      }

      expect(session.mode).toBe('completed');
      expect(session.currentSnapshot).toBeNull();
    });

    it('throws if startFrame called while frame in progress', () => {
      const program = compileSimplePatch();
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      session.startFrame(100);
      expect(() => session.startFrame(200)).toThrow(/Cannot start a new frame/);
    });

    it('allows starting a new frame after completion', () => {
      const program = compileSimplePatch();
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      session.startFrame(100);
      session.finishFrame();
      expect(session.mode).toBe('completed');

      // Should be able to start a new frame
      const snap = session.startFrame(200);
      expect(snap.phase).toBe('pre-frame');
      expect(session.mode).toBe('paused');
    });
  });

  describe('stepNext', () => {
    it('advances through all steps and returns null at end', () => {
      const program = compileSimplePatch();
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      session.startFrame(100);

      let count = 0;
      let snap = session.stepNext();
      while (snap !== null) {
        count++;
        snap = session.stepNext();
      }

      expect(count).toBeGreaterThan(0);
      expect(session.mode).toBe('completed');
    });

    it('returns null when session is idle', () => {
      const program = compileSimplePatch();
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      expect(session.stepNext()).toBeNull();
    });
  });

  describe('finishFrame', () => {
    it('completes the frame and returns RenderFrameIR', () => {
      const program = compileSimplePatch();
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      session.startFrame(100);
      const frame = session.finishFrame();

      expect(frame).toBeDefined();
      expect(frame!.ops).toBeDefined();
      expect(frame!.ops.length).toBeGreaterThan(0);
      expect(session.mode).toBe('completed');
    });

    it('returns cached result when called after completion', () => {
      const program = compileSimplePatch();
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      session.startFrame(100);
      const frame1 = session.finishFrame();
      const frame2 = session.finishFrame();
      expect(frame1).toBe(frame2);
    });
  });

  describe('runToPhaseEnd', () => {
    it('stops at phase-boundary when starting from phase1', () => {
      const program = compileSimplePatch();
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      session.startFrame(100);
      // pre-frame -> step into phase1
      session.stepNext();

      // Run to end of phase1
      const snap = session.runToPhaseEnd();
      expect(snap).not.toBeNull();
      // Should be at phase-boundary (which is a different phase than phase1)
      expect(snap!.phase).not.toBe('phase1');
    });

    it('stops at post-frame when starting from phase2', () => {
      const program = compileSimplePatch();
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      session.startFrame(100);

      // Advance to phase-boundary
      let snap = session.stepNext();
      while (snap && snap.phase !== 'phase-boundary') {
        snap = session.stepNext();
      }
      expect(snap).not.toBeNull();

      // Now we're at phase-boundary, step once to get into phase2 or post-frame
      snap = session.stepNext();
      if (snap && snap.phase === 'phase2') {
        // Run to end of phase2
        const boundary = session.runToPhaseEnd();
        // Should transition out of phase2
        expect(boundary === null || boundary.phase !== 'phase2').toBe(true);
      }
      // If no phase2 steps, that's fine too
    });
  });

  describe('breakpoints', () => {
    it('step-index breakpoint stops at correct index', () => {
      const program = compileSimplePatch();
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      // Find a valid step index from the schedule
      const schedule = program.schedule as ScheduleIR;
      const targetIndex = Math.min(2, schedule.steps.length - 1);

      session.addBreakpoint({ kind: 'step-index', index: targetIndex });
      session.startFrame(100);

      const snap = session.runToBreakpoint();
      expect(snap).not.toBeNull();
      expect(snap!.stepIndex).toBe(targetIndex);
      expect(session.mode).toBe('paused');
    });

    it('phase-boundary breakpoint stops at boundary', () => {
      const program = compileSimplePatch();
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      session.addBreakpoint({ kind: 'phase-boundary' });
      session.startFrame(100);

      const snap = session.runToBreakpoint();
      expect(snap).not.toBeNull();
      expect(snap!.phase).toBe('phase-boundary');
    });

    it('runToBreakpoint returns null when no breakpoint matches', () => {
      const program = compileSimplePatch();
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      // No breakpoints set — will run to completion
      session.startFrame(100);
      const snap = session.runToBreakpoint();
      expect(snap).toBeNull();
      expect(session.mode).toBe('completed');
    });

    it('clearBreakpoints removes all breakpoints', () => {
      const program = compileSimplePatch();
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      session.addBreakpoint({ kind: 'phase-boundary' });
      session.addBreakpoint({ kind: 'anomaly' });
      expect(session.breakpoints.length).toBe(2);

      session.clearBreakpoints();
      expect(session.breakpoints.length).toBe(0);
    });

    it('removeBreakpoint removes specific breakpoint', () => {
      const program = compileSimplePatch();
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      const bp: Breakpoint = { kind: 'phase-boundary' };
      session.addBreakpoint(bp);
      session.addBreakpoint({ kind: 'anomaly' });
      expect(session.breakpoints.length).toBe(2);

      session.removeBreakpoint(bp);
      expect(session.breakpoints.length).toBe(1);
      expect(session.breakpoints[0].kind).toBe('anomaly');
    });
  });

  describe('history', () => {
    it('accumulates snapshots as steps are executed', () => {
      const program = compileSimplePatch();
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      session.startFrame(100);
      expect(session.stepHistory.length).toBe(1); // pre-frame

      session.stepNext();
      expect(session.stepHistory.length).toBe(2);

      session.stepNext();
      expect(session.stepHistory.length).toBe(3);
    });
  });

  describe('dispose', () => {
    it('safely finishes frame on dispose', () => {
      const program = compileSimplePatch();
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      session.startFrame(100);
      // Step a few times
      session.stepNext();
      session.stepNext();

      // Dispose mid-frame — should complete gracefully
      session.dispose();
      expect(session.mode).toBe('idle');
      expect(session.currentSnapshot).toBeNull();
    });

    it('dispose on idle session is safe', () => {
      const program = compileSimplePatch();
      const state = createStateForProgram(program);
      const arena = getTestArena();
      const session = new StepDebugSession(program, state, arena);

      // Should not throw
      session.dispose();
      expect(session.mode).toBe('idle');
    });
  });
});
