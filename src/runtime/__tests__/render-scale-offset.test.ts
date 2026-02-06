import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../../compiler/compile';
import type { ScheduleIR } from '../../compiler/backend/schedule-program';
import { createRuntimeState, executeFrame } from '..';
import { getTestArena } from './test-arena-helper';

describe('Render scale reads f64 by slotMeta.offset', () => {
  it('uses slotMeta.offset (not ValueSlot id) for RenderInstances2D.scale', () => {
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
      b.wire(colorSig, 'out', colorField, 'signal');

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

    const renderStep = schedule.steps.find((s: any) => s.kind === 'render');
    expect(renderStep).toBeTruthy();
    expect(renderStep.scale).toBeTruthy();

    const scaleExprId = (renderStep as any).scale.id as number;
    const scaleEvalStep = schedule.steps.find(
      (s: any) => s.kind === 'evalValue' && s.target?.storage === 'value' && s.expr === scaleExprId
    );
    expect(scaleEvalStep).toBeTruthy();

    const scaleSlot = (scaleEvalStep as any).target.slot as number;
    const scaleMeta = program.slotMeta.find((m: any) => m.slot === scaleSlot);
    expect(scaleMeta).toBeTruthy();

    const offset = (scaleMeta as any).offset as number;
    expect(offset).toBeTypeOf('number');
    expect(offset).not.toBe(scaleSlot);

    const state = createRuntimeState(
      program.slotMeta.length,
      schedule.stateSlotCount,
      0,
      0,
      program.valueExprs.nodes.length,
    );
    const arena = getTestArena();

    const frame = executeFrame(program, state, arena, 0);
    expect(frame.ops.length).toBeGreaterThan(0);

    const op0: any = frame.ops[0];
    expect(op0.instances.count).toBe(1);

    // Runtime evaluation writes scale to state.values.f64[slotMeta.offset].
    expect(state.values.f64[offset]).toBeCloseTo(SCALE, 6);

    // RenderAssembler must read by offset; the resulting screenRadius (ortho) should match SCALE.
    expect(op0.instances.size[0]).toBeCloseTo(state.values.f64[offset], 5);

    // This should generally differ, and is the regression we're guarding:
    // reading by ValueSlot id instead of slotMeta.offset.
    expect(op0.instances.size[0]).not.toBeCloseTo(state.values.f64[scaleSlot], 6);
  });
});

