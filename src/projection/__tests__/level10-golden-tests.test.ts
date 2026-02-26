import { describe, it, expect } from 'vitest';
import { projectInstances } from '../../runtime/RenderAssembler';
import { DEFAULT_CAMERA, type ResolvedCameraParams } from '../../runtime/CameraResolver';
import { createPositionField } from '../fields';
import { gridLayout3D } from '../layout-kernels';
import { buildPatch } from '../../graph';
import { compile } from '../../compiler/compile';
import { executeFrame } from '../../runtime/ScheduleExecutor';
import { createRuntimeState } from '../../runtime/RuntimeState';
import type { ScheduleIR } from '../../compiler/backend/schedule-program';
import { computeRuntimeStorageSizes, type CompiledProgramIR } from '../../compiler/ir/program';
import { getTestArena } from '../../runtime/__tests__/test-arena-helper';

const ORTHO_CAMERA: ResolvedCameraParams = DEFAULT_CAMERA;
const PERSP_CAMERA: ResolvedCameraParams = {
  projection: 'persp',
  centerX: 0.5,
  centerY: 0.5,
  distance: 2.0,
  tiltRad: (35 * Math.PI) / 180,
  yawRad: 0,
  fovYRad: (45 * Math.PI) / 180,
  near: 0.01,
  far: 100,
};

function createGoldenPositions(count: number): Float32Array {
  const positions = createPositionField(count);
  gridLayout3D(positions, count, 5, 5);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 2] = 0.2 + (i % 3) * 0.05;
  }
  return positions;
}

function compileGoldenPatch(): CompiledProgramIR {
  const patch = buildPatch((b) => {
    b.addBlock('InfiniteTimeRoot');

    const ellipse = b.addBlock('Ellipse');
    b.setPortDefault(ellipse, 'rx', 0.03);
    b.setPortDefault(ellipse, 'ry', 0.03);

    const array = b.addBlock('Array');
    b.setPortDefault(array, 'count', 25);

    const layout = b.addBlock('GridLayoutUV');
    b.setPortDefault(layout, 'rows', 5);
    b.setPortDefault(layout, 'cols', 5);

    const color = b.addBlock('Const');
    b.setConfig(color, 'value', { r: 1, g: 1, b: 1, a: 1 });
    const colorField = b.addBlock('Broadcast');

    const render = b.addBlock('RenderInstances2D');

    b.wire(ellipse, 'shape', array, 'element');
    b.wire(array, 'elements', layout, 'elements');
    b.wire(layout, 'position', render, 'pos');
    b.wire(color, 'out', colorField, 'one');
    b.wire(colorField, 'field', render, 'color');
  });

  const result = compile(patch);
  if (result.kind === 'error') {
    throw new Error(result.errors.map((e) => `${e.code}: ${e.message}`).join('\n'));
  }
  return result.program;
}

function createState(program: CompiledProgramIR) {
  const schedule = program.schedule as ScheduleIR;
  const sizes = computeRuntimeStorageSizes(program.runtimeSlots);
  return createRuntimeState(
    sizes.f32,
    schedule.stateSlotCount ?? 0,
    schedule.eventSlotCount ?? 0,
    schedule.eventCount ?? 0,
    program.valueExprs.nodes.length,
    program.arenaTotalFloats,
  );
}

describe('Level 10 Golden Tests', () => {
  it('camera toggle ortho -> persp -> ortho preserves ortho output exactly', () => {
    const count = 25;
    const positions = createGoldenPositions(count);

    const orthoA = projectInstances(positions, 0.03, count, ORTHO_CAMERA, getTestArena());
    const persp = projectInstances(positions, 0.03, count, PERSP_CAMERA, getTestArena());
    const orthoB = projectInstances(positions, 0.03, count, ORTHO_CAMERA, getTestArena());

    expect(persp.screenPosition.length).toBe(orthoA.screenPosition.length);
    expect(orthoB.screenPosition).toEqual(orthoA.screenPosition);
    expect(orthoB.screenRadius).toEqual(orthoA.screenRadius);
    expect(orthoB.depth).toEqual(orthoA.depth);
  });

  it('perspective projection for canonical fixture remains finite and deterministic', () => {
    const count = 9;
    const positions = createGoldenPositions(count);
    const a = projectInstances(positions, 0.03, count, PERSP_CAMERA, getTestArena());
    const b = projectInstances(positions, 0.03, count, PERSP_CAMERA, getTestArena());

    for (const value of a.screenPosition) expect(Number.isFinite(value)).toBe(true);
    for (const value of a.screenRadius) expect(Number.isFinite(value)).toBe(true);
    for (const value of a.depth) expect(Number.isFinite(value)).toBe(true);

    expect(a.screenPosition).toEqual(b.screenPosition);
    expect(a.screenRadius).toEqual(b.screenRadius);
    expect(a.depth).toEqual(b.depth);
  });

  it('full pipeline replay is deterministic for the same timeline', () => {
    const program = compileGoldenPatch();
    const timeline = [0, 120, 240, 360, 480] as const;

    const runReplay = () => {
      const state = createState(program);
      const frames: Array<{ pos: Float32Array; size: Float32Array; depth: Float32Array }> = [];
      for (const t of timeline) {
        const frame = executeFrame(program, state, getTestArena(), t);
        expect(frame.ops.length).toBe(1);
        const op = frame.ops[0]!;
        frames.push({
          pos: new Float32Array(op.instances.position),
          size: new Float32Array(op.instances.size),
          depth: new Float32Array(op.instances.depth),
        });
      }
      return frames;
    };

    const runA = runReplay();
    const runB = runReplay();

    // [LAW:behavior-not-structure] Golden replay compares user-visible render outputs only.
    expect(runB).toEqual(runA);
  });
});
