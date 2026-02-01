/**
 * Steel Thread Test - Animated Particles
 *
 * Tests the minimal viable pipeline using three-stage block architecture:
 * Ellipse (shape) → Array (cardinality) → GridLayoutUV (operation) → Render
 *
 * Verifies: compile → createRuntimeState → executeFrame → RenderFrameIR with DrawOps.
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';
import type { ScheduleIR } from '../backend/schedule-program';
import { createRuntimeState, executeFrame } from '../../runtime';
import { getTestArena } from '../../runtime/__tests__/test-arena-helper';

/**
 * Helper: compile a patch and assert success.
 */
function compileOk(patch: ReturnType<typeof buildPatch>) {
  const result = compile(patch);
  if (result.kind === 'error') {
    throw new Error(
      `Compilation failed:\n${result.errors.map((e) => `  [${e.kind}] ${e.message}`).join('\n')}`
    );
  }
  return result.program;
}

/**
 * Helper: create runtime state sized for a compiled program.
 */
function stateFor(program: ReturnType<typeof compileOk>) {
  const schedule = program.schedule as ScheduleIR;
  return createRuntimeState(
    program.slotMeta.length,
    schedule.stateSlotCount,
    0, // eventSlotCount
    0, // eventExprCount
    program.valueExprs.nodes.length,
  );
}

describe('Steel Thread - Animated Particles', () => {
  it('compiles and renders a grid of ellipses', () => {
    // Three-stage: Ellipse (shape) → Array (cardinality) → GridLayoutUV (layout) → Render
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', { periodAMs: 1000, periodBMs: 2000 });
      const ellipse = b.addBlock('Ellipse', { rx: 0.03, ry: 0.03 });
      const array = b.addBlock('Array', { count: 4 });
      const layout = b.addBlock('GridLayoutUV', { rows: 2, cols: 2 });
      const render = b.addBlock('RenderInstances2D', {});

      // Color requires explicit Broadcast (signal→field)
      const colorSig = b.addBlock('Const', { value: { r: 1, g: 0.5, b: 0.2, a: 1 } });
      const colorField = b.addBlock('Broadcast', {});
      b.wire(colorSig, 'out', colorField, 'signal');

      b.wire(ellipse, 'shape', array, 'element');
      b.wire(array, 'elements', layout, 'elements');
      b.wire(layout, 'position', render, 'pos');
      b.wire(colorField, 'field', render, 'color');
      b.wire(ellipse, 'shape', render, 'shape');
    });

    // 1. Compile
    const program = compileOk(patch);

    // Basic structural checks
    expect(program.valueExprs.nodes.length).toBeGreaterThan(0);
    expect(program.slotMeta.length).toBeGreaterThan(0);
    const schedule = program.schedule as ScheduleIR;
    expect(schedule.steps.length).toBeGreaterThan(0);

    // 2. Execute frame at t=0
    const state = stateFor(program);
    const arena = getTestArena();
    const frame = executeFrame(program, state, arena, 0);

    // 3. Verify render output
    expect(frame.ops.length).toBeGreaterThan(0);

    // Should have a draw op with 4 instances
    const drawOp = frame.ops[0];
    expect(drawOp.instances.count).toBe(4);

    // Position buffer should be finite (no NaN/Infinity)
    for (let i = 0; i < drawOp.instances.position.length; i++) {
      expect(Number.isFinite(drawOp.instances.position[i])).toBe(true);
    }
  });

  it('compiles and renders a circle layout with oscillator', () => {
    // Three-stage with oscillator: Time → Osc, Ellipse → Array → CircleLayoutUV → Render
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', { periodAMs: 1000 });
      const ellipse = b.addBlock('Ellipse', { rx: 0.05, ry: 0.05 });
      const array = b.addBlock('Array', { count: 8 });
      const layout = b.addBlock('CircleLayoutUV', { radius: 0.3 });
      const render = b.addBlock('RenderInstances2D', {});

      // Color requires explicit Broadcast (signal→field)
      const colorSig = b.addBlock('Const', { value: { r: 0, g: 1, b: 0, a: 1 } });
      const colorField = b.addBlock('Broadcast', {});
      b.wire(colorSig, 'out', colorField, 'signal');

      b.wire(ellipse, 'shape', array, 'element');
      b.wire(array, 'elements', layout, 'elements');
      b.wire(layout, 'position', render, 'pos');
      b.wire(colorField, 'field', render, 'color');
      b.wire(ellipse, 'shape', render, 'shape');
    });

    // 1. Compile
    const program = compileOk(patch);

    // 2. Execute two frames at different times
    const state = stateFor(program);
    const arena = getTestArena();

    const frame0 = executeFrame(program, state, arena, 0);
    expect(frame0.ops.length).toBeGreaterThan(0);
    expect(frame0.ops[0].instances.count).toBe(8);

    // Execute at t=500ms (halfway through period)
    const frame500 = executeFrame(program, state, arena, 500);
    expect(frame500.ops.length).toBeGreaterThan(0);
    expect(frame500.ops[0].instances.count).toBe(8);

    // Positions should still be finite
    for (let i = 0; i < frame500.ops[0].instances.position.length; i++) {
      expect(Number.isFinite(frame500.ops[0].instances.position[i])).toBe(true);
    }
  });
});
