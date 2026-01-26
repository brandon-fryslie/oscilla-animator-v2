/**
 * Time Root Blocks
 *
 * Blocks that define the time model for a patch.
 */

import { registerBlock } from './registry';
import { signalType, signalTypeTrigger, unitPhase01, strideOf } from '../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION } from '../core/canonical-types';

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
    periodAMs: { type: signalType(FLOAT), value: 1000, exposedAsPort: false },
    periodBMs: { type: signalType(FLOAT), value: 2000, exposedAsPort: false },
  },
  outputs: {
    tMs: { label: 'Time (ms)', type: signalType(FLOAT) },
    dt: { label: 'Delta Time', type: signalType(FLOAT) },
    // Phase outputs use float payload with phase01 unit: values in [0, 1) range representing normalized time cycles
    phaseA: { label: 'Phase A', type: signalType(FLOAT, unitPhase01()) },
    phaseB: { label: 'Phase B', type: signalType(FLOAT, unitPhase01()) },
    pulse: { label: 'Pulse', type: signalTypeTrigger(BOOL) },
    palette: { label: 'Palette', type: signalType(COLOR) },
    energy: { label: 'Energy', type: signalType(FLOAT) },
  },
  lower: ({ ctx }): import('../blocks/registry').LowerResult => {
    // TimeRoot blocks don't produce IR directly
    // Their outputs are provided by the time system (pass 3)
    // We create placeholder signals that reference the time system
    const tMs = ctx.b.sigTime('tMs', signalType(FLOAT));
    const dt = ctx.b.sigTime('dt', signalType(FLOAT));
    const phaseA = ctx.b.sigTime('phaseA', signalType(FLOAT, unitPhase01()));
    const phaseB = ctx.b.sigTime('phaseB', signalType(FLOAT, unitPhase01()));
    const pulse = ctx.b.eventPulse('InfiniteTimeRoot');
    const palette = ctx.b.sigTime('palette', signalType(COLOR));
    const energy = ctx.b.sigTime('energy', signalType(FLOAT));

    // Allocate slots for time outputs
    const tMsSlot = ctx.b.allocSlot();
    const dtSlot = ctx.b.allocSlot();
    const phaseASlot = ctx.b.allocSlot();
    const phaseBSlot = ctx.b.allocSlot();
    const pulseSlot = ctx.b.allocEventSlot(pulse);
    const paletteSlot = ctx.b.allocSlot();
    const energySlot = ctx.b.allocSlot();

    // Get output types from context
    const tMsType = ctx.outTypes[0];
    const dtType = ctx.outTypes[1];
    const phaseAType = ctx.outTypes[2];
    const phaseBType = ctx.outTypes[3];
    const paletteType = ctx.outTypes[5];
    const energyType = ctx.outTypes[6];

    return {
      outputsById: {
        tMs: { k: 'sig', id: tMs, slot: tMsSlot, type: tMsType, stride: strideOf(tMsType.payload) },
        dt: { k: 'sig', id: dt, slot: dtSlot, type: dtType, stride: strideOf(dtType.payload) },
        phaseA: { k: 'sig', id: phaseA, slot: phaseASlot, type: phaseAType, stride: strideOf(phaseAType.payload) },
        phaseB: { k: 'sig', id: phaseB, slot: phaseBSlot, type: phaseBType, stride: strideOf(phaseBType.payload) },
        pulse: { k: 'event', id: pulse, slot: pulseSlot } as any,
        palette: { k: 'sig', id: palette, slot: paletteSlot, type: paletteType, stride: strideOf(paletteType.payload) },
        energy: { k: 'sig', id: energy, slot: energySlot, type: energyType, stride: strideOf(energyType.payload) },
      },
    };
  },
});
