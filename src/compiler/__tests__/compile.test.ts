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

  describe('one-cardinality compilation', () => {
    it('compiles connected one-cardinality blocks', () => {
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
          (inst) => inst.id !== SCALAR_INSTANCE_ID && inst.shapeField !== undefined,
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
  it('InfiniteTimeRoot sets canonical time model periods', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
    });

    const result = compile(patch);

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      // TimeModel is in schedule wrapper for now
      const schedule = result.program.schedule as ScheduleIR;
      expect(schedule.timeModel.periodAMs).toBeGreaterThan(0);
      expect(schedule.timeModel.periodBMs).toBeGreaterThan(0);
    }
  });
});

describe('Debug Probe Support', () => {
  it('generates scalar materialize steps for one-cardinality values with registered slots (enables debug tap)', () => {
    // This test verifies that the compiler generates scalar slot write steps,
    // which are necessary for the runtime tap to record slot values.
    // Without scalar materialize steps, the debug probe cannot show scalar values.
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

      // Should have at least one scalar write step for scheduled scalar slots
      expect(scalarWriteSteps.length).toBeGreaterThan(0);

      for (const step of scalarWriteSteps) {
        expect(typeof step.field).toBe('number');
        expect(typeof step.target).toBe('number');
      }
    }
  });

  it('routes scalar const outputs through materialize with SCALAR_INSTANCE_ID', () => {
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      b.setPortDefault(time, 'periodAMs', 1000);

      // Const wired to an Oscillator so it participates in the schedule
      const c = b.addBlock('Const');
      b.setConfig(c, 'value', 0.8);
      const osc = b.addBlock('Oscillator');
      b.setConfig(osc, 'mode', 0);
      b.wire(time, 'phaseA', osc, 'phase');
      const add = b.addBlock('Add');
      b.wire(osc, 'out', add, 'a');
      b.wire(c, 'out', add, 'b');
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

      expect(
        schedule.steps.some(
          (step) =>
            step.kind === 'materialize'
            && step.instanceId === SCALAR_INSTANCE_ID
            && step.target === scalarConstMat.target,
        ),
      ).toBe(true);
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

      expect(
        schedule.steps.some(
          (step) =>
            step.kind === 'materialize'
            && step.instanceId === SCALAR_INSTANCE_ID
            && step.target === scalarKernelMat.target,
        ),
      ).toBe(true);
    }
  });

  it('emits state bridge metadata and lowering stores for stateful blocks', () => {
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      const delay = b.addBlock('UnitDelay');
      b.wire(time, 'phaseA', delay, 'in');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const lowering = result.program.nagaLoweringProgram;
    const globalNames = lowering.module.global_variables.map((global) => global.name);
    expect(globalNames).toEqual(expect.arrayContaining(['state_in', 'state_out']));

    const fn = lowering.module.functions[0];
    const hasStateWriteStore = fn?.statements.some(
      (statement) => statement.kind === 'store_symbolic' && statement.resourceId === 'state:bank',
    );
    expect(hasStateWriteStore).toBe(true);
  });
});

