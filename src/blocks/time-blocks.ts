/**
 * Time Root Blocks
 *
 * Blocks that define the time model for a patch.
 */

import { registerBlock } from './registry';
import { signalType } from '../core/canonical-types';

// =============================================================================
// InfiniteTimeRoot
// =============================================================================

registerBlock({
  type: 'InfiniteTimeRoot',
  label: 'Infinite Time Root',
  category: 'time',
  description: 'Root block for patches with infinite time',
  form: 'primitive',
  capability: 'time',
  inputs: [],
  outputs: [
    { id: 'tMs', label: 'Time (ms)', type: signalType('float') },
    { id: 'phaseA', label: 'Phase A', type: signalType('float') },
    { id: 'phaseB', label: 'Phase B', type: signalType('float') },
  ],
  params: {
    periodMs: 1000,
  },
  lower: ({ ctx }) => {
    // TimeRoot blocks don't produce IR directly
    // Their outputs are provided by the time system (pass 3)
    // We create placeholder signals that reference the time system
    const tMs = ctx.b.sigTime('tMs', signalType('float'));
    const phaseA = ctx.b.sigTime('phaseA', signalType('float'));
    const phaseB = ctx.b.sigTime('phaseB', signalType('float'));

    const tMsSlot = ctx.b.allocSlot();
    const phaseASlot = ctx.b.allocSlot();
    const phaseBSlot = ctx.b.allocSlot();

    return {
      outputsById: {
        tMs: { k: 'sig', id: tMs, slot: tMsSlot },
        phaseA: { k: 'sig', id: phaseA, slot: phaseASlot },
        phaseB: { k: 'sig', id: phaseB, slot: phaseBSlot },
      },
    };
  },
});

// =============================================================================
// FiniteTimeRoot
// =============================================================================

registerBlock({
  type: 'FiniteTimeRoot',
  label: 'Finite Time Root',
  category: 'time',
  description: 'Root block for patches with finite time',
  form: 'primitive',
  capability: 'time',
  inputs: [],
  outputs: [
    { id: 'tMs', label: 'Time (ms)', type: signalType('float') },
    { id: 'phaseA', label: 'Phase A', type: signalType('float') },
    { id: 'phaseB', label: 'Phase B', type: signalType('float') },
    { id: 'progress', label: 'Progress', type: signalType('float') },
  ],
  params: {
    durationMs: 10000,
  },
  lower: ({ ctx }) => {
    // TimeRoot blocks don't produce IR directly
    // Their outputs are provided by the time system (pass 3)
    const tMs = ctx.b.sigTime('tMs', signalType('float'));
    const phaseA = ctx.b.sigTime('phaseA', signalType('float'));
    const phaseB = ctx.b.sigTime('phaseB', signalType('float'));
    const progress = ctx.b.sigTime('progress', signalType('float'));

    const tMsSlot = ctx.b.allocSlot();
    const phaseASlot = ctx.b.allocSlot();
    const phaseBSlot = ctx.b.allocSlot();
    const progressSlot = ctx.b.allocSlot();

    return {
      outputsById: {
        tMs: { k: 'sig', id: tMs, slot: tMsSlot },
        phaseA: { k: 'sig', id: phaseA, slot: phaseASlot },
        phaseB: { k: 'sig', id: phaseB, slot: phaseBSlot },
        progress: { k: 'sig', id: progress, slot: progressSlot },
      },
    };
  },
});
