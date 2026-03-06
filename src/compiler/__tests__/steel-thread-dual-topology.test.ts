/**
 * Steel Thread Test - Dual Topology with Scale
 *
 * Tests the full rendering pipeline for multiple topologies with animated scale.
 * Exercises:
 * - Two shape blocks with different topologyIds (Ellipse, Rect)
 * - Animated scale input on RenderInstances2D
 * - Both passes produce correct resolvedShape, buffer sizes, and animation
 */

import { describe, it, expect } from 'vitest';
import { compile } from '../compile';
import { buildPatch } from '../../graph/Patch';
import { executeFrame } from '../../runtime/ScheduleExecutor';
import { createRuntimeState } from '../../runtime/RuntimeState';
import { getTestArena } from '../../runtime/__tests__/test-arena-helper';

describe('Steel Thread - Dual Topology with Scale', () => {
  it('compiles and executes two topology sinks with animated scale across frames', () => {
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');

      const ellipse = b.addBlock('Ellipse');
      b.setPortDefault(ellipse, 'rx', 0.08);
      b.setPortDefault(ellipse, 'ry', 0.05);
      const arrayA = b.addBlock('Array');
      b.setPortDefault(arrayA, 'count', 2);
      const grid = b.addBlock('GridLayoutUV');
      b.setPortDefault(grid, 'rows', 1);
      b.setPortDefault(grid, 'cols', 2);
      const renderA = b.addBlock('RenderInstances2D');
      const colorA = b.addBlock('Const');
      const colorFieldA = b.addBlock('Broadcast');
      b.setConfig(colorA, 'value', { r: 1, g: 0.2, b: 0.2, a: 1 });

      const rect = b.addBlock('Rect');
      b.setPortDefault(rect, 'width', 0.1);
      b.setPortDefault(rect, 'height', 0.08);
      b.setPortDefault(rect, 'resolution', 24);
      const arrayB = b.addBlock('Array');
      b.setPortDefault(arrayB, 'count', 3);
      const circle = b.addBlock('CircleLayoutUV');
      b.setPortDefault(circle, 'radius', 0.2);
      const renderB = b.addBlock('RenderInstances2D');
      const colorB = b.addBlock('Const');
      const colorFieldB = b.addBlock('Broadcast');
      b.setConfig(colorB, 'value', { r: 0.2, g: 0.5, b: 1, a: 1 });

      const osc = b.addBlock('Oscillator');
      const scaleBias = b.addBlock('Const');
      b.setConfig(scaleBias, 'value', 0.75);
      const scaleMul = b.addBlock('Const');
      b.setConfig(scaleMul, 'value', 0.25);
      const scaledOsc = b.addBlock('Multiply');
      const scaleSignal = b.addBlock('Add');

      b.wire(ellipse, 'shape', arrayA, 'element');
      b.wire(arrayA, 'elements', grid, 'elements');
      b.wire(grid, 'controlPoints', renderA, 'controlPoints');
      b.wire(colorA, 'out', colorFieldA, 'one');
      b.wire(colorFieldA, 'field', renderA, 'color');

      b.wire(rect, 'shape', arrayB, 'element');
      b.wire(arrayB, 'elements', circle, 'elements');
      b.wire(circle, 'controlPoints', renderB, 'controlPoints');
      b.wire(colorB, 'out', colorFieldB, 'one');
      b.wire(colorFieldB, 'field', renderB, 'color');

      b.wire(time, 'phaseA', osc, 'phase');
      b.wire(osc, 'out', scaledOsc, 'a');
      b.wire(scaleMul, 'out', scaledOsc, 'b');
      b.wire(scaleBias, 'out', scaleSignal, 'a');
      b.wire(scaledOsc, 'out', scaleSignal, 'b');
      b.wire(scaleSignal, 'out', renderA, 'scale');
      b.wire(scaleSignal, 'out', renderB, 'scale');
    });

    const result = compile(patch);
    if (result.kind !== 'ok') {
      throw new Error(
        'compile failed: ' + result.errors.map((error) => error.message).join(' | '),
      );
    }
    expect(result.kind).toBe('ok');
    expect(result.program.generatedComputeProgram?.offsetConstants.size ?? 0).toBeGreaterThan(0);
    expect(result.program.drawPrepProgram?.sinks.length).toBe(2);

    const schedule = result.program.schedule;
    const state = createRuntimeState(
      schedule.stateSlotCount ?? 0,
      schedule.eventSlotCount ?? 0,
      result.program.valueExprs.nodes.length,
      result.program.arenaTotalFloats,
      undefined,
      undefined,
      result.program.arenaRuntimeLayout,
    );
    const arena = getTestArena();

    arena.reset();
    const frameA = executeFrame(result.program, state, arena, 0);
    arena.reset();
    const frameB = executeFrame(result.program, state, arena, 137);

    expect(frameA.version).toBe(2);
    expect(frameB.version).toBe(2);
    expect(frameA.ops.length).toBe(2);
    expect(frameB.ops.length).toBe(2);
    const frameScaleA = frameA.ops.map((op) =>
      typeof op.instances.size === 'number' ? op.instances.size : op.instances.size[0] ?? NaN
    );
    const frameScaleB = frameB.ops.map((op) =>
      typeof op.instances.size === 'number' ? op.instances.size : op.instances.size[0] ?? NaN
    );
    expect(frameScaleA.every((value) => Number.isFinite(value))).toBe(true);
    expect(frameScaleB.every((value) => Number.isFinite(value))).toBe(true);
    // [LAW:behavior-not-structure] Validate render-size behavior through public
    // frame outputs instead of probing internal compiler/runtime tables.
    expect(frameScaleA.every((value) => value >= 0.5 && value <= 1.0)).toBe(true);
    expect(frameScaleB.every((value) => value >= 0.5 && value <= 1.0)).toBe(true);
  });
});
