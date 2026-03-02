/**
 * Steel Thread Test - Animated Particles
 *
 * Tests the minimal viable pipeline using three-stage block architecture:
 * Ellipse (shape) → Array (cardinality) → GridLayoutUV (operation) → Render
 *
 * Verifies: compile → createRuntimeState → executeFrame → RenderFrameIR with DrawOps.
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';
import type { ScheduleIR } from '../backend/schedule-program';
import { computeRuntimeStorageSizes } from '../ir/program';
import { createRuntimeState, executeFrame } from '../../runtime';
import { readShapeBankHandleMetadata, readShapeBankHeader } from '../../runtime/RuntimeState';
import { getTestArena } from '../../runtime/__tests__/test-arena-helper';
import { getTopology } from '../../shapes/registry';

/**
 * Helper: compile a patch and assert success.
 */
function compileOk(patch: ReturnType<typeof buildPatch>) {
  const result = compile(patch);
  if (result.kind === 'error') {
    throw new Error(
      `Compilation failed:\n${result.errors.map((e) => `  [${e.code}] ${e.message}`).join('\n')}`
    );
  }
  return result.program;
}

/**
 * Helper: create runtime state sized for a compiled program.
 */
function stateFor(program: ReturnType<typeof compileOk>) {
  const schedule = program.schedule as ScheduleIR;
  const sizes = computeRuntimeStorageSizes(program.runtimeSlots);
  return createRuntimeState(
    sizes.f32,
    schedule.stateSlotCount,
    0, // eventSlotCount
    0, // eventExprCount
    program.valueExprs.nodes.length,
    program.arenaTotalFloats,
    0,
    undefined,
    undefined,
    program.arenaRuntimeLayout,
  );
}

