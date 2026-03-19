import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { deserializePatchFromHCL } from '../../../patch-dsl';
import { compile } from '../../../compiler/compile';
import type { ScheduleIR } from '../../../compiler/ir/program';
import { materializeValueExpr } from '../../../runtime/ValueExprMaterializer';
import { createRuntimeState } from '../../../runtime/RuntimeState';
import { resolveInstanceLaneCount } from '../../../runtime/InstanceCountResolver';
import { registerAllBlocks } from '../../../blocks/all';
import { payloadStride } from '../../../core/canonical-types';

registerAllBlocks();

const HCL_DIR = join(__dirname, '..');

function materializeRenderControlPoints(relativePath: string): { values: Float32Array; stride: number } {
  const hcl = readFileSync(join(HCL_DIR, relativePath), 'utf-8');
  const parsed = deserializePatchFromHCL(hcl);
  expect(parsed.errors).toEqual([]);

  const result = compile(parsed.patch);
  if (result.kind === 'error') {
    throw new Error(result.errors.map((error) => error.message).join('\n'));
  }

  const schedule = result.program.schedule as ScheduleIR;
  const renderStep = schedule.steps.find((step) => step.kind === 'render');
  if (!renderStep || renderStep.kind !== 'render') {
    throw new Error(`Missing render step for ${relativePath}`);
  }

  const fieldEntry = result.program.fieldSlotRegistry.get(renderStep.controlPointsSlot);
  if (!fieldEntry) {
    throw new Error(`Missing field slot entry for ${relativePath}`);
  }
  const instanceDecl = result.program.schedule.instances.get(fieldEntry.instanceId);
  if (!instanceDecl) {
    throw new Error(`Missing instance declaration for ${relativePath}`);
  }

  const runtimeState = createRuntimeState(
    schedule.stateSlotCount ?? 0,
    schedule.eventSlotCount ?? 0,
    result.program.valueExprs.nodes.length,
    result.program.arenaZones.totalFloats,
    undefined,
    undefined,
    result.program.arenaRuntimeLayout,
  );
  runtimeState.time = {
    tAbsMs: 0,
    tMs: 0,
    dt: 16.67,
    phaseA: 0,
    phaseB: 0,
    pulse: 0,
    palette: new Float32Array([1, 1, 1, 1]),
    energy: 0,
  };
  const laneCount = resolveInstanceLaneCount(instanceDecl, result.program, runtimeState);
  const fieldExpr = result.program.valueExprs.nodes[fieldEntry.fieldId];
  const stride = payloadStride(fieldExpr.type.payload);

  return {
    values: materializeValueExpr(
      fieldEntry.fieldId,
      result.program.valueExprs,
      fieldEntry.instanceId,
      laneCount,
      runtimeState,
      result.program,
    ),
    stride,
  };
}

function readBounds(controlPoints: Float32Array, stride: number) {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let sumX = 0;
  let sumY = 0;
  const count = controlPoints.length / stride;

  for (let index = 0; index < count; index++) {
    const x = controlPoints[index * stride];
    const y = controlPoints[index * stride + 1];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    sumX += x;
    sumY += y;
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    centroidX: sumX / count,
    centroidY: sumY / count,
  };
}

describe('demo coordinate-space regressions', () => {
  it.each([
    'examples/orbit.hcl',
    'features/expression-vec3-orbit.hcl',
    'features/path-field-demo.hcl',
    'features/path-flow.hcl',
  ])('%s stays centered in UV space', (relativePath) => {
    const { values, stride } = materializeRenderControlPoints(relativePath);
    const bounds = readBounds(values, stride);

    expect(bounds.minX).toBeLessThan(0.5);
    expect(bounds.maxX).toBeGreaterThan(0.5);
    expect(bounds.minY).toBeLessThan(0.5);
    expect(bounds.maxY).toBeGreaterThan(0.5);
    expect(bounds.centroidX).toBeGreaterThan(0.4);
    expect(bounds.centroidX).toBeLessThan(0.6);
    expect(bounds.centroidY).toBeGreaterThan(0.4);
    expect(bounds.centroidY).toBeLessThan(0.6);
  });
});
