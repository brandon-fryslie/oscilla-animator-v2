/**
 * Compiler Tests
 *
 * Tests verify BEHAVIOR, not implementation patterns.
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';

describe('compile', () => {
  describe('TimeRoot validation', () => {
    it('fails if no TimeRoot block', () => {
      const patch = buildPatch((b) => {
        b.addBlock('ConstFloat', { value: 42 });
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

      expect(result.kind).toBe('ok');
    });
  });

  describe('signal compilation', () => {
    it('compiles constant signals', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        b.addBlock('ConstFloat', { value: 42 });
      });

      const result = compile(patch);

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
        b.wire(time, 'phase', osc, 'phase');
      });

      const result = compile(patch);

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        // Should have oscillator output
        expect(result.program.signalExprs.nodes.length).toBeGreaterThan(0);
      }
    });
  });

  describe('domain compilation', () => {
    it('compiles grid domain', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        b.addBlock('GridDomain', { rows: 4, cols: 4 });
      });

      const result = compile(patch);

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        // Domains are in schedule wrapper for now
        const schedule = result.program.schedule as any;
        const domains = schedule.domains;
        expect(domains.size).toBe(1);
        const domain = [...domains.values()][0];
        expect(domain.count).toBe(16);
        expect(domain.elementIds.length).toBe(16);
      }
    });

    it('compiles domain N', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        b.addBlock('DomainN', { n: 100, seed: 42 });
      });

      const result = compile(patch);

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        // Domains are in schedule wrapper for now
        const schedule = result.program.schedule as any;
        const domains = schedule.domains;
        expect(domains.size).toBe(1);
        const domain = [...domains.values()][0];
        expect(domain.count).toBe(100);
      }
    });
  });

  describe('field compilation', () => {
    it('broadcasts signal to field', () => {
      const patch = buildPatch((b) => {
        const time = b.addBlock('InfiniteTimeRoot', {});
        const osc = b.addBlock('Oscillator', { waveform: 'sin' });
        const broadcast = b.addBlock('FieldBroadcast', {});

        b.wire(time, 'phase', osc, 'phase');
        b.wire(osc, 'out', broadcast, 'signal');
      });

      const result = compile(patch);

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
      const schedule = result.program.schedule as any;
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
      const schedule = result.program.schedule as any;
      expect(schedule.timeModel.kind).toBe('finite');
      if (schedule.timeModel.kind === 'finite') {
        expect(schedule.timeModel.durationMs).toBe(5000);
      }
    }
  });
});
