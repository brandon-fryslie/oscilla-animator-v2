/**
 * RenderAssembler Tests
 *
 * Tests for render pass assembly module.
 */
import { describe, it, expect, vi } from 'vitest';
import { assembleRenderPass, assembleAllPasses, isRenderStep, type AssemblerContext } from '../RenderAssembler';
import type { StepRender, InstanceDecl, SigExpr } from '../../compiler/ir/types';
import type { RuntimeState } from '../RuntimeState';
import { createRuntimeState } from '../RuntimeState';
import type { ValueSlot, SigExprId } from '../../types';

// Create a minimal runtime state for testing
function createMockState(): RuntimeState {
  const state = createRuntimeState(100);
  return state;
}

// Create a minimal instance declaration
function createMockInstance(count: number): InstanceDecl {
  return {
    count,
    identityMode: 'none',
  } as InstanceDecl;
}

describe('RenderAssembler', () => {
  describe('isRenderStep', () => {
    it('returns true for render steps', () => {
      const step = { kind: 'render' };
      expect(isRenderStep(step)).toBe(true);
    });

    it('returns false for non-render steps', () => {
      expect(isRenderStep({ kind: 'evalSig' })).toBe(false);
      expect(isRenderStep({ kind: 'materialize' })).toBe(false);
      expect(isRenderStep({ kind: 'stateWrite' })).toBe(false);
    });
  });

  describe('assembleRenderPass', () => {
    it('returns null when instance not found', () => {
      const state = createMockState();
      const step: StepRender = {
        kind: 'render',
        instanceId: 'missing-instance',
        positionSlot: 1 as ValueSlot,
        colorSlot: 2 as ValueSlot,
      };

      const context: AssemblerContext = {
        signals: [],
        instances: new Map(),
        state,
      };

      // Suppress console.warn for this test
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = assembleRenderPass(step, context);
      warnSpy.mockRestore();

      expect(result).toBeNull();
    });

    it('returns null when instance count is 0', () => {
      const state = createMockState();
      const step: StepRender = {
        kind: 'render',
        instanceId: 'empty-instance',
        positionSlot: 1 as ValueSlot,
        colorSlot: 2 as ValueSlot,
      };

      const context: AssemblerContext = {
        signals: [],
        instances: new Map([['empty-instance', createMockInstance(0)]]),
        state,
      };

      const result = assembleRenderPass(step, context);
      expect(result).toBeNull();
    });

    it('throws when position buffer not found', () => {
      const state = createMockState();
      const step: StepRender = {
        kind: 'render',
        instanceId: 'test-instance',
        positionSlot: 1 as ValueSlot,
        colorSlot: 2 as ValueSlot,
      };

      const context: AssemblerContext = {
        signals: [],
        instances: new Map([['test-instance', createMockInstance(10)]]),
        state,
      };

      expect(() => assembleRenderPass(step, context)).toThrow(/Position buffer not found/);
    });

    it('throws when color buffer not found', () => {
      const state = createMockState();
      state.values.objects.set(1 as ValueSlot, new Float32Array(20)); // position buffer

      const step: StepRender = {
        kind: 'render',
        instanceId: 'test-instance',
        positionSlot: 1 as ValueSlot,
        colorSlot: 2 as ValueSlot,
      };

      const context: AssemblerContext = {
        signals: [],
        instances: new Map([['test-instance', createMockInstance(10)]]),
        state,
      };

      expect(() => assembleRenderPass(step, context)).toThrow(/Color buffer not found/);
    });

    it('assembles a render pass with default size and shape', () => {
      const state = createMockState();
      const positionBuffer = new Float32Array(20);
      const colorBuffer = new Uint8ClampedArray(40);
      state.values.objects.set(1 as ValueSlot, positionBuffer);
      state.values.objects.set(2 as ValueSlot, colorBuffer);

      const step: StepRender = {
        kind: 'render',
        instanceId: 'test-instance',
        positionSlot: 1 as ValueSlot,
        colorSlot: 2 as ValueSlot,
      };

      const context: AssemblerContext = {
        signals: [],
        instances: new Map([['test-instance', createMockInstance(10)]]),
        state,
      };

      const result = assembleRenderPass(step, context);

      expect(result).not.toBeNull();
      expect(result!.kind).toBe('instances2d');
      expect(result!.count).toBe(10);
      expect(result!.position).toBe(positionBuffer);
      expect(result!.color).toBe(colorBuffer);
      expect(result!.size).toBe(10); // default size
      expect(result!.shape).toBe(0); // default shape (circle)
    });

    it('assembles a render pass with slot-based size', () => {
      const state = createMockState();
      const positionBuffer = new Float32Array(20);
      const colorBuffer = new Uint8ClampedArray(40);
      const sizeBuffer = new Float32Array(10);
      state.values.objects.set(1 as ValueSlot, positionBuffer);
      state.values.objects.set(2 as ValueSlot, colorBuffer);
      state.values.objects.set(3 as ValueSlot, sizeBuffer);

      const step: StepRender = {
        kind: 'render',
        instanceId: 'test-instance',
        positionSlot: 1 as ValueSlot,
        colorSlot: 2 as ValueSlot,
        size: { k: 'slot', slot: 3 as ValueSlot },
      };

      const context: AssemblerContext = {
        signals: [],
        instances: new Map([['test-instance', createMockInstance(10)]]),
        state,
      };

      const result = assembleRenderPass(step, context);

      expect(result).not.toBeNull();
      expect(result!.size).toBe(sizeBuffer);
    });

    it('assembles a render pass with control points', () => {
      const state = createMockState();
      const positionBuffer = new Float32Array(20);
      const colorBuffer = new Uint8ClampedArray(40);
      const controlPointsBuffer = new Float32Array(60);
      state.values.objects.set(1 as ValueSlot, positionBuffer);
      state.values.objects.set(2 as ValueSlot, colorBuffer);
      state.values.objects.set(4 as ValueSlot, controlPointsBuffer);

      const step: StepRender = {
        kind: 'render',
        instanceId: 'test-instance',
        positionSlot: 1 as ValueSlot,
        colorSlot: 2 as ValueSlot,
        controlPoints: { k: 'slot', slot: 4 as ValueSlot },
      };

      const context: AssemblerContext = {
        signals: [],
        instances: new Map([['test-instance', createMockInstance(10)]]),
        state,
      };

      const result = assembleRenderPass(step, context);

      expect(result).not.toBeNull();
      expect(result!.controlPoints).toBe(controlPointsBuffer);
    });
  });

  describe('assembleAllPasses', () => {
    it('assembles multiple render passes', () => {
      const state = createMockState();
      // Set up buffers for two instances
      state.values.objects.set(1 as ValueSlot, new Float32Array(20));
      state.values.objects.set(2 as ValueSlot, new Uint8ClampedArray(40));
      state.values.objects.set(3 as ValueSlot, new Float32Array(40));
      state.values.objects.set(4 as ValueSlot, new Uint8ClampedArray(80));

      const steps: StepRender[] = [
        {
          kind: 'render',
          instanceId: 'instance-a',
          positionSlot: 1 as ValueSlot,
          colorSlot: 2 as ValueSlot,
        },
        {
          kind: 'render',
          instanceId: 'instance-b',
          positionSlot: 3 as ValueSlot,
          colorSlot: 4 as ValueSlot,
        },
      ];

      const context: AssemblerContext = {
        signals: [],
        instances: new Map([
          ['instance-a', createMockInstance(10)],
          ['instance-b', createMockInstance(20)],
        ]),
        state,
      };

      const result = assembleAllPasses(steps, context);

      expect(result).toHaveLength(2);
      expect(result[0].count).toBe(10);
      expect(result[1].count).toBe(20);
    });

    it('filters out failed passes', () => {
      const state = createMockState();
      state.values.objects.set(1 as ValueSlot, new Float32Array(20));
      state.values.objects.set(2 as ValueSlot, new Uint8ClampedArray(40));

      const steps: StepRender[] = [
        {
          kind: 'render',
          instanceId: 'valid-instance',
          positionSlot: 1 as ValueSlot,
          colorSlot: 2 as ValueSlot,
        },
        {
          kind: 'render',
          instanceId: 'empty-instance',
          positionSlot: 1 as ValueSlot,
          colorSlot: 2 as ValueSlot,
        },
      ];

      const context: AssemblerContext = {
        signals: [],
        instances: new Map([
          ['valid-instance', createMockInstance(10)],
          ['empty-instance', createMockInstance(0)], // count = 0, will be filtered
        ]),
        state,
      };

      const result = assembleAllPasses(steps, context);

      expect(result).toHaveLength(1);
      expect(result[0].count).toBe(10);
    });
  });
});
