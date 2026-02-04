/**
 * Regression test for palette slot allocation bug.
 *
 * Bug: SYSTEM_PALETTE_SLOT (slot 0, stride=4) was being registered for evalValue,
 * causing a runtime error: "evalValue: expected stride=1 for scalar signal slot 0, got stride=4"
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
import { SYSTEM_PALETTE_SLOT } from '../ir/Indices';

describe('SYSTEM_PALETTE_SLOT reservation', () => {
  it('slot 0 should be reserved for palette (stride=4), not used by other allocations', () => {
    // Compile patch with only InfiniteTimeRoot (reproduces "New" button scenario)
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');

    if (result.kind === 'error') {
      return;
    }

    // Verify no evalValue steps reference palette slot (stride=4)
    // Events use separate EventSlot namespace, so filter for storage='value'
    const steps = result.program.schedule.steps;
    const paletteEvalSteps = steps.filter((step: any) => {
      return step.kind === 'evalValue'
        && step.target?.storage === 'value'
        && step.target?.slot === SYSTEM_PALETTE_SLOT;
    });

    // Palette slot (stride=4) should NOT have evalValue step (only stride=1 signals do)
    expect(paletteEvalSteps.length).toBe(0);

    // Verify palette slot metadata is correctly registered with stride=4
    const slotMeta = result.program.slotMeta;
    const paletteSlotMeta = slotMeta.find((m: any) => m.slot === SYSTEM_PALETTE_SLOT);
    expect(paletteSlotMeta).toBeDefined();
    expect(paletteSlotMeta?.stride).toBe(4); // COLOR has 4 components (RGBA)
  });
});
