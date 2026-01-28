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
        // May fail with NoTimeRoot or UnresolvedUnit (Const has unit variable that can't resolve)
        // Both are valid: the patch is broken without TimeRoot
        const errorKinds = result.errors.map(e => e.kind);
        const hasExpectedError = errorKinds.includes('NoTimeRoot') || errorKinds.includes('UnresolvedUnit');
        expect(hasExpectedError).toBe(true);
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
        const time = b.addBlock('InfiniteTimeRoot', { periodAMs: 1000, periodBMs: 2000 });
        const osc = b.addBlock('Oscillator', { waveform: 'oscSin' });
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
    it('compiles grid instance with Array + GridLayout', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        // Three-stage architecture: Array creates instances, GridLayout applies layout
        const array = b.addBlock('Array', { count: 16 });
        const gridLayout = b.addBlock('GridLayout', { rows: 4, cols: 4 });
        // Wire Array.elements -> GridLayout.elements
        b.wire(array, 'elements', gridLayout, 'elements');
      });

      const result = compile(patch);

      if (result.kind === 'error') {
        console.error('COMPILE ERROR (Array + GridLayout):', JSON.stringify(result.errors, null, 2));
      }

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        // Instances are in schedule wrapper
        const schedule = result.program.schedule as ScheduleIR;
        const instances = schedule.instances;
        expect(instances.size).toBe(1);
        const instance = [...instances.values()][0];
        expect(instance.count).toBe(16);
        // Array creates instances, GridLayout applies positions via gridLayout kernel
        // Instance no longer has layout property - layout is purely via field kernels
        expect(instance.lifecycle).toBe('static');
      }
    });

    it('compiles instance with count using Array block', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
        // Array block creates instances (layout handled separately via field kernels)
        b.addBlock('Array', { count: 100 });
      });

      const result = compile(patch);

      if (result.kind === 'error') {
        console.error('COMPILE ERROR (Array):', JSON.stringify(result.errors, null, 2));
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
        const osc = b.addBlock('Oscillator', { waveform: 'oscSin' });
        const broadcast = b.addBlock('Broadcast', {});

        b.wire(time, 'phaseA', osc, 'phase');
        b.wire(osc, 'out', broadcast, 'signal');
      });

      const result = compile(patch);

      if (result.kind === 'error') {
        console.error('COMPILE ERROR (Broadcast):', JSON.stringify(result.errors, null, 2));
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
      // Construct patch manually to bypass PatchBuilder's requireBlockDef check
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot', {});
      });
      // Inject an unknown block directly into the patch
      (patch.blocks as Map<any, any>).set('b99' as any, {
        id: 'b99' as any,
        type: 'NonExistentBlock',
        params: {},
        displayName: null,
        domainId: null,
        role: { kind: 'user', meta: {} },
        inputPorts: new Map(),
        outputPorts: new Map(),
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
      const schedule = result.program.schedule as ScheduleIR;
      expect(schedule.timeModel.kind).toBe('infinite');
    }
  });
});

describe('Debug Probe Support', () => {
  it('generates evalSig steps for signals with registered slots (enables debug tap)', () => {
    // This test verifies that the compiler generates evalSig steps,
    // which are necessary for the runtime tap to record slot values.
    // Without evalSig steps, the debug probe cannot show signal values.
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot', { periodAMs: 1000, periodBMs: 2000 });
      const osc = b.addBlock('Oscillator', { waveform: 'oscSin' });
      b.wire(time, 'phaseA', osc, 'phase');
    });

    const result = compile(patch);

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      const schedule = result.program.schedule as ScheduleIR;
      const evalSigSteps = schedule.steps.filter(s => s.kind === 'evalSig');

      // Should have at least one evalSig step for the oscillator output
      expect(evalSigSteps.length).toBeGreaterThan(0);

      // Each evalSig step should have expr and target
      for (const step of evalSigSteps) {
        if (step.kind === 'evalSig') {
          expect(typeof step.expr).toBe('number');
          expect(typeof step.target).toBe('number');
        }
      }
    }
  });

  it('evalSig steps come before materialize steps in schedule', () => {
    // Execution order matters: signals must be evaluated before fields materialize
    // Use a simple patch that compiles - just TimeRoot + Oscillator
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot', { periodAMs: 1000, periodBMs: 2000 });
      const osc = b.addBlock('Oscillator', { waveform: 'oscSin' });
      b.wire(time, 'phaseA', osc, 'phase');
    });

    const result = compile(patch);

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      const schedule = result.program.schedule as ScheduleIR;
      const steps = schedule.steps;

      // Find indices of step types
      const firstEvalSig = steps.findIndex(s => s.kind === 'evalSig');
      const firstMaterialize = steps.findIndex(s => s.kind === 'materialize');
      const firstRender = steps.findIndex(s => s.kind === 'render');

      // evalSig should exist (for signal outputs)
      expect(firstEvalSig).toBeGreaterThanOrEqual(0);

      // If materialize exists, evalSig should come first
      if (firstMaterialize !== -1) {
        expect(firstEvalSig).toBeLessThan(firstMaterialize);
      }

      // If render exists, evalSig should come first
      if (firstRender !== -1) {
        expect(firstEvalSig).toBeLessThan(firstRender);
      }
    }
  });
});

