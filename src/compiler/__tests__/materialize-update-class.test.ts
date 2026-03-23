import { describe, expect, it } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';

describe('materialize updateClass classification', () => {
  it('keeps materialize target slots out of FrameTime manifest class', () => {
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      const osc = b.addBlock('Oscillator');
      b.setConfig(osc, 'mode', 0);
      b.wire(time, 'phaseA', osc, 'phase');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const materializeTargets = new Set<number>();
    // [LAW:dataflow-not-control-flow] Derive write targets by traversing the
    // canonical schedule; step kind encodes behavior as data.
    for (const step of result.program.schedule.steps) {
      if (step.kind !== 'materialize') continue;
      materializeTargets.add(step.target as number);
    }

    expect(materializeTargets.size).toBeGreaterThan(0);

    for (const slot of materializeTargets) {
      const resource = result.program.memoryManifest.resources.find(
        (candidate) => candidate.id === `arena:slot:${slot}`,
      );
      expect(resource).toBeDefined();
      expect(resource?.updateClass).not.toBe('FrameTime');
    }
  });
});
