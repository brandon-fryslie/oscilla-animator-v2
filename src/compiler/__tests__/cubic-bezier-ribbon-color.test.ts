/**
 * CubicBezierRibbon2D per-instance color field tests.
 *
 * Verifies that many-cardinality color fields compile and lower through the
 * render materialization pipeline without requiring scalar workarounds.
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';
import type { ScheduleIR } from '../backend/schedule-program';
import { ShapeClass } from '../../shapes/types';

describe('CubicBezierRibbon2D per-instance color', () => {
  it('compiles with scalar color input (one → broadcast)', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');

      const render = b.addBlock('CubicBezierRibbon2D');
      // All defaults — color wired from default source (scalar Const)
      void render;
    });

    const result = compile(patch);
    if (result.kind === 'error') {
      throw new Error(`Compile failed: ${result.errors.map((e) => e.message).join(', ')}`);
    }

    const schedule = result.program.schedule as ScheduleIR;
    const renderStep = schedule.steps.find((s) => s.kind === 'render');
    expect(renderStep).toBeDefined();
    if (!renderStep || renderStep.kind !== 'render') return;

    expect(renderStep.colorSlot).toBeDefined();

    // Verify a materialize step targets the color slot
    const materializedSlots = new Set(
      schedule.steps
        .filter((s): s is Extract<ScheduleIR['steps'][number], { kind: 'materialize' }> => s.kind === 'materialize')
        .map((s) => s.target as number),
    );
    expect(materializedSlots.has(renderStep.colorSlot as number)).toBe(true);
  });

  it('compiles with per-instance (many) color field from MakeColorOKLCH', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');

      // Create an Array to provide instance context
      const ellipse = b.addBlock('Ellipse');
      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 4);
      b.wire(ellipse, 'shape', array, 'element');

      // Per-instance hue from Array.t → MakeColorOKLCH → ribbon.color
      const color = b.addBlock('MakeColorOKLCH');
      b.wire(array, 't', color, 'h');

      const render = b.addBlock('CubicBezierRibbon2D');
      b.wire(color, 'color', render, 'color');
    });

    const result = compile(patch);
    if (result.kind === 'error') {
      throw new Error(`Compile failed: ${result.errors.map((e) => e.message).join(', ')}`);
    }

    const schedule = result.program.schedule as ScheduleIR;
    const renderStep = schedule.steps.find((s) => s.kind === 'render');
    expect(renderStep).toBeDefined();
    if (!renderStep || renderStep.kind !== 'render') return;

    expect(renderStep.colorSlot).toBeDefined();

    // Verify color slot is materialized
    const materializedSlots = new Set(
      schedule.steps
        .filter((s): s is Extract<ScheduleIR['steps'][number], { kind: 'materialize' }> => s.kind === 'materialize')
        .map((s) => s.target as number),
    );
    expect(materializedSlots.has(renderStep.colorSlot as number)).toBe(true);

    // Verify SoA packing for color descriptor
    const colorDesc = result.program.runtimeAddressTable.slotToArena.get(renderStep.colorSlot);
    expect(colorDesc?.packing).toBe('soa');
    expect(colorDesc?.stride).toBe(4); // COLOR = 4 components (HCLA)
  });

  it('classifies shape as Type2Parametric', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      b.addBlock('CubicBezierRibbon2D');
    });

    const result = compile(patch);
    if (result.kind === 'error') {
      throw new Error(`Compile failed: ${result.errors.map((e) => e.message).join(', ')}`);
    }

    // Verify the draw-prep program classifies this as Type2Parametric
    const sinks = result.program.drawPrepProgram?.sinks ?? [];
    expect(sinks.length).toBeGreaterThan(0);
    expect(sinks[0].shapeClass).toBe(ShapeClass.Type2Parametric);
  });
});
