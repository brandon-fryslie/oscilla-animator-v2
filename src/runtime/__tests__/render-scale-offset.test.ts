import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../../compiler/compile';
import type { ScheduleIR } from '../../compiler/backend/schedule-program';
import { createRuntimeState, executeFrame } from '..';
import { getTestArena } from './test-arena-helper';

describe('Render scale reads arena by slot descriptor offset', () => {
  it('uses arena descriptor offset (not ValueSlot id) for RenderInstances2D.scale', () => {
    const SCALE = 0.12345;

    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');

      const ellipse = b.addBlock('Ellipse');
      b.setPortDefault(ellipse, 'rx', 0.03);
      b.setPortDefault(ellipse, 'ry', 0.03);

      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 1);

      const layout = b.addBlock('GridLayoutUV');
      b.setPortDefault(layout, 'rows', 1);
      b.setPortDefault(layout, 'cols', 1);

      const render = b.addBlock('RenderInstances2D');

      // Color: signal -> field
      const colorSig = b.addBlock('Const');
      b.setConfig(colorSig, 'value', { r: 1, g: 0.5, b: 0.2, a: 1 });
      const colorField = b.addBlock('Broadcast');
      b.wire(colorSig, 'out', colorField, 'one');

      // Scale: explicit signal
      const scaleSig = b.addBlock('Const');
      b.setConfig(scaleSig, 'value', SCALE);
      b.wire(scaleSig, 'out', render, 'scale');

      b.wire(ellipse, 'shape', array, 'element');
      b.wire(array, 'elements', layout, 'elements');
      b.wire(layout, 'position', render, 'pos');
      b.wire(colorField, 'field', render, 'color');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind === 'error') return;

    const program = result.program;
    const schedule = program.schedule as ScheduleIR;

    const renderStep = schedule.steps.find((s): s is import('../../compiler/ir/types').StepRender => s.kind === 'render');
    expect(renderStep).toBeTruthy();
    expect(renderStep?.scale).toBeTruthy();

    const scaleExprId = (renderStep as any).scale.id as number;
    const scaleWriteStep = schedule.steps.find(
      (s: any) =>
        (s.kind === 'evalValue' &&
          s.target?.storage === 'value' &&
          s.expr === scaleExprId) ||
        (s.kind === 'materialize' && s.field === scaleExprId),
    );
    expect(scaleWriteStep).toBeTruthy();

    const scaleSlot =
      (scaleWriteStep as any).kind === 'materialize'
        ? ((scaleWriteStep as any).target as number)
        : ((scaleWriteStep as any).target.slot as number);
    const scaleMeta = program.slotMeta.find((m: any) => m.slot === scaleSlot);
    expect(scaleMeta).toBeTruthy();

    const arenaDesc = program.arenaLayout[scaleSlot];
    expect(arenaDesc).toBeTruthy();
    const arenaOffset = (arenaDesc as any).offset as number;
    expect(arenaOffset).toBeTypeOf('number');
    expect(arenaOffset).not.toBe(scaleSlot);

    const state = createRuntimeState(
      program.slotMeta.length,
      schedule.stateSlotCount,
      0,
      0,
      program.valueExprs.nodes.length,
      program.arenaTotalFloats,
    );
    const arena = getTestArena();

    const frame = executeFrame(program, state, arena, 0);
    expect(frame.ops.length).toBeGreaterThan(0);

    const op0: any = frame.ops[0];
    expect(op0.instances.count).toBe(1);

    // Runtime evaluation mirrors scale into state.arena at slot descriptor offset.
    expect(state.arena[arenaOffset]).toBeCloseTo(SCALE, 6);

    // RenderAssembler must read by arena descriptor offset; resulting screenRadius should match SCALE.
    expect(op0.instances.size[0]).toBeCloseTo(state.arena[arenaOffset], 5);

    // This should generally differ, and is the regression we're guarding:
    // reading by ValueSlot id instead of arena descriptor offset.
    expect(op0.instances.size[0]).not.toBeCloseTo(state.arena[scaleSlot], 6);
  });
});
