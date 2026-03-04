/**
 * Regression test for palette slot allocation bug.
 *
 * Bug: SYSTEM_PALETTE_SLOT (slot 0, stride=4) was being scheduled as a scalar target,
 * causing stride mismatch faults for one-lane writes.
 *
 * Root causes:
 * 1. IRBuilderImpl slotCounter started at 0, so first allocSlot() returned 0 (same as SYSTEM_PALETTE_SLOT)
 * 2. InfiniteTimeRoot pulse event was hardcoded to slot 0 (should have been allocated)
 *
 * Fix:
 * 1. Reserve slot 0 by starting slotCounter at 1
 * 2. Allocate pulse event's value slot instead of hardcoding to valueSlot(0)
 */
import { describe, it, expect } from 'vitest';
import { compile } from '../compile';
import { buildPatch } from '../../graph';
import { SCALAR_INSTANCE_ID, SYSTEM_PALETTE_SLOT } from '../ir/Indices';

describe('SYSTEM_PALETTE_SLOT reservation', () => {
  it('slot 0 uses canonical scalar materialize writes with stride=4 palette metadata', () => {
    // Compile patch with only InfiniteTimeRoot (reproduces "New" button scenario)
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');

    if (result.kind === 'error') {
      return;
    }

    // [LAW:one-source-of-truth] Palette slot writes must flow through canonical
    // scalar materialize scheduling, not deprecated one-off write steps.
    const steps = result.program.schedule.steps;
    const paletteTargetSteps = steps.filter((step: any) => {
      return step.kind === 'materialize' && step.target === SYSTEM_PALETTE_SLOT;
    });

    expect(paletteTargetSteps.length).toBeGreaterThan(0);
    expect(
      paletteTargetSteps.every(
        (step: any) => step.kind === 'materialize' && step.instanceId === SCALAR_INSTANCE_ID,
      ),
    ).toBe(true);

    // Verify palette slot metadata is correctly registered with stride=4
    const slotMeta = result.program.slotMeta;
    const paletteSlotMeta = slotMeta.find((m: any) => m.slot === SYSTEM_PALETTE_SLOT);
    expect(paletteSlotMeta).toBeDefined();
    expect(paletteSlotMeta?.stride).toBe(4); // COLOR has 4 components (RGBA)
  });
});
