/**
 * Time Root Blocks
 *
 * Blocks that define the time model for a patch.
 */

import { registerBlock } from './registry';
import { signalType, signalTypeTrigger, unitPhase01 } from '../core/canonical-types';

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
  cardinality: {
    cardinalityMode: 'signalOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  inputs: {
    periodAMs: { type: signalType('float'), value: 1000, exposedAsPort: false },
    periodBMs: { type: signalType('float'), value: 2000, exposedAsPort: false },
  },
  outputs: {
    tMs: { label: 'Time (ms)', type: signalType('float') },
    dt: { label: 'Delta Time', type: signalType('float') },
    // Phase outputs use float payload with phase01 unit: values in [0, 1) range representing normalized time cycles
    phaseA: { label: 'Phase A', type: signalType('float', unitPhase01()) },
    phaseB: { label: 'Phase B', type: signalType('float', unitPhase01()) },
    pulse: { label: 'Pulse', type: signalTypeTrigger('bool') },
    palette: { label: 'Palette', type: signalType('color') },
    energy: { label: 'Energy', type: signalType('float') },
  },
  lower: ({ ctx }) => {
    // TimeRoot blocks don't produce IR directly
    // Their outputs are provided by the time system (pass 3)
    // We create placeholder signals that reference the time system
    const tMs = ctx.b.sigTime('tMs', signalType('float'));
    const dt = ctx.b.sigTime('dt', signalType('float'));
    const phaseA = ctx.b.sigTime('phaseA', signalType('float', unitPhase01()));
    const phaseB = ctx.b.sigTime('phaseB', signalType('float', unitPhase01()));
    const pulse = ctx.b.eventPulse('timeRoot');
    const palette = ctx.b.sigTime('palette', signalType('color'));
    const energy = ctx.b.sigTime('energy', signalType('float'));

    const tMsSlot = ctx.b.allocSlot();
    const dtSlot = ctx.b.allocSlot();
    const phaseASlot = ctx.b.allocSlot();
    const phaseBSlot = ctx.b.allocSlot();
    const pulseSlot = ctx.b.allocEventSlot(pulse);
    const paletteSlot = ctx.b.allocSlot();
    const energySlot = ctx.b.allocSlot();

    return {
      outputsById: {
        tMs: { k: 'sig', id: tMs, slot: tMsSlot },
        dt: { k: 'sig', id: dt, slot: dtSlot },
        phaseA: { k: 'sig', id: phaseA, slot: phaseASlot },
        phaseB: { k: 'sig', id: phaseB, slot: phaseBSlot },
        pulse: { k: 'event', id: pulse, slot: pulseSlot },
        palette: { k: 'sig', id: palette, slot: paletteSlot },
        energy: { k: 'sig', id: energy, slot: energySlot },
      },
    };
  },
});
