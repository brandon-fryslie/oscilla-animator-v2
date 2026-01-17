/**
 * Compiler Tests
 *
 * Tests verify BEHAVIOR, not implementation patterns.
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';
import type { ScheduleIR } from '../passes-v2/pass7-schedule';

describe('compile', () => {
  describe('TimeRoot validation', () => {
    it('fails if no TimeRoot block', () => {
      const patch = buildPatch((b) => {
        b.addBlock('Const', { value: 42 });
      });

      const result = compile(patch);

      expect(result.kind).toBe('error');
      if (result.kind === 'error') {
        expect(result.errors[0].kind).toBe('NoTimeRoot');
      }
    });

    it('fails if multiple TimeRoot blocks', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        b.addBlock('InfiniteTimeRoot', {});
      });

      const result = compile(patch);

      expect(result.kind).toBe('error');
      if (result.kind === 'error') {
        expect(result.errors[0].kind).toBe('MultipleTimeRoots');
      }
    });

    it('succeeds with exactly one TimeRoot', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
      });

      const result = compile(patch);

      if (result.kind === 'error') {
        console.error('COMPILE ERROR:', result.errors);
      }

      expect(result.kind).toBe('ok');
    });
  });

  describe('signal compilation', () => {
    it('compiles constant signals', () => {
      // Const block must be wired to something so its type can be inferred
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        const c = b.addBlock('Const', { value: 42 });
        const add = b.addBlock('Add', {});
        b.wire(c, 'out', add, 'a');
        b.wire(c, 'out', add, 'b');
      });

      const result = compile(patch);

      if (result.kind === 'error') {
        console.error('COMPILE ERROR (Const):', JSON.stringify(result.errors, null, 2));
      }

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        // Should have signal expressions in dense array
        expect(result.program.signalExprs.nodes.length).toBeGreaterThan(0);
      }
    });

    it('compiles connected signal blocks', () => {
      const patch = buildPatch((b) => {
        const time = b.addBlock('InfiniteTimeRoot', { periodMs: 1000 });
        const osc = b.addBlock('Oscillator', { waveform: 'sin' });
        b.wire(time, 'phaseA', osc, 'phase');
      });

      const result = compile(patch);

      if (result.kind === 'error') {
        console.error('COMPILE ERROR (Oscillator):', JSON.stringify(result.errors, null, 2));
      }

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        // Should have oscillator output
        expect(result.program.signalExprs.nodes.length).toBeGreaterThan(0);
      }
    });
  });

  describe('instance compilation', () => {
    it('compiles grid instance', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        b.addBlock('GridDomain', { rows: 4, cols: 4 });
      });

      const result = compile(patch);

      if (result.kind === 'error') {
        console.error('COMPILE ERROR (GridDomain):', JSON.stringify(result.errors, null, 2));
      }

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        // Instances are in schedule wrapper
        const schedule = result.program.schedule as ScheduleIR;
        const instances = schedule.instances;
        expect(instances.size).toBe(1);
        const instance = [...instances.values()][0];
        expect(instance.count).toBe(16);
        expect(instance.layout.kind).toBe('grid');
      }
    });

    it('compiles instance N', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        b.addBlock('DomainN', { n: 100, seed: 42 });
      });

      const result = compile(patch);

      if (result.kind === 'error') {
        console.error('COMPILE ERROR (DomainN):', JSON.stringify(result.errors, null, 2));
      }

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        // Instances are in schedule wrapper
        const schedule = result.program.schedule as ScheduleIR;
        const instances = schedule.instances;
        expect(instances.size).toBe(1);
        const instance = [...instances.values()][0];
        expect(instance.count).toBe(100);
      }
    });
  });

  describe('field compilation', () => {
    it('broadcasts signal to field', () => {
      const patch = buildPatch((b) => {
        const time = b.addBlock('InfiniteTimeRoot', {});
        const osc = b.addBlock('Oscillator', { waveform: 'sin' });
        const broadcast = b.addBlock('FieldBroadcast', {});

        b.wire(time, 'phaseA', osc, 'phase');
        b.wire(osc, 'out', broadcast, 'signal');
      });

      const result = compile(patch);

      if (result.kind === 'error') {
        console.error('COMPILE ERROR (FieldBroadcast):', JSON.stringify(result.errors, null, 2));
      }

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        // Should have field expressions in dense array
        expect(result.program.fieldExprs.nodes.length).toBeGreaterThan(0);
      }
    });
  });

  describe('error handling', () => {
    it('reports unknown block types', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        b.addBlock('NonExistentBlock', {});
      });

      const result = compile(patch);

      if (result.kind === 'error') {
        console.error('COMPILE ERROR (NonExistentBlock):', JSON.stringify(result.errors, null, 2));
      }

      expect(result.kind).toBe('error');
      if (result.kind === 'error') {
        expect(result.errors.some((e) => e.kind === 'UnknownBlockType')).toBe(
          true
        );
      }
    });
  });
});

describe('TimeModel', () => {
  it('InfiniteTimeRoot sets infinite time model', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', {});
    });

    const result = compile(patch);

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      // TimeModel is in schedule wrapper for now
      const schedule = result.program.schedule as ScheduleIR;
      expect(schedule.timeModel.kind).toBe('infinite');
    }
  });

  it('FiniteTimeRoot sets finite time model with duration', () => {
    const patch = buildPatch((b) => {
      b.addBlock('FiniteTimeRoot', { durationMs: 5000 });
    });

    const result = compile(patch);

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      // TimeModel is in schedule wrapper for now
      const schedule = result.program.schedule as ScheduleIR;
      expect(schedule.timeModel.kind).toBe('finite');
      if (schedule.timeModel.kind === 'finite') {
        expect(schedule.timeModel.durationMs).toBe(5000);
      }
    }
  });
});
