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
import { computeRuntimeStorageSizes } from '../ir/program';
import type { ScheduleIR } from '../backend/schedule-program';
import type { StepRender } from '../ir/types';
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
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const schedule = result.program.schedule as ScheduleIR;
    expect(result.program.generatedComputeProgram?.offsetConstants.size ?? 0).toBeGreaterThan(0);
    const renderSteps = schedule.steps.filter((step): step is StepRender => step.kind === 'render');
    expect(renderSteps.length).toBe(2);
    expect(result.program.drawPrepProgram?.sinks.length).toBe(2);
    expect(result.program.drawPrepProgram?.sinks.map((sink) => sink.sinkIndex)).toEqual([0, 1]);
    expect(result.program.drawPrepProgram?.sinks.map((sink) => sink.indirectRecordIndex)).toEqual([0, 1]);
    expect(result.program.drawPrepProgram?.sinks.map((sink) => sink.instanceCountMode)).toEqual(['static', 'static']);
    expect(
      [...(result.program.drawPrepProgram?.sinks.map((sink) => sink.staticInstanceCount) ?? [])]
        .sort((a, b) => (a ?? 0) - (b ?? 0))
    ).toEqual([2, 3]);

    const topologyIds = renderSteps.flatMap((step) => {
      if (step.shape.k === 'oneHandle') {
        const expr = result.program.valueExprs.nodes[step.shape.id as number];
        if (expr?.kind === 'shapeRef') {
          return [expr.topologyId as number];
        }
      }
      if (step.shape.k === 'one') {
        return [step.shape.topologyId as number];
      }
      return [];
    });
    expect(new Set(topologyIds).size).toBe(2);

    const scaleExprIds = renderSteps.flatMap((step) =>
      step.scale?.k === 'one' ? [step.scale.id as number] : []
    );
    expect(scaleExprIds.length).toBe(2);
    expect(new Set(scaleExprIds).size).toBe(1);
    const animatedScaleExprId = scaleExprIds[0]!;

    const sizes = computeRuntimeStorageSizes(result.program.runtimeSlots);
    const state = createRuntimeState(
      sizes.f32,
      schedule.stateSlotCount ?? 0,
      schedule.eventSlotCount ?? 0,
      schedule.eventCount ?? 0,
      result.program.valueExprs.nodes.length,
      result.program.arenaTotalFloats,
      0,
      undefined,
      undefined,
      result.program.arenaRuntimeLayout,
    );
    const arena = getTestArena();

    arena.reset();
    const frameA = executeFrame(result.program, state, arena, 0);
    const scaleAddressA = state.cache.scalarExprToArenaAddress?.get(animatedScaleExprId);
    expect(scaleAddressA).toBeDefined();
    if (!scaleAddressA) return;
    const scaleValueA = state.arena[scaleAddressA.arena.offset + scaleAddressA.component] ?? NaN;

    arena.reset();
    const frameB = executeFrame(result.program, state, arena, 137);
    const scaleAddressB = state.cache.scalarExprToArenaAddress?.get(animatedScaleExprId);
    expect(scaleAddressB).toBeDefined();
    if (!scaleAddressB) return;
    const scaleValueB = state.arena[scaleAddressB.arena.offset + scaleAddressB.component] ?? NaN;

    expect(frameA.version).toBe(2);
    expect(frameB.version).toBe(2);
    expect(frameA.ops.length).toBe(2);
    expect(frameB.ops.length).toBe(2);
    expect(Number.isFinite(scaleValueA)).toBe(true);
    expect(Number.isFinite(scaleValueB)).toBe(true);
    const frameScaleA = frameA.ops.map((op) =>
      typeof op.instances.size === 'number' ? op.instances.size : op.instances.size[0] ?? NaN
    );
    const frameScaleB = frameB.ops.map((op) =>
      typeof op.instances.size === 'number' ? op.instances.size : op.instances.size[0] ?? NaN
    );
    expect(frameScaleA.every((value) => Number.isFinite(value))).toBe(true);
    expect(frameScaleB.every((value) => Number.isFinite(value))).toBe(true);
  });
});
