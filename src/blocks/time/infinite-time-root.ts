/**
 * InfiniteTimeRoot Block
 *
 * Root block for patches with infinite time.
 */

import { registerBlock } from '../registry';
import { canonicalType, canonicalEvent, unitTurns, contractWrap01, payloadStride } from '../../core/canonical-types';
import { FLOAT, COLOR } from '../../core/canonical-types';
import { defaultSourceConst } from '../../types';
import { valueSlot, SYSTEM_PALETTE_SLOT } from '../../compiler/ir/Indices';

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
    periodAMs: { type: canonicalType(FLOAT), defaultValue: 1000, defaultSource: defaultSourceConst(1000), exposedAsPort: true, uiHint: { kind: 'slider', min: 100, max: 10000, step: 100 } },
    periodBMs: { type: canonicalType(FLOAT), defaultValue: 2000, defaultSource: defaultSourceConst(2000), exposedAsPort: true, uiHint: { kind: 'slider', min: 100, max: 10000, step: 100 } },
  },
  outputs: {
    tMs: { label: 'Time (ms)', type: canonicalType(FLOAT) },
    dt: { label: 'Delta Time', type: canonicalType(FLOAT) },
    // Phase outputs use float payload with phase01 unit: values in [0, 1) range representing normalized time cycles
    phaseA: { label: 'Phase A', type: canonicalType(FLOAT, unitTurns(), undefined, contractWrap01()) },
    phaseB: { label: 'Phase B', type: canonicalType(FLOAT, unitTurns(), undefined, contractWrap01()) },
    pulse: { label: 'Pulse', type: canonicalEvent() },
    palette: { label: 'Palette', type: canonicalType(COLOR) },
    energy: { label: 'Energy', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx }): import('../registry').LowerResult => {
    // TimeRoot blocks don't produce IR directly
    // Their outputs are provided by the time system (pass 3)
    // We create placeholder signals that reference the time system
    const tMs = ctx.b.time('tMs', canonicalType(FLOAT));
    const dt = ctx.b.time('dt', canonicalType(FLOAT));
    const phaseA = ctx.b.time('phaseA', canonicalType(FLOAT, unitTurns(), undefined, contractWrap01()));
    const phaseB = ctx.b.time('phaseB', canonicalType(FLOAT, unitTurns(), undefined, contractWrap01()));
    const pulse = ctx.b.eventPulse('InfiniteTimeRoot');
    const palette = ctx.b.time('palette', canonicalType(COLOR));
    const energy = ctx.b.time('energy', canonicalType(FLOAT));

    // Allocate slots for time outputs
    const tMsSlot = ctx.b.allocSlot();
    const dtSlot = ctx.b.allocSlot();
    const phaseASlot = ctx.b.allocSlot();
    const phaseBSlot = ctx.b.allocSlot();
    const pulseEventSlot = ctx.b.allocEventSlot(pulse);
    const paletteSlot = SYSTEM_PALETTE_SLOT;
    ctx.b.registerSlotType(paletteSlot, canonicalType(COLOR));
    const energySlot = ctx.b.allocSlot();

    // Get output types from context (positionally matches outputs declaration order:
    // tMs=0, dt=1, phaseA=2, phaseB=3, pulse=4, palette=5, energy=6)
    const tMsType = ctx.outTypes[0];
    const dtType = ctx.outTypes[1];
    const phaseAType = ctx.outTypes[2];
    const phaseBType = ctx.outTypes[3];
    const pulseType = ctx.outTypes[4] ?? canonicalEvent();
    const paletteType = ctx.outTypes[5];
    const energyType = ctx.outTypes[6];

    return {
      outputsById: {
        tMs: { id: tMs, slot: tMsSlot, type: tMsType, stride: payloadStride(tMsType.payload) },
        dt: { id: dt, slot: dtSlot, type: dtType, stride: payloadStride(dtType.payload) },
        phaseA: { id: phaseA, slot: phaseASlot, type: phaseAType, stride: payloadStride(phaseAType.payload) },
        phaseB: { id: phaseB, slot: phaseBSlot, type: phaseBType, stride: payloadStride(phaseBType.payload) },
        pulse: { id: pulse, slot: valueSlot(0), type: pulseType, stride: payloadStride(pulseType.payload), eventSlot: pulseEventSlot },
        palette: { id: palette, slot: paletteSlot, type: paletteType, stride: payloadStride(paletteType.payload) },
        energy: { id: energy, slot: energySlot, type: energyType, stride: payloadStride(energyType.payload) },
      },
    };
  },
});
