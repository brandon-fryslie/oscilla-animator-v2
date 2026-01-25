/**
 * RenderAssembler Tests
 *
 * Tests for render pass assembly module.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  assembleDrawPathInstancesOp,
  assembleRenderFrame,
  isRenderStep,
  type AssemblerContext,
} from '../RenderAssembler';
import type { StepRender, InstanceDecl, SigExpr } from '../../compiler/ir/types';
import type { SignalType } from '../../core/canonical-types';
import { signalType, extentDefault } from '../../core/canonical-types';
import type { RuntimeState } from '../RuntimeState';
import { createRuntimeState } from '../RuntimeState';
import type { ValueSlot, SigExprId } from '../../types';
import { registerDynamicTopology, TOPOLOGY_ID_ELLIPSE } from '../../shapes/registry';
import type { RenderSpace2D } from '../../shapes/types';
import { PathVerb } from '../../shapes/types';
import { DEFAULT_CAMERA } from '../CameraResolver';

// Helper to create a scalar signal type
const SCALAR_TYPE: SignalType = signalType('float');

// Create a minimal runtime state for testing
function createMockState(): RuntimeState {
  const state = createRuntimeState(100);
  // Set effective time so signal evaluation works
  state.time = {
    tAbsMs: 0,
    tMs: 0,
    dt: 0,
    phaseA: 0,
    phaseB: 0,
    pulse: 0,
    palette: { r: 1, g: 1, b: 1, a: 1 },
    energy: 0.5,
  };
  return state;
}

// Create a minimal instance declaration
function createMockInstance(count: number): InstanceDecl {
  return {
    count,
    identityMode: 'none',
  } as InstanceDecl;
}

// Register a test path topology for v2 tests (id assigned by registry)
const TEST_PENTAGON_ID = registerDynamicTopology({
  params: [
    { name: 'radiusX', type: 'float', default: 0.02 },
    { name: 'radiusY', type: 'float', default: 0.02 },
    { name: 'closed', type: 'float', default: 1 },
  ],
  render: (ctx: CanvasRenderingContext2D, p: Record<string, number>, space: RenderSpace2D) => {
    // Minimal render implementation for testing
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.lineTo(0.95, -0.31);
    ctx.lineTo(0.59, 0.81);
    ctx.lineTo(-0.59, 0.81);
    ctx.lineTo(-0.95, -0.31);
    ctx.closePath();
    ctx.fill();
  },
  verbs: [PathVerb.MOVE, PathVerb.LINE, PathVerb.LINE, PathVerb.LINE, PathVerb.LINE, PathVerb.CLOSE],
  pointsPerVerb: [1, 1, 1, 1, 1, 0],
  totalControlPoints: 5,
  closed: true,
}, 'test-pentagon');

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

  describe('assembleDrawPathInstancesOp (v2)', () => {
    it('returns empty array when instance not found', () => {
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
    resolvedCamera: DEFAULT_CAMERA,
      };

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = assembleDrawPathInstancesOp(step, context);
      warnSpy.mockRestore();

      expect(result).toEqual([]);
    });

    it('returns empty array when instance count is 0', () => {
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
    resolvedCamera: DEFAULT_CAMERA,
      };

      const result = assembleDrawPathInstancesOp(step, context);
      expect(result).toEqual([]);
    });

    it('returns DrawPrimitiveInstancesOp for primitive topologies', () => {
      const state = createMockState();
      const positionBuffer = new Float32Array(20);
      const colorBuffer = new Uint8ClampedArray(40);
      state.values.objects.set(1 as ValueSlot, positionBuffer);
      state.values.objects.set(2 as ValueSlot, colorBuffer);

      const signals: SigExpr[] = [
        { kind: 'const', value: 1.0, type: SCALAR_TYPE },  // scale
        { kind: 'const', value: 0.02, type: SCALAR_TYPE }, // rx param
        { kind: 'const', value: 0.02, type: SCALAR_TYPE }, // ry param
      ];

      const step: StepRender = {
        kind: 'render',
        instanceId: 'test-instance',
        positionSlot: 1 as ValueSlot,
        colorSlot: 2 as ValueSlot,
        scale: { k: 'sig', id: 0 as SigExprId },
        shape: { k: 'sig', topologyId: TOPOLOGY_ID_ELLIPSE, paramSignals: [1 as SigExprId, 2 as SigExprId] },
      };

      const context: AssemblerContext = {
        signals,
        instances: new Map([['test-instance', createMockInstance(10)]]),
        state,
    resolvedCamera: DEFAULT_CAMERA,
      };

      const result = assembleDrawPathInstancesOp(step, context);
      // Primitive topologies now produce DrawPrimitiveInstancesOp
      expect(result).toHaveLength(1);
      expect(result[0].kind).toBe('drawPrimitiveInstances');
    });

    it('assembles DrawPathInstancesOp for path topologies', () => {
      const state = createMockState();
      const positionBuffer = new Float32Array([0.1, 0.2, 0.3, 0.4]); // 2 instances
      const colorBuffer = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]); // 2 instances
      const controlPointsBuffer = new Float32Array([
        0, 1,    // point 0
        0.95, 0.31,  // point 1
        0.59, -0.81, // point 2
        -0.59, -0.81, // point 3
        -0.95, 0.31,  // point 4
      ]); // 5 points for pentagon

      state.values.objects.set(1 as ValueSlot, positionBuffer);
      state.values.objects.set(2 as ValueSlot, colorBuffer);
      state.values.objects.set(3 as ValueSlot, controlPointsBuffer);

      const signals: SigExpr[] = [
        { kind: 'const', value: 2.5, type: SCALAR_TYPE },  // scale
        { kind: 'const', value: 0.02, type: SCALAR_TYPE }, // radiusX param
        { kind: 'const', value: 0.02, type: SCALAR_TYPE }, // radiusY param
        { kind: 'const', value: 1, type: SCALAR_TYPE },    // closed param
      ];

      const step: StepRender = {
        kind: 'render',
        instanceId: 'test-instance',
        positionSlot: 1 as ValueSlot,
        colorSlot: 2 as ValueSlot,
        scale: { k: 'sig', id: 0 as SigExprId },
        shape: {
          k: 'sig',
          topologyId: TEST_PENTAGON_ID,
          paramSignals: [1 as SigExprId, 2 as SigExprId, 3 as SigExprId],
        },
        controlPoints: { k: 'slot', slot: 3 as ValueSlot },
      };

      const context: AssemblerContext = {
        signals,
        instances: new Map([['test-instance', createMockInstance(2)]]),
        state,
    resolvedCamera: DEFAULT_CAMERA,
      };

      const result = assembleDrawPathInstancesOp(step, context);

      expect(result).toHaveLength(1);
      const op = result[0];
      expect(op.kind).toBe('drawPathInstances');

      // Validate geometry structure (using type guard to narrow type)
      if (op.kind === 'drawPathInstances') {
        expect(op.geometry.topologyId).toBeDefined();
        expect(op.geometry.verbs).toBeInstanceOf(Uint8Array);
        expect(op.geometry.verbs.length).toBe(6); // MOVE, LINE x4, CLOSE
        expect(op.geometry.points).toBe(controlPointsBuffer);
        expect(op.geometry.pointsCount).toBe(5);
        expect(op.geometry.flags).toBe(1); // closed
      }

      // Validate instance transforms (projection creates new buffer with stride-2)
      expect(op.instances.count).toBe(2);
      expect(op.instances.position).toBeInstanceOf(Float32Array);
      expect(op.instances.position.length).toBe(4); // 2 instances × stride-2
      // Verify projected values are finite and in reasonable range
      for (let i = 0; i < 4; i++) {
        expect(Number.isFinite(op.instances.position[i])).toBe(true);
        expect(op.instances.position[i]).toBeGreaterThanOrEqual(0);
        expect(op.instances.position[i]).toBeLessThanOrEqual(1);
      }
      expect(op.instances.size).toBe(2.5);
      expect(op.instances.rotation).toBeUndefined();
      expect(op.instances.scale2).toBeUndefined();

      // Validate style
      expect(op.style.fillColor).toBe(colorBuffer);
      expect(op.style.fillRule).toBe('nonzero');
    });

    it('throws when position buffer is not Float32Array', () => {
      const state = createMockState();
      const positionBuffer = new Uint8Array(20); // Wrong type!
      const colorBuffer = new Uint8ClampedArray(40);
      const controlPointsBuffer = new Float32Array(10);

      state.values.objects.set(1 as ValueSlot, positionBuffer);
      state.values.objects.set(2 as ValueSlot, colorBuffer);
      state.values.objects.set(3 as ValueSlot, controlPointsBuffer);

      const signals: SigExpr[] = [
        { kind: 'const', value: 1.0, type: SCALAR_TYPE },
        { kind: 'const', value: 0.02, type: SCALAR_TYPE },
        { kind: 'const', value: 0.02, type: SCALAR_TYPE },
        { kind: 'const', value: 1, type: SCALAR_TYPE },
      ];

      const step: StepRender = {
        kind: 'render',
        instanceId: 'test-instance',
        positionSlot: 1 as ValueSlot,
        colorSlot: 2 as ValueSlot,
        scale: { k: 'sig', id: 0 as SigExprId },
        shape: {
          k: 'sig',
          topologyId: TEST_PENTAGON_ID,
          paramSignals: [1 as SigExprId, 2 as SigExprId, 3 as SigExprId],
        },
        controlPoints: { k: 'slot', slot: 3 as ValueSlot },
      };

      const context: AssemblerContext = {
        signals,
        instances: new Map([['test-instance', createMockInstance(10)]]),
        state,
    resolvedCamera: DEFAULT_CAMERA,
      };

      expect(() => assembleDrawPathInstancesOp(step, context)).toThrow(
        /Position buffer must be Float32Array/
      );
    });

    it('throws when color buffer is not Uint8ClampedArray', () => {
      const state = createMockState();
      const positionBuffer = new Float32Array(20);
      const colorBuffer = new Float32Array(40); // Wrong type!
      const controlPointsBuffer = new Float32Array(10);

      state.values.objects.set(1 as ValueSlot, positionBuffer);
      state.values.objects.set(2 as ValueSlot, colorBuffer);
      state.values.objects.set(3 as ValueSlot, controlPointsBuffer);

      const signals: SigExpr[] = [
        { kind: 'const', value: 1.0, type: SCALAR_TYPE },
        { kind: 'const', value: 0.02, type: SCALAR_TYPE },
        { kind: 'const', value: 0.02, type: SCALAR_TYPE },
        { kind: 'const', value: 1, type: SCALAR_TYPE },
      ];

      const step: StepRender = {
        kind: 'render',
        instanceId: 'test-instance',
        positionSlot: 1 as ValueSlot,
        colorSlot: 2 as ValueSlot,
        scale: { k: 'sig', id: 0 as SigExprId },
        shape: {
          k: 'sig',
          topologyId: TEST_PENTAGON_ID,
          paramSignals: [1 as SigExprId, 2 as SigExprId, 3 as SigExprId],
        },
        controlPoints: { k: 'slot', slot: 3 as ValueSlot },
      };

      const context: AssemblerContext = {
        signals,
        instances: new Map([['test-instance', createMockInstance(10)]]),
        state,
    resolvedCamera: DEFAULT_CAMERA,
      };

      expect(() => assembleDrawPathInstancesOp(step, context)).toThrow(
        /Color buffer must be Uint8ClampedArray/
      );
    });

    it('throws when control points missing for path topology', () => {
      const state = createMockState();
      const positionBuffer = new Float32Array(20);
      const colorBuffer = new Uint8ClampedArray(40);
      // No control points buffer!

      state.values.objects.set(1 as ValueSlot, positionBuffer);
      state.values.objects.set(2 as ValueSlot, colorBuffer);

      const signals: SigExpr[] = [
        { kind: 'const', value: 1.0, type: SCALAR_TYPE },
        { kind: 'const', value: 0.02, type: SCALAR_TYPE },
        { kind: 'const', value: 0.02, type: SCALAR_TYPE },
        { kind: 'const', value: 1, type: SCALAR_TYPE },
      ];

      const step: StepRender = {
        kind: 'render',
        instanceId: 'test-instance',
        positionSlot: 1 as ValueSlot,
        colorSlot: 2 as ValueSlot,
        scale: { k: 'sig', id: 0 as SigExprId },
        shape: {
          k: 'sig',
          topologyId: TEST_PENTAGON_ID,
          paramSignals: [1 as SigExprId, 2 as SigExprId, 3 as SigExprId],
        },
        // controlPoints not specified!
      };

      const context: AssemblerContext = {
        signals,
        instances: new Map([['test-instance', createMockInstance(10)]]),
        state,
    resolvedCamera: DEFAULT_CAMERA,
      };

      expect(() => assembleDrawPathInstancesOp(step, context)).toThrow(
        /Path topology requires control points buffer/
      );
    });
  });

  describe('assembleRenderFrame', () => {
    it('assembles multiple DrawPathInstancesOp operations', () => {
      const state = createMockState();

      // Set up buffers for two path instances
      state.values.objects.set(1 as ValueSlot, new Float32Array([0.1, 0.2]));
      state.values.objects.set(2 as ValueSlot, new Uint8ClampedArray([255, 0, 0, 255]));
      state.values.objects.set(3 as ValueSlot, new Float32Array([0, 1, 0.95, 0.31, 0.59, -0.81, -0.59, -0.81, -0.95, 0.31]));
      state.values.objects.set(4 as ValueSlot, new Float32Array([0.5, 0.6]));
      state.values.objects.set(5 as ValueSlot, new Uint8ClampedArray([0, 255, 0, 255]));
      state.values.objects.set(6 as ValueSlot, new Float32Array([0, 1, 0.95, 0.31, 0.59, -0.81, -0.59, -0.81, -0.95, 0.31]));

      const signals: SigExpr[] = [
        { kind: 'const', value: 1.0, type: SCALAR_TYPE },
        { kind: 'const', value: 0.02, type: SCALAR_TYPE },
        { kind: 'const', value: 0.02, type: SCALAR_TYPE },
        { kind: 'const', value: 1, type: SCALAR_TYPE },
      ];

      const steps: StepRender[] = [
        {
          kind: 'render',
          instanceId: 'instance-a',
          positionSlot: 1 as ValueSlot,
          colorSlot: 2 as ValueSlot,
          scale: { k: 'sig', id: 0 as SigExprId },
          shape: {
            k: 'sig',
            topologyId: TEST_PENTAGON_ID,
            paramSignals: [1 as SigExprId, 2 as SigExprId, 3 as SigExprId],
          },
          controlPoints: { k: 'slot', slot: 3 as ValueSlot },
        },
        {
          kind: 'render',
          instanceId: 'instance-b',
          positionSlot: 4 as ValueSlot,
          colorSlot: 5 as ValueSlot,
          scale: { k: 'sig', id: 0 as SigExprId },
          shape: {
            k: 'sig',
            topologyId: TEST_PENTAGON_ID,
            paramSignals: [1 as SigExprId, 2 as SigExprId, 3 as SigExprId],
          },
          controlPoints: { k: 'slot', slot: 6 as ValueSlot },
        },
      ];

      const context: AssemblerContext = {
        signals,
        instances: new Map([
          ['instance-a', createMockInstance(1)],
          ['instance-b', createMockInstance(1)],
        ]),
        state,
    resolvedCamera: DEFAULT_CAMERA,
      };

      const result = assembleRenderFrame(steps, context);

      expect(result.version).toBe(2);
      expect(result.ops).toHaveLength(2);
      expect(result.ops[0].kind).toBe('drawPathInstances');
      expect(result.ops[1].kind).toBe('drawPathInstances');
    });

    it('includes both path and primitive operations', () => {
      const state = createMockState();

      // One path instance, one primitive instance
      state.values.objects.set(1 as ValueSlot, new Float32Array([0.1, 0.2]));
      state.values.objects.set(2 as ValueSlot, new Uint8ClampedArray([255, 0, 0, 255]));
      state.values.objects.set(3 as ValueSlot, new Float32Array([0, 1, 0.95, 0.31, 0.59, -0.81, -0.59, -0.81, -0.95, 0.31]));
      state.values.objects.set(4 as ValueSlot, new Float32Array([0.5, 0.6]));
      state.values.objects.set(5 as ValueSlot, new Uint8ClampedArray([0, 255, 0, 255]));

      const signals: SigExpr[] = [
        { kind: 'const', value: 1.0, type: SCALAR_TYPE },
        { kind: 'const', value: 0.02, type: SCALAR_TYPE },
        { kind: 'const', value: 0.02, type: SCALAR_TYPE },
        { kind: 'const', value: 1, type: SCALAR_TYPE },
      ];

      const steps: StepRender[] = [
        {
          kind: 'render',
          instanceId: 'path-instance',
          positionSlot: 1 as ValueSlot,
          colorSlot: 2 as ValueSlot,
          scale: { k: 'sig', id: 0 as SigExprId },
          shape: {
            k: 'sig',
            topologyId: TEST_PENTAGON_ID,
            paramSignals: [1 as SigExprId, 2 as SigExprId, 3 as SigExprId],
          },
          controlPoints: { k: 'slot', slot: 3 as ValueSlot },
        },
        {
          kind: 'render',
          instanceId: 'primitive-instance',
          positionSlot: 4 as ValueSlot,
          colorSlot: 5 as ValueSlot,
          scale: { k: 'sig', id: 0 as SigExprId },
          shape: { k: 'sig', topologyId: TOPOLOGY_ID_ELLIPSE, paramSignals: [1 as SigExprId, 2 as SigExprId] },
        },
      ];

      const context: AssemblerContext = {
        signals,
        instances: new Map([
          ['path-instance', createMockInstance(1)],
          ['primitive-instance', createMockInstance(1)],
        ]),
        state,
    resolvedCamera: DEFAULT_CAMERA,
      };

      const result = assembleRenderFrame(steps, context);

      // Both path and primitive instances produce ops
      expect(result.version).toBe(2);
      expect(result.ops).toHaveLength(2);
      expect(result.ops[0].kind).toBe('drawPathInstances');
      expect(result.ops[1].kind).toBe('drawPrimitiveInstances');
    });

    it('returns empty ops array when all instances are empty', () => {
      const state = createMockState();

      const signals: SigExpr[] = [
        { kind: 'const', value: 1.0, type: SCALAR_TYPE },
      ];

      const steps: StepRender[] = [
        {
          kind: 'render',
          instanceId: 'empty-instance',
          positionSlot: 1 as ValueSlot,
          colorSlot: 2 as ValueSlot,
          scale: { k: 'sig', id: 0 as SigExprId },
          shape: { k: 'sig', topologyId: TOPOLOGY_ID_ELLIPSE, paramSignals: [] },
        },
      ];

      const context: AssemblerContext = {
        signals,
        instances: new Map([
          ['empty-instance', createMockInstance(0)], // count = 0
        ]),
        state,
    resolvedCamera: DEFAULT_CAMERA,
      };

      const result = assembleRenderFrame(steps, context);

      expect(result.version).toBe(2);
      expect(result.ops).toHaveLength(0);
    });
  });
});