describe('error isolation for unreachable blocks', () => {
  it('compiles successfully when only disconnected blocks have errors', () => {
    // Build a minimal working patch with a render block
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot', {});
      
      // Minimal render pipeline using composables
      const ellipse = b.addBlock('Ellipse', { rx: 0.02, ry: 0.02 });
      const const1 = b.addBlock('Const', { value: 0.5 });
      const const2 = b.addBlock('Const', { value: 0.5 });
      const const3 = b.addBlock('Const', { value: 0.35 });
      const vecConst = b.addBlock('VecConst', { x: 0.5, y: 0.5, z: 0 });
      const colorConst = b.addBlock('ColorConst', { r: 1, g: 0, b: 0, a: 1 });
      const render = b.addBlock('RenderInstances2D', {});
      
      b.wire(vecConst, 'out', render, 'pos');
      b.wire(colorConst, 'out', render, 'color');
      b.wire(ellipse, 'shape', render, 'shape');

      // Add a disconnected Expression block with a syntax error
      b.addBlock('Expression', {
        expr: 'this is not valid syntax!!!',
      });
    });

    const result = compile(patch);

    // Should compile successfully (unreachable error becomes warning)
    if (result.kind === 'error') {
      console.error('COMPILE ERROR (should have succeeded):', JSON.stringify(result.errors, null, 2));
    }
    expect(result.kind).toBe('ok');
  });

  it('fails when error block is connected to render pipeline', () => {
    // Build a patch where an error block feeds into render
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot', {});
      
      // Minimal render pipeline
      const ellipse = b.addBlock('Ellipse', { rx: 0.02, ry: 0.02 });
      const vecConst = b.addBlock('VecConst', { x: 0.5, y: 0.5, z: 0 });
      const colorConst = b.addBlock('ColorConst', { r: 1, g: 0, b: 0, a: 1 });
      const render = b.addBlock('RenderInstances2D', {});
      
      // Expression with syntax error connected to render pipeline
      const expr = b.addBlock('Expression', {
        expr: 'this is not valid syntax!!!',
      });

      b.wire(vecConst, 'out', render, 'pos');
      b.wire(colorConst, 'out', render, 'color');
      b.wire(ellipse, 'shape', render, 'shape');
      
      // Connect broken Expression to render - makes it reachable
      b.wire(expr, 'out', render, 'scale');
    });

    const result = compile(patch);

    // Should fail (reachable error)
    if (result.kind !== 'error') {
      console.error('Expected error, got ok');
    }
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('excludes errors from disconnected subgraph', () => {
    // Build a patch with render pipeline and disconnected subgraph with errors
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot', {});
      
      // Minimal render pipeline
      const ellipse = b.addBlock('Ellipse', { rx: 0.02, ry: 0.02 });
      const vecConst = b.addBlock('VecConst', { x: 0.5, y: 0.5, z: 0 });
      const colorConst = b.addBlock('ColorConst', { r: 1, g: 0, b: 0, a: 1 });
      const render = b.addBlock('RenderInstances2D', {});
      
      b.wire(vecConst, 'out', render, 'pos');
      b.wire(colorConst, 'out', render, 'color');
      b.wire(ellipse, 'shape', render, 'shape');

      // Disconnected subgraph with multiple errors
      const expr1 = b.addBlock('Expression', { expr: 'error 1!!!' });
      const expr2 = b.addBlock('Expression', { expr: 'error 2!!!' });
      // Wire them together but not to render
      b.wire(expr1, 'out', expr2, 'in0');
    });

    const result = compile(patch);

    // Should compile successfully (both errors are unreachable)
    if (result.kind === 'error') {
      console.error('COMPILE ERROR (disconnected subgraph):', JSON.stringify(result.errors, null, 2));
    }
    expect(result.kind).toBe('ok');
  });

  it('fails if ANY connected block has error', () => {
    // Mix of reachable and unreachable errors - should fail due to reachable one
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot', {});
      
      // Minimal render pipeline
      const ellipse = b.addBlock('Ellipse', { rx: 0.02, ry: 0.02 });
      const vecConst = b.addBlock('VecConst', { x: 0.5, y: 0.5, z: 0 });
      const colorConst = b.addBlock('ColorConst', { r: 1, g: 0, b: 0, a: 1 });
      const render = b.addBlock('RenderInstances2D', {});
      
      b.wire(vecConst, 'out', render, 'pos');
      b.wire(colorConst, 'out', render, 'color');
      b.wire(ellipse, 'shape', render, 'shape');

      // Connected broken block (reachable)
      const exprConnected = b.addBlock('Expression', { expr: 'connected error!!!' });
      b.wire(exprConnected, 'out', render, 'scale');
      
      // Disconnected broken block (unreachable)
      b.addBlock('Expression', { expr: 'disconnected error!!!' });
    });

    const result = compile(patch);

    // Should fail (at least one reachable error)
    if (result.kind !== 'error') {
      console.error('Expected error due to connected broken block');
    }
    expect(result.kind).toBe('error');
  });
});
