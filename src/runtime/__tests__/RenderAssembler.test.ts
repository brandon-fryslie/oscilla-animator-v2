/**
 * RenderAssembler Tests
 *
 * Tests for render pass assembly module.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  assembleDrawPathInstancesOp,
  assembleRenderFrame,
  isRenderStep,
  type AssemblerContext,
} from '../RenderAssembler';
import type { StepRender, InstanceDecl } from '../../compiler/ir/types';
import type { ValueExpr } from '../../compiler/ir/value-expr';
import { instanceId } from '../../core/ids';
import type { CanonicalType } from '../../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR,  CAMERA_PROJECTION, canonicalType } from '../../core/canonical-types';
import type { RuntimeState } from '../RuntimeState';
import { createRuntimeState } from '../RuntimeState';
import type { ValueSlot, ValueExprId } from '../../types';
import { registerDynamicTopology } from '../../shapes/registry';
import type { RenderSpace2D } from '../../shapes/types';
import { PathVerb } from '../../shapes/types';
import { DEFAULT_CAMERA } from '../CameraResolver';
import { getTestArena } from './test-arena-helper';
import { buildSlotToArenaFromTestBuffers, setTestSlotBuffer } from './slot-buffer-helper';

// Helper to create a valid palette Float32Array
function createPalette(r = 1, g = 1, b = 1, a = 1): Float32Array {
  return new Float32Array([r, g, b, a]);
}

// Helper to create a scalar one-cardinality type
const SCALAR_TYPE: CanonicalType = canonicalType(FLOAT);

// Create a minimal runtime state for testing
function createMockState(): RuntimeState {
  const state = createRuntimeState(100, 0, 0, 0, 0, 256);
  // Set effective time so one-cardinality evaluation works
  state.time = {
    tAbsMs: 0,
    tMs: 0,
    dt: 0,
    phaseA: 0,
    phaseB: 0,
    pulse: 0,
    palette: createPalette(),
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

const TEST_NON_PATH_TOPOLOGY_ID = registerDynamicTopology({
  params: [
    { name: 'radiusX', type: 'float', default: 0.02 },
    { name: 'radiusY', type: 'float', default: 0.02 },
  ],
  render: (_ctx: CanvasRenderingContext2D, _p: Record<string, number>, _space: RenderSpace2D) => {
    // Intentionally non-path topology for error-path validation.
  },
}, 'test-non-path');

describe('RenderAssembler', () => {
  describe('isRenderStep', () => {
    it('returns true for render steps', () => {
      const step = { kind: 'render' };
      expect(isRenderStep(step)).toBe(true);
    });

    it('returns false for non-render steps', () => {
      expect(isRenderStep({ kind: 'evalOne' })).toBe(false);
      expect(isRenderStep({ kind: 'eventDispatch' })).toBe(false);
      expect(isRenderStep({ kind: 'materialize' })).toBe(false);
      expect(isRenderStep({ kind: 'stateWrite' })).toBe(false);
    });
  });

  describe('assembleDrawPathInstancesOp (v2)', () => {
    it('throws error when instance not found', () => {
      const state = createMockState();
      const step: StepRender = {
        kind: 'render',
        instanceId: instanceId('missing-instance'),
        positionSlot: 1 as ValueSlot,
        colorSlot: 2 as ValueSlot,
        shape: { k: 'one', topologyId: 1, paramExprs: [] },
      };

      const context: AssemblerContext = {
        scalarExprToArenaOffset: new Map(),
        instances: new Map(),
        state,
        resolvedCamera: DEFAULT_CAMERA,
        arena: getTestArena(),
      };

      expect(() => assembleDrawPathInstancesOp(step, context)).toThrow(
        /Instance missing-instance not found/
      );
    });

    it('returns empty array when instance count is 0', () => {
      const state = createMockState();
      const step: StepRender = {
        kind: 'render',
        instanceId: instanceId('empty-instance'),
        positionSlot: 1 as ValueSlot,
        colorSlot: 2 as ValueSlot,
        shape: { k: 'one', topologyId: 1, paramExprs: [] },
      };

      const context: AssemblerContext = {
        scalarExprToArenaOffset: new Map(),
        instances: new Map([['empty-instance', createMockInstance(0)]]),
        state,
        resolvedCamera: DEFAULT_CAMERA,
        arena: getTestArena(),
      };

      const result = assembleDrawPathInstancesOp(step, context);
      expect(result).toEqual([]);
    });

    it('returns empty array when projection culls all instances', () => {
      const state = createMockState();
      // Two instances placed beyond default far plane (far=100)
      const positionBuffer = new Float32Array([
        0.1, 0.2, 250.0,
        0.3, 0.4, 300.0,
      ]);
      const colorBuffer = new Uint8ClampedArray([
        255, 0, 0, 255,
        0, 255, 0, 255,
      ]);
      const controlPointsBuffer = new Float32Array([
        0, 1,
        0.95, 0.31,
        0.59, -0.81,
        -0.59, -0.81,
        -0.95, 0.31,
      ]);

      setTestSlotBuffer(state, 1 as ValueSlot, positionBuffer);
      setTestSlotBuffer(state, 2 as ValueSlot, colorBuffer);
      setTestSlotBuffer(state, 3 as ValueSlot, controlPointsBuffer);

      const scalarExprToArenaOffset = new Map<number, number>([
        [0, 10],
        [1, 11],
        [2, 12],
        [3, 13],
      ]);
      state.arena[10] = 1.0;
      state.arena[11] = 0.02;
      state.arena[12] = 0.02;
      state.arena[13] = 1;

      const slotToArena = buildSlotToArenaFromTestBuffers(state, [
        { slot: 1 as ValueSlot, stride: 3 },
        { slot: 2 as ValueSlot, stride: 4 },
        { slot: 3 as ValueSlot, stride: 2 },
      ]);

      const step: StepRender = {
        kind: 'render',
        instanceId: instanceId('culled-instance'),
        positionSlot: 1 as ValueSlot,
        colorSlot: 2 as ValueSlot,
        scale: { k: 'one', id: 0 as ValueExprId },
        shape: {
          k: 'one',
          topologyId: TEST_PENTAGON_ID,
          paramExprs: [1 as ValueExprId, 2 as ValueExprId, 3 as ValueExprId],
        },
        controlPoints: { k: 'slot', slot: 3 as ValueSlot },
      };

      const context: AssemblerContext = {
        scalarExprToArenaOffset,
        instances: new Map([['culled-instance', createMockInstance(2)]]),
        state,
        resolvedCamera: DEFAULT_CAMERA,
        arena: getTestArena(),
        slotToArena,
      };

      const result = assembleDrawPathInstancesOp(step, context);
      expect(result).toEqual([]);
    });

    it('rejects non-path topologies', () => {
      const state = createMockState();
      // Position buffer must be stride-3 (vec3 world-space positions)
      const positionBuffer = new Float32Array(30); // 10 instances * 3 components
      const colorBuffer = new Uint8ClampedArray(40);
      setTestSlotBuffer(state, 1 as ValueSlot, positionBuffer);
      setTestSlotBuffer(state, 2 as ValueSlot, colorBuffer);

      // Build scalarExprToArenaOffset mapping for scale and shape params
      const scalarExprToArenaOffset = new Map<number, number>([
        [0, 10], // scale one-cardinality value at slot 10
        [1, 11], // rx param at slot 11
        [2, 12], // ry param at slot 12
      ]);

      // Write one-cardinality values to state
      state.arena[10] = 1.0;  // scale
      state.arena[11] = 0.02; // rx param
      state.arena[12] = 0.02; // ry param
      const slotToArena = buildSlotToArenaFromTestBuffers(state, [
        { slot: 1 as ValueSlot, stride: 3 },
        { slot: 2 as ValueSlot, stride: 4 },
      ]);

      const step: StepRender = {
        kind: 'render',
        instanceId: instanceId('test-instance'),
        positionSlot: 1 as ValueSlot,
        colorSlot: 2 as ValueSlot,
        scale: { k: 'one', id: 0 as ValueExprId },
        shape: { k: 'one', topologyId: TEST_NON_PATH_TOPOLOGY_ID, paramExprs: [1 as ValueExprId, 2 as ValueExprId] },
      };

      const context: AssemblerContext = {
        scalarExprToArenaOffset,
        instances: new Map([['test-instance', createMockInstance(10)]]),
        state,
        resolvedCamera: DEFAULT_CAMERA,
        arena: getTestArena(),
        slotToArena,
      };

      expect(() => assembleDrawPathInstancesOp(step, context)).toThrow(
        /not a path topology/
      );
    });

    it('assembles DrawPathInstancesOp for path topologies', () => {
      const state = createMockState();
      // Position buffer must be stride-3 (vec3 world-space positions)
      const positionBuffer = new Float32Array([0.1, 0.2, 0.0, 0.3, 0.4, 0.0]); // 2 instances * 3 components
      const colorBuffer = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]); // 2 instances
      const controlPointsBuffer = new Float32Array([
        0, 1,    // point 0
        0.95, 0.31,  // point 1
        0.59, -0.81, // point 2
        -0.59, -0.81, // point 3
        -0.95, 0.31,  // point 4
      ]); // 5 points for pentagon

      setTestSlotBuffer(state, 1 as ValueSlot, positionBuffer);
      setTestSlotBuffer(state, 2 as ValueSlot, colorBuffer);
      setTestSlotBuffer(state, 3 as ValueSlot, controlPointsBuffer);

      // Build scalarExprToArenaOffset mapping for scale and shape params
      const scalarExprToArenaOffset = new Map<number, number>([
        [0, 10], // scale one-cardinality value
        [1, 11], // radiusX param
        [2, 12], // radiusY param
        [3, 13], // closed param
      ]);

      // Write one-cardinality values to state
      state.arena[10] = 2.5;  // scale
      state.arena[11] = 0.02; // radiusX param
      state.arena[12] = 0.02; // radiusY param
      state.arena[13] = 1;    // closed param
      const slotToArena = buildSlotToArenaFromTestBuffers(state, [
        { slot: 1 as ValueSlot, stride: 3 },
        { slot: 2 as ValueSlot, stride: 4 },
        { slot: 3 as ValueSlot, stride: 2 },
      ]);

      const step: StepRender = {
        kind: 'render',
        instanceId: instanceId('test-instance'),
        positionSlot: 1 as ValueSlot,
        colorSlot: 2 as ValueSlot,
        scale: { k: 'one', id: 0 as ValueExprId },
        shape: {
          k: 'one',
          topologyId: TEST_PENTAGON_ID,
          paramExprs: [1 as ValueExprId, 2 as ValueExprId, 3 as ValueExprId],
        },
        controlPoints: { k: 'slot', slot: 3 as ValueSlot },
      };

      const context: AssemblerContext = {
        scalarExprToArenaOffset,
        instances: new Map([['test-instance', createMockInstance(2)]]),
        state,
        resolvedCamera: DEFAULT_CAMERA,
        arena: getTestArena(),
        slotToArena,
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
        expect(op.geometry.points).toEqual(controlPointsBuffer);
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
      expect(op.instances.size).toBeInstanceOf(Float32Array);
      expect((op.instances.size as Float32Array).length).toBe(2); // 2 instances
      // rotation and scale2 are always present (identity values when not specified)
      expect(op.instances.rotation).toBeInstanceOf(Float32Array);
      expect(op.instances.scale2).toBeInstanceOf(Float32Array);

      // Validate style
      expect(op.style.fillColor).toBeDefined();
      expect(op.style.fillColor).toBeInstanceOf(Uint8ClampedArray);
      expect(op.style.fillColor!.length).toBe(colorBuffer.length);
      expect(op.style.fillRule).toBe('nonzero');
    });

    it('throws when control points missing for path topology', () => {
      const state = createMockState();
      // Position buffer must be stride-3 (vec3 world-space positions)
      const positionBuffer = new Float32Array(30); // 10 instances * 3 components
      const colorBuffer = new Uint8ClampedArray(40);
      // No control points buffer!

      setTestSlotBuffer(state, 1 as ValueSlot, positionBuffer);
      setTestSlotBuffer(state, 2 as ValueSlot, colorBuffer);

      // Build scalarExprToArenaOffset mapping
      const scalarExprToArenaOffset = new Map<number, number>([
        [0, 10], [1, 11], [2, 12], [3, 13],
      ]);

      // Write one-cardinality values to state
      state.arena[10] = 1.0;
      state.arena[11] = 0.02;
      state.arena[12] = 0.02;
      state.arena[13] = 1;
      const slotToArena = buildSlotToArenaFromTestBuffers(state, [
        { slot: 1 as ValueSlot, stride: 3 },
        { slot: 2 as ValueSlot, stride: 4 },
      ]);

      const step: StepRender = {
        kind: 'render',
        instanceId: instanceId('test-instance'),
        positionSlot: 1 as ValueSlot,
        colorSlot: 2 as ValueSlot,
        scale: { k: 'one', id: 0 as ValueExprId },
        shape: {
          k: 'one',
          topologyId: TEST_PENTAGON_ID,
          paramExprs: [1 as ValueExprId, 2 as ValueExprId, 3 as ValueExprId],
        },
        // controlPoints not specified!
      };

      const context: AssemblerContext = {
        scalarExprToArenaOffset,
        instances: new Map([['test-instance', createMockInstance(10)]]),
        state,
        resolvedCamera: DEFAULT_CAMERA,
        arena: getTestArena(),
        slotToArena,
      };

      expect(() => assembleDrawPathInstancesOp(step, context)).toThrow(
        /requires control points buffer/
      );
    });
  });

  describe('assembleRenderFrame', () => {
    it('assembles multiple DrawPathInstancesOp operations', () => {
      const state = createMockState();

      // Set up buffers for two path instances (stride-3 positions for vec3 world-space)
      setTestSlotBuffer(state, 1 as ValueSlot, new Float32Array([0.1, 0.2, 0.0])); // 1 instance * 3 components
      setTestSlotBuffer(state, 2 as ValueSlot, new Uint8ClampedArray([255, 0, 0, 255]));
      setTestSlotBuffer(state, 3 as ValueSlot, new Float32Array([0, 1, 0.95, 0.31, 0.59, -0.81, -0.59, -0.81, -0.95, 0.31]));
      setTestSlotBuffer(state, 4 as ValueSlot, new Float32Array([0.5, 0.6, 0.0])); // 1 instance * 3 components
      setTestSlotBuffer(state, 5 as ValueSlot, new Uint8ClampedArray([0, 255, 0, 255]));
      setTestSlotBuffer(state, 6 as ValueSlot, new Float32Array([0, 1, 0.95, 0.31, 0.59, -0.81, -0.59, -0.81, -0.95, 0.31]));

      // Build scalarExprToArenaOffset mapping
      const scalarExprToArenaOffset = new Map<number, number>([
        [0, 10], [1, 11], [2, 12], [3, 13],
      ]);

      // Write one-cardinality values to state
      state.arena[10] = 1.0;
      state.arena[11] = 0.02;
      state.arena[12] = 0.02;
      state.arena[13] = 1;
      const slotToArena = buildSlotToArenaFromTestBuffers(state, [
        { slot: 1 as ValueSlot, stride: 3 },
        { slot: 2 as ValueSlot, stride: 4 },
        { slot: 3 as ValueSlot, stride: 2 },
        { slot: 4 as ValueSlot, stride: 3 },
        { slot: 5 as ValueSlot, stride: 4 },
        { slot: 6 as ValueSlot, stride: 2 },
      ]);

      const steps: StepRender[] = [
        {
          kind: 'render',
          instanceId: instanceId('instance-a'),
          positionSlot: 1 as ValueSlot,
          colorSlot: 2 as ValueSlot,
          scale: { k: 'one', id: 0 as ValueExprId },
          shape: {
            k: 'one',
            topologyId: TEST_PENTAGON_ID,
            paramExprs: [1 as ValueExprId, 2 as ValueExprId, 3 as ValueExprId],
          },
          controlPoints: { k: 'slot', slot: 3 as ValueSlot },
        },
        {
          kind: 'render',
          instanceId: instanceId('instance-b'),
          positionSlot: 4 as ValueSlot,
          colorSlot: 5 as ValueSlot,
          scale: { k: 'one', id: 0 as ValueExprId },
          shape: {
            k: 'one',
            topologyId: TEST_PENTAGON_ID,
            paramExprs: [1 as ValueExprId, 2 as ValueExprId, 3 as ValueExprId],
          },
          controlPoints: { k: 'slot', slot: 6 as ValueSlot },
        },
      ];

      const context: AssemblerContext = {
        scalarExprToArenaOffset,
        instances: new Map([
          ['instance-a', createMockInstance(1)],
          ['instance-b', createMockInstance(1)],
        ]),
        state,
        resolvedCamera: DEFAULT_CAMERA,
        arena: getTestArena(),
        slotToArena,
      };

      const result = assembleRenderFrame(steps, context);

      expect(result.version).toBe(2);
      expect(result.ops).toHaveLength(2);
      expect(result.ops[0].kind).toBe('drawPathInstances');
      expect(result.ops[1].kind).toBe('drawPathInstances');
    });

    it('returns empty ops array when all instances are empty', () => {
      const state = createMockState();

      // Build scalarExprToArenaOffset mapping for scale one-cardinality value
      const scalarExprToArenaOffset = new Map<number, number>([
        [0, 10], // scale one-cardinality value
      ]);

      // Write one-cardinality value to state
      state.arena[10] = 1.0;

      const steps: StepRender[] = [
        {
          kind: 'render',
          instanceId: instanceId('empty-instance'),
          positionSlot: 1 as ValueSlot,
          colorSlot: 2 as ValueSlot,
          scale: { k: 'one', id: 0 as ValueExprId },
          shape: { k: 'one', topologyId: TEST_PENTAGON_ID, paramExprs: [] },
        },
      ];

      const context: AssemblerContext = {
        scalarExprToArenaOffset,
        instances: new Map([
          ['empty-instance', createMockInstance(0)], // count = 0
        ]),
        state,
    resolvedCamera: DEFAULT_CAMERA,
        arena: getTestArena(),
      };

      const result = assembleRenderFrame(steps, context);

      expect(result.version).toBe(2);
      expect(result.ops).toHaveLength(0);
    });

    it('stays within a stable arena allocation budget for repeated frames', () => {
      const state = createMockState();
      const instanceCount = 16;

      const positionBuffer = new Float32Array(instanceCount * 3);
      const colorBuffer = new Uint8ClampedArray(instanceCount * 4);
      const controlPointsBuffer = new Float32Array([
        0, 1,
        0.95, 0.31,
        0.59, -0.81,
        -0.59, -0.81,
        -0.95, 0.31,
      ]);

      for (let i = 0; i < instanceCount; i++) {
        positionBuffer[i * 3] = (i % 4) / 3;
        positionBuffer[i * 3 + 1] = Math.floor(i / 4) / 3;
        positionBuffer[i * 3 + 2] = 0;
        colorBuffer[i * 4] = 255;
        colorBuffer[i * 4 + 1] = 128;
        colorBuffer[i * 4 + 2] = 32;
        colorBuffer[i * 4 + 3] = 255;
      }

      setTestSlotBuffer(state, 1 as ValueSlot, positionBuffer);
      setTestSlotBuffer(state, 2 as ValueSlot, colorBuffer);
      setTestSlotBuffer(state, 3 as ValueSlot, controlPointsBuffer);

      const scalarExprToArenaOffset = new Map<number, number>([
        [0, 10], [1, 11], [2, 12], [3, 13],
      ]);
      state.arena[10] = 1.0;
      state.arena[11] = 0.02;
      state.arena[12] = 0.02;
      state.arena[13] = 1;

      const slotToArena = buildSlotToArenaFromTestBuffers(state, [
        { slot: 1 as ValueSlot, stride: 3 },
        { slot: 2 as ValueSlot, stride: 4 },
        { slot: 3 as ValueSlot, stride: 2 },
      ]);

      const step: StepRender = {
        kind: 'render',
        instanceId: instanceId('budget-instance'),
        positionSlot: 1 as ValueSlot,
        colorSlot: 2 as ValueSlot,
        scale: { k: 'one', id: 0 as ValueExprId },
        shape: {
          k: 'one',
          topologyId: TEST_PENTAGON_ID,
          paramExprs: [1 as ValueExprId, 2 as ValueExprId, 3 as ValueExprId],
        },
        controlPoints: { k: 'slot', slot: 3 as ValueSlot },
      };

      const arena = getTestArena();
      const context: AssemblerContext = {
        scalarExprToArenaOffset,
        instances: new Map([['budget-instance', createMockInstance(instanceCount)]]),
        state,
        resolvedCamera: DEFAULT_CAMERA,
        arena,
        slotToArena,
      };

      let baselineAllocCount = -1;
      const frameBudget = 16;

      for (let frame = 0; frame < 20; frame++) {
        arena.reset();
        const result = assembleRenderFrame([step], context);
        expect(result.ops).toHaveLength(1);

        const allocCount = arena.getFrameStats().allocCount;
        expect(allocCount).toBeLessThanOrEqual(frameBudget);
        if (baselineAllocCount === -1) {
          baselineAllocCount = allocCount;
        } else {
          expect(allocCount).toBe(baselineAllocCount);
        }
      }
    });
  });
});
