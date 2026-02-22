import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../../compiler/compile';
import type { ScheduleIR } from '../../compiler/backend/schedule-program';
import type { StepFieldStateWrite, StepStateWrite } from '../../compiler/ir/types';

function requireOk(result: ReturnType<typeof compile>) {
  if (result.kind !== 'ok') {
    throw new Error(`Compile failed:\n${result.errors.map((e) => `${e.code}: ${e.message}`).join('\n')}`);
  }
  expect(result.kind).toBe('ok');
  return result.program.schedule as ScheduleIR;
}

describe('stateful storage planning', () => {
  it('uses field state for many-cardinality UnitDelay', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      const ellipse = b.addBlock('Ellipse');
      b.setPortDefault(ellipse, 'resolution', 8);
      const delay = b.addBlock('UnitDelay');
      const makeShape = b.addBlock('MakeShape2D');
      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 4);
      const layout = b.addBlock('GridLayoutUV');
      b.setPortDefault(layout, 'rows', 2);
      b.setPortDefault(layout, 'cols', 2);
      const render = b.addBlock('RenderInstances2D');

      b.wire(ellipse, 'controlPoints', delay, 'in');
      b.wire(delay, 'out', makeShape, 'controlPoints');
      b.wire(makeShape, 'shape', array, 'element');
      b.wire(array, 'elements', layout, 'elements');
      b.wire(layout, 'position', render, 'pos');
    });

    const schedule = requireOk(compile(patch));
    const mapping = schedule.stateMappings.find((m) => m.stateId.endsWith(':delay'));
    expect(mapping).toBeDefined();
    if (!mapping) return;

    expect(mapping.instanceId).toBeDefined();
    expect(mapping.laneCount).toBe(8);
    expect(mapping.stride).toBe(2);

    const writes = schedule.steps.filter((s): s is StepFieldStateWrite => s.kind === 'fieldStateWrite');
    expect(writes.some((w) => w.stateSlot === mapping.slotStart)).toBe(true);
  });

  it('uses scalar state for one-cardinality UnitDelay', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      const c = b.addBlock('Const');
      b.setConfig(c, 'value', 1);
      const delay = b.addBlock('UnitDelay');
      b.wire(c, 'out', delay, 'in');
    });

    const schedule = requireOk(compile(patch));
    const mapping = schedule.stateMappings.find((m) => m.stateId.endsWith(':delay'));
    expect(mapping).toBeDefined();
    if (!mapping) return;

    expect(mapping.instanceId).toBeUndefined();
    expect(mapping.laneCount).toBe(1);
    expect(mapping.stride).toBe(1);

    const writes = schedule.steps.filter((s): s is StepStateWrite => s.kind === 'stateWrite');
    expect(writes.some((w) => w.stateSlot === mapping.slotStart)).toBe(true);
  });
});
