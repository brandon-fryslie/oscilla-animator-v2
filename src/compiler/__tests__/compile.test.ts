/**
 * Compiler Tests
 *
 * Tests verify BEHAVIOR, not implementation patterns.
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';
import type { ScheduleIR } from '../backend/schedule-program';
import { SCALAR_INSTANCE_ID } from '../ir/Indices';
import type { StepMaterialize } from '../ir/types';

describe('compile', () => {
  describe('TimeRoot validation', () => {
    it('fails if no TimeRoot block', () => {
      const patch = buildPatch((b) => {
        const c = b.addBlock('Const');
        b.setConfig(c, 'value', 42);
      });

      const result = compile(patch);

      // A patch without TimeRoot must fail compilation
      expect(result.kind).toBe('error');
      if (result.kind === 'error') {
        // May fail with NoTimeRoot, UnresolvedUnit, or CompilationFailed (wrapping Pass3Error)
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it('fails if multiple TimeRoot blocks', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot');
        b.addBlock('InfiniteTimeRoot');
      });

      const result = compile(patch);

      expect(result.kind).toBe('error');
      if (result.kind === 'error') {
        expect(result.errors[0].code).toBe('MultipleTimeRoots');
      }
    });

    it('succeeds with exactly one TimeRoot', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot');
      });

      const result = compile(patch);

      if (result.kind === 'error') {
        console.error('COMPILE ERROR:', result.errors);
      }

      expect(result.kind).toBe('ok');
    });
  });

  describe('signal compilation', () => {
    it('compiles connected signal blocks', () => {
      const patch = buildPatch((b) => {
        const time = b.addBlock('InfiniteTimeRoot');
        b.setPortDefault(time, 'periodAMs', 1000);
        b.setPortDefault(time, 'periodBMs', 2000);
        const osc = b.addBlock('Oscillator');
        b.setConfig(osc, 'mode', 0);
        b.wire(time, 'phaseA', osc, 'phase');
      });

      const result = compile(patch);

      if (result.kind === 'error') {
        console.error('COMPILE ERROR (Oscillator):', JSON.stringify(result.errors, null, 2));
      }

      expect(result.kind).toBe('ok');
    });
  });

  describe('instance compilation', () => {
    it('compiles grid instance with Array + GridLayout', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot');
        // Three-stage architecture: Array creates instances, GridLayout applies layout
        const array = b.addBlock('Array');
        b.setPortDefault(array, 'count', 16);
        const gridLayout = b.addBlock('GridLayoutUV');
        b.setPortDefault(gridLayout, 'rows', 4);
        b.setPortDefault(gridLayout, 'cols', 4);
        // Wire Array.elements -> GridLayout.elements
        b.wire(array, 'elements', gridLayout, 'elements');
      });

      const result = compile(patch);

      if (result.kind === 'error') {
        console.error('COMPILE ERROR (Array + GridLayout):', JSON.stringify(result.errors, null, 2));
      }

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        // Instances are in schedule wrapper.
        // Filter out SCALAR_INSTANCE_ID (always-present sentinel for cardinality-one materialization).
        const schedule = result.program.schedule as ScheduleIR;
        const userInstances = [...schedule.instances.values()].filter(
          (inst) => inst.id !== SCALAR_INSTANCE_ID,
        );
        expect(userInstances.length).toBe(1);
        const instance = userInstances[0];
        expect(instance.count).toBe(16);
        // Array creates instances, GridLayout applies positions via gridLayout kernel
        // Instance no longer has layout property - layout is purely via field kernels
        expect(instance.lifecycle).toBe('static');
      }
    });

    it('compiles instance with count using Array block', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot');
        // Array block creates instances (layout handled separately via field kernels)
        const array = b.addBlock('Array');
        b.setPortDefault(array, 'count', 100);
      });

      const result = compile(patch);

      if (result.kind === 'error') {
        console.error('COMPILE ERROR (Array):', JSON.stringify(result.errors, null, 2));
      }

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        // Instances are in schedule wrapper.
        // Filter out SCALAR_INSTANCE_ID (always-present sentinel for cardinality-one materialization).
        const schedule = result.program.schedule as ScheduleIR;
        const userInstances = [...schedule.instances.values()].filter(
          (inst) => inst.id !== SCALAR_INSTANCE_ID,
        );
        expect(userInstances.length).toBe(1);
        const instance = userInstances[0];
        expect(instance.count).toBe(100);
      }
    });
  });

  describe('error handling', () => {
    it('reports unknown block types', () => {
      // Construct patch manually to bypass PatchBuilder's requireBlockDef check
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot');
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
        expect(result.errors.some((e) => e.code === 'UnknownBlockType')).toBe(
          true
        );
      }
    });
  });
});

describe('TimeModel', () => {
  it('InfiniteTimeRoot sets infinite time model', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
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
  it('generates scalar write steps for signals with registered slots (enables debug tap)', () => {
    // [LAW:one-source-of-truth] All scalar values route through StepMaterialize(SCALAR_INSTANCE_ID).
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      b.setPortDefault(time, 'periodAMs', 1000);
      b.setPortDefault(time, 'periodBMs', 2000);
      const osc = b.addBlock('Oscillator');
      b.setConfig(osc, 'mode', 0);
      b.wire(time, 'phaseA', osc, 'phase');
    });

    const result = compile(patch);

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      const schedule = result.program.schedule as ScheduleIR;
      const scalarWriteSteps = schedule.steps.filter(
        (s): s is StepMaterialize =>
          s.kind === 'materialize' && s.instanceId === SCALAR_INSTANCE_ID,
      );

      // Should have at least one scalar write step for scheduled signal slots
      expect(scalarWriteSteps.length).toBeGreaterThan(0);

      for (const step of scalarWriteSteps) {
        expect(typeof step.field).toBe('number');
        expect(typeof step.target).toBe('number');
      }
    }
  });

  it('routes scalar const outputs through materialize with SCALAR_INSTANCE_ID', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');

      const ellipse = b.addBlock('Ellipse');
      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 4);
      b.wire(ellipse, 'shape', array, 'element');

      const grid = b.addBlock('GridLayoutUV');
      b.setPortDefault(grid, 'rows', 2);
      b.setPortDefault(grid, 'cols', 2);
      b.wire(array, 'elements', grid, 'elements');

      const color = b.addBlock('Const');
      b.setConfig(color, 'value', { r: 1, g: 0.25, b: 0.1, a: 1 });
      const scale = b.addBlock('Const');
      b.setConfig(scale, 'value', 0.8);

      const render = b.addBlock('RenderInstances2D');
      b.wire(grid, 'position', render, 'pos');
      b.wire(color, 'out', render, 'color');
      b.wire(scale, 'out', render, 'scale');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      const schedule = result.program.schedule as ScheduleIR;
      type MaterializeStep = Extract<ScheduleIR['steps'][number], { kind: 'materialize' }>;
      const scalarConstMat = schedule.steps.find(
        (step): step is MaterializeStep =>
          step.kind === 'materialize' && step.instanceId === SCALAR_INSTANCE_ID,
      );
      expect(scalarConstMat).toBeDefined();
      if (!scalarConstMat) return;

      const expr = result.program.valueExprs.nodes[scalarConstMat.field as number];
      expect(expr?.kind).toBe('const');
      if (expr?.kind === 'const') {
        expect(['float', 'int', 'bool']).toContain(expr.type.payload.kind);
      }

      const hasEvalValueForSameSlot = schedule.steps.some(
        (step) =>
          step.kind === 'evalValue' &&
          step.target.storage === 'value' &&
          step.target.slot === scalarConstMat.target,
      );
      expect(hasEvalValueForSameSlot).toBe(false);
    }
  });

  it('routes scalar kernel outputs through materialize with SCALAR_INSTANCE_ID', () => {
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      b.setPortDefault(time, 'periodAMs', 2000);
      b.setPortDefault(time, 'periodBMs', 4000);

      const osc = b.addBlock('Oscillator');
      b.setConfig(osc, 'mode', 0);
      b.wire(time, 'phaseA', osc, 'phase');

      const ellipse = b.addBlock('Ellipse');
      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 4);
      b.wire(ellipse, 'shape', array, 'element');
      const grid = b.addBlock('GridLayoutUV');
      b.setPortDefault(grid, 'rows', 2);
      b.setPortDefault(grid, 'cols', 2);
      b.wire(array, 'elements', grid, 'elements');
      const color = b.addBlock('Const');
      b.setConfig(color, 'value', { r: 1, g: 0.5, b: 0.2, a: 1 });
      const render = b.addBlock('RenderInstances2D');
      b.wire(grid, 'position', render, 'pos');
      b.wire(color, 'out', render, 'color');
      b.wire(osc, 'out', render, 'scale');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      const schedule = result.program.schedule as ScheduleIR;
      type MaterializeStep = Extract<ScheduleIR['steps'][number], { kind: 'materialize' }>;
      const scalarKernelMat = schedule.steps.find((step): step is MaterializeStep => {
        if (step.kind !== 'materialize' || step.instanceId !== SCALAR_INSTANCE_ID) {
          return false;
        }
        const expr = result.program.valueExprs.nodes[step.field as number];
        return expr?.kind === 'kernel';
      });

      expect(scalarKernelMat).toBeDefined();
      if (!scalarKernelMat) return;

      const hasEvalValueForSameSlot = schedule.steps.some(
        (step) =>
          step.kind === 'evalValue' &&
          step.target.storage === 'value' &&
          step.target.slot === scalarKernelMat.target,
      );
      expect(hasEvalValueForSameSlot).toBe(false);
    }
  });

  it('scalar write steps execute before render steps', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      const ellipse = b.addBlock('Ellipse');
      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 2);
      b.wire(ellipse, 'shape', array, 'element');
      const grid = b.addBlock('GridLayoutUV');
      b.setPortDefault(grid, 'rows', 1);
      b.setPortDefault(grid, 'cols', 2);
      b.wire(array, 'elements', grid, 'elements');
      const color = b.addBlock('Const');
      b.setConfig(color, 'value', { r: 1, g: 0.5, b: 0.2, a: 1 });
      const render = b.addBlock('RenderInstances2D');
      b.wire(grid, 'position', render, 'pos');
      b.wire(color, 'out', render, 'color');
    });

    const result = compile(patch);

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      const schedule = result.program.schedule as ScheduleIR;
      const steps = schedule.steps;
      const firstRender = steps.findIndex(s => s.kind === 'render');
      // [LAW:one-source-of-truth] All scalar values go through StepMaterialize(SCALAR_INSTANCE_ID).
      const scalarWriteIndices = steps
        .map((s, i) =>
          s.kind === 'materialize' && s.instanceId === SCALAR_INSTANCE_ID ? i : -1,
        )
        .filter((i) => i >= 0);
      expect(scalarWriteIndices.length).toBeGreaterThan(0);
      if (firstRender !== -1) {
        expect(Math.max(...scalarWriteIndices)).toBeLessThan(firstRender);
      }
    }
  });
});

describe('error isolation for unreachable blocks', () => {
  it('compiles successfully when only disconnected blocks have errors', () => {
    // Build a patch with a working render pipeline and a disconnected Expression with an error.
    // The Expression is not connected to any render block, so its error should be isolated.
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');

      // Working render pipeline
      const arr = b.addBlock('Array');
      b.setPortDefault(arr, 'count', 4);
      const ellipse = b.addBlock('Ellipse');
      b.wire(ellipse, 'shape', arr, 'element'); // Shape wired to Array
      const grid = b.addBlock('GridLayoutUV');
      b.wire(arr, 'elements', grid, 'elements');
      const color = b.addBlock('Const');
      b.setConfig(color, 'value', { r: 1, g: 0, b: 0, a: 1 });
      const render = b.addBlock('RenderInstances2D');
      b.wire(grid, 'position', render, 'pos');
      // Shape port removed - automatically looked up from instance
      b.wire(color, 'out', render, 'color');

      // Disconnected Expression block with a syntax error (not wired to render)
      const expr = b.addBlock('Expression');
      b.setConfig(expr, 'expression', 'this is not valid +++');  // Syntax error
    });

    const result = compile(patch);

    // Should compile successfully (unreachable error becomes warning)
    if (result.kind === 'error') {
      console.error('COMPILE ERROR (should have succeeded):', JSON.stringify(result.errors, null, 2));
    }
    expect(result.kind).toBe('ok');
  });

  it('excludes errors from disconnected subgraph', () => {
    // Build a patch with a working render pipeline and a disconnected subgraph with errors.
    // The disconnected subgraph is not connected to any render block.
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');

      // Working render pipeline
      const arr = b.addBlock('Array');
      b.setPortDefault(arr, 'count', 4);
      const ellipse = b.addBlock('Ellipse');
      b.wire(ellipse, 'shape', arr, 'element'); // Shape wired to Array
      const grid = b.addBlock('GridLayoutUV');
      b.wire(arr, 'elements', grid, 'elements');
      const color = b.addBlock('Const');
      b.setConfig(color, 'value', { r: 1, g: 0, b: 0, a: 1 });
      const render = b.addBlock('RenderInstances2D');
      b.wire(grid, 'position', render, 'pos');
      // Shape port removed - automatically looked up from instance
      b.wire(color, 'out', render, 'color');

      // Disconnected subgraph with multiple errors (not wired to render)
      const expr1 = b.addBlock('Expression', { displayName: 'Expr1' });
      b.setConfig(expr1, 'expression', 'error 1 +++');
      const expr2 = b.addBlock('Expression', { displayName: 'Expr2' });
      b.setConfig(expr2, 'expression', 'error 2 +++');
      // Wire them together but not to any render block
      b.wireCollect(expr1, 'out', expr2, 'refs', 'x');
    });

    const result = compile(patch);

    // Should compile successfully (both errors are unreachable)
    if (result.kind === 'error') {
      console.error('COMPILE ERROR (disconnected subgraph):', JSON.stringify(result.errors, null, 2));
    }
    expect(result.kind).toBe('ok');
  });

  // [LAW:behavior-not-structure] Test result.warnings, not mock event emission.
  it('returns warnings for unreachable block errors', () => {
    // Build a patch with a working render pipeline and a disconnected Expression with an error.
    // The Expression is wired to time (so it compiles) but NOT to any render block.
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot', { displayName: 'Time' });

      // Working render pipeline
      const arr = b.addBlock('Array');
      b.setPortDefault(arr, 'count', 4);
      const ellipse = b.addBlock('Ellipse');
      b.wire(ellipse, 'shape', arr, 'element'); // Shape wired to Array
      const grid = b.addBlock('GridLayoutUV');
      b.wire(arr, 'elements', grid, 'elements');
      const color = b.addBlock('Const');
      b.setConfig(color, 'value', { r: 1, g: 0, b: 0, a: 1 });
      const render = b.addBlock('RenderInstances2D');
      b.wire(grid, 'position', render, 'pos');
      b.wire(color, 'out', render, 'color');

      // Expression block with a syntax error — wired to time but NOT to render
      const expr = b.addBlock('Expression', { displayName: 'TestExpr' });
      b.setConfig(expr, 'expression', 't +');  // Incomplete expression - guaranteed syntax error
      b.wireCollect(time, 'tMs', expr, 'refs', 't');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');

    if (result.kind === 'ok') {
      const unreachable = result.warnings.find(w => w.code === 'W_BLOCK_UNREACHABLE_ERROR');
      expect(unreachable).toBeDefined();
      expect(unreachable!.message).toContain('not connected to render pipeline');
    }
  });

  it('fails compilation when a block connected to render has an error', () => {
    // AC3/bead 2kl7: If a block connected to render has an error, compilation
    // must fail — it must NOT be isolated as a warning.
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot', { displayName: 'Time' });
      b.setPortDefault(time, 'periodAMs', 1000);

      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 10);

      const ellipse = b.addBlock('Ellipse');
      b.setPortDefault(ellipse, 'rx', 0.05);
      b.setPortDefault(ellipse, 'ry', 0.05);

      const gridLayout = b.addBlock('GridLayoutUV');
      b.setPortDefault(gridLayout, 'rows', 2);
      b.setPortDefault(gridLayout, 'cols', 5);
      b.wire(array, 'elements', gridLayout, 'elements');

      // Expression block with a syntax error — wired to render pipeline
      const expr = b.addBlock('Expression', { displayName: 'ColorExpr' });
      b.setConfig(expr, 'expression', 'invalid syntax +++');
      b.wireCollect(time, 'tMs', expr, 'refs', 't');

      const render = b.addBlock('RenderInstances2D');
      b.wire(gridLayout, 'position', render, 'pos');
      b.wire(ellipse, 'shape', render, 'shape');
      b.wire(expr, 'out', render, 'color');  // Connected to render — error must NOT be isolated
    });

    const result = compile(patch);

    if (result.kind !== 'error') {
      throw new Error('Expected compilation to fail but it succeeded');
    }
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('mixed cardinality (one→many broadcast)', () => {
  it('allows one-cardinality Const wired directly to RenderInstances2D.color (oneOrMany acceptance, golden-spiral pattern)', () => {
    // Reproduces the golden-spiral demo: Const (one) → RenderInstances2D.color (many).
    // RenderInstances2D color input declares oneOrMany acceptance, so this compiles without adapter insertion.
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      b.setPortDefault(time, 'periodAMs', 4000);
      b.setPortDefault(time, 'periodBMs', 120000);
      const ellipse = b.addBlock('Ellipse');
      b.setPortDefault(ellipse, 'rx', 0.02);
      b.setPortDefault(ellipse, 'ry', 0.02);
      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 100);
      b.wire(ellipse, 'shape', array, 'element');

      const circleLayout = b.addBlock('CircleLayoutUV');
      b.setPortDefault(circleLayout, 'radius', 0.35);
      b.wire(array, 'elements', circleLayout, 'elements');

      const color = b.addBlock('Const');
      b.setConfig(color, 'value', { r: 0.9, g: 0.7, b: 0.5, a: 1.0 });

      const render = b.addBlock('RenderInstances2D');
      b.wire(circleLayout, 'position', render, 'pos');
      b.wire(color, 'out', render, 'color');
      // Shape port removed - automatically looked up from instance
    });

    const result = compile(patch);
    if (result.kind === 'error') {
      throw new Error(
        `Expected compilation to succeed, got errors:\n${result.errors.map(e => `  [${e.code}] ${e.message}`).join('\n')}`
      );
    }
    expect(result.kind).toBe('ok');
  });
});