describe('Steel Thread - Animated Particles', () => {
  it('compiles and renders a grid of ellipses', () => {
    // Three-stage: Ellipse (shape) → Array (cardinality) → GridLayoutUV (layout) → Render
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      b.setPortDefault(time, 'periodAMs', 1000);
      b.setPortDefault(time, 'periodBMs', 2000);
      const ellipse = b.addBlock('Ellipse');
      b.setPortDefault(ellipse, 'rx', 0.03);
      b.setPortDefault(ellipse, 'ry', 0.03);
      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 4);
      const layout = b.addBlock('GridLayoutUV');
      b.setPortDefault(layout, 'rows', 2);
      b.setPortDefault(layout, 'cols', 2);
      const render = b.addBlock('RenderInstances2D');

      // Color requires explicit Broadcast (one→many)
      const colorSig = b.addBlock('Const');
      b.setConfig(colorSig, 'value', { r: 1, g: 0.5, b: 0.2, a: 1 });
      const colorField = b.addBlock('Broadcast');
      b.wire(colorSig, 'out', colorField, 'one');

      b.wire(ellipse, 'shape', array, 'element');
      b.wire(array, 'elements', layout, 'elements');
      b.wire(layout, 'controlPoints', render, 'controlPoints');
      b.wire(colorField, 'field', render, 'color');
      // Shape port removed - automatically looked up from instance
    });

    // 1. Compile
    const program = compileOk(patch);

    // Basic structural checks
    expect(program.valueExprs.nodes.length).toBeGreaterThan(0);
    expect(program.slotMeta.length).toBeGreaterThan(0);
    expect(program.nagaLoweringProgram?.module.entry_points).toEqual([
      {
        stage: 'compute',
        function: 'compute_main',
        workgroupSize: [64, 1, 1],
      },
    ]);
    expect(program.nagaLoweringProgram?.compute.maxActiveLanes ?? 0).toBeGreaterThan(0);
    // [LAW:no-string-math] Draw-prep metadata is structured only; compile output
    // must not carry lowering-authored WGSL source text.
    expect((program.drawPrepProgram as { wgsl?: unknown } | undefined)?.wgsl).toBeUndefined();
    expect(program.drawPrepProgram?.sinks.length ?? 0).toBeGreaterThan(0);
    expect(program.generatedComputeProgram?.maxActiveLanes ?? 0).toBeGreaterThan(0);
    expect(program.generatedComputeProgram?.offsetConstants.size ?? 0).toBeGreaterThan(0);
    expect(program.drawPrepProgram?.sinks.length).toBe(1);
    expect(program.drawPrepProgram?.sinks[0]).toMatchObject({
      sinkIndex: 0,
      indirectRecordIndex: 0,
      instanceCountMode: 'static',
      staticInstanceCount: 4,
    });
    const shapeRefs = program.valueExprs.nodes.filter((expr) => expr.kind === 'shapeRef');
    expect(shapeRefs.length).toBeGreaterThan(0);
    for (const shapeRef of shapeRefs) {
      // [LAW:one-source-of-truth] Shape wires carry canonical HANDLE semantics.
      expect(shapeRef.type.payload.kind).toBe('shape');
    }
    const schedule = program.schedule as ScheduleIR;
    expect(schedule.steps.length).toBeGreaterThan(0);

    // 2. Execute frame at t=0
    const state = stateFor(program);
    const arena = getTestArena();
    const frame = executeFrame(program, state, arena, 0);

    // 3. Verify render output
    expect(frame.ops.length).toBeGreaterThan(0);
    const renderInstanceDecls = Array.from(schedule.instances.values()).filter((instance) => instance.shapeField != null);
    expect(renderInstanceDecls.length).toBeGreaterThan(0);

    // Should have a draw op with 4 instances
    const drawOp = frame.ops[0];
    expect(drawOp.instances.count).toBe(4);

    // Position buffer should be finite (no NaN/Infinity)
    for (let i = 0; i < drawOp.instances.position.length; i++) {
      expect(Number.isFinite(drawOp.instances.position[i])).toBe(true);
    }

    // P0-3.2 contract: shape producers emit numeric handles with populated ShapeBank headers.
    expect(state.shapeBank).toBeDefined();
    const scalarAddressTable = program.runtimeAddressTable?.scalarExprToArenaAddress;
    expect(scalarAddressTable).toBeDefined();
    for (let exprId = 0; exprId < program.valueExprs.nodes.length; exprId++) {
      const expr = program.valueExprs.nodes[exprId];
      if (!expr || expr.kind !== 'shapeRef') continue;
      const address = scalarAddressTable?.get(exprId);
      expect(address).toBeDefined();
      if (!address || !state.shapeBank) continue;
      const handle = Math.trunc(state.arena[address.arena.offset + address.component] ?? NaN);
      expect(Number.isFinite(handle)).toBe(true);
      const header = readShapeBankHeader(state.shapeBank.data, handle);
      const metadata = readShapeBankHandleMetadata(state.shapeBank, handle);
      expect(metadata.topologyId).toBe(expr.topologyId);
      const topology = getTopology(expr.topologyId);
      if ('totalControlPoints' in topology) {
        expect(header.vertexCount).toBe(topology.totalControlPoints);
      }
      expect(header.indexCount).toBe(header.vertexCount);
    }
  });

  it('compiles and renders a circle layout with oscillator', () => {
    // Three-stage with oscillator: Time → Osc, Ellipse → Array → CircleLayoutUV → Render
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      b.setPortDefault(time, 'periodAMs', 1000);
      const ellipse = b.addBlock('Ellipse');
      b.setPortDefault(ellipse, 'rx', 0.05);
      b.setPortDefault(ellipse, 'ry', 0.05);
      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 8);
      const layout = b.addBlock('CircleLayoutUV');
      b.setPortDefault(layout, 'radius', 0.3);
      const render = b.addBlock('RenderInstances2D');

      // Color requires explicit Broadcast (one→many)
      const colorSig = b.addBlock('Const');
      b.setConfig(colorSig, 'value', { r: 0, g: 1, b: 0, a: 1 });
      const colorField = b.addBlock('Broadcast');
      b.wire(colorSig, 'out', colorField, 'one');

      b.wire(ellipse, 'shape', array, 'element');
      b.wire(array, 'elements', layout, 'elements');
      b.wire(layout, 'controlPoints', render, 'controlPoints');
      b.wire(colorField, 'field', render, 'color');
      // Shape port removed - automatically looked up from instance
    });

    // 1. Compile
    const program = compileOk(patch);
    expect(program.nagaLoweringProgram?.compute.maxActiveLanes ?? 0).toBeGreaterThan(0);

    // 2. Execute two frames at different times
    const state = stateFor(program);
    const arena = getTestArena();

    const frame0 = executeFrame(program, state, arena, 0);
    expect(frame0.ops.length).toBeGreaterThan(0);
    expect(frame0.ops[0].instances.count).toBe(8);

    // Execute at t=500ms (halfway through period)
    const frame500 = executeFrame(program, state, arena, 500);
    expect(frame500.ops.length).toBeGreaterThan(0);
    expect(frame500.ops[0].instances.count).toBe(8);

    // Positions should still be finite
    for (let i = 0; i < frame500.ops[0].instances.position.length; i++) {
      expect(Number.isFinite(frame500.ops[0].instances.position[i])).toBe(true);
    }
  });
});
