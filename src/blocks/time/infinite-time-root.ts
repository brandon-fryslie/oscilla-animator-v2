/**
 * InfiniteTimeRoot Block
 *
 * Root block for patches with infinite time.
 */

import { registerBlock } from '../registry';
import { canonicalType, canonicalEvent, unitTurns, contractWrap01, payloadStride } from '../../core/canonical-types';
import { FLOAT, COLOR } from '../../core/canonical-types';
import { defaultSourceConst } from '../../types';
import { SYSTEM_PALETTE_SLOT } from '../../compiler/ir/Indices';

export function register(): void {
  registerBlock({
    type: 'InfiniteTimeRoot',
    label: 'Infinite Time Root',
    category: 'time',
    description: 'Root block for patches with infinite time',
    form: 'primitive',
    capability: 'time',
    gpuVerified: true,
    loweringPurity: 'impure',
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
    lower: ({ ctx, config }): import('../registry').LowerResult => {
      // Time root lowers like any other block and emits time model as effect data.
      const tMs = ctx.b.time('tMs', canonicalType(FLOAT));
      const dt = ctx.b.time('dt', canonicalType(FLOAT));
      const phaseA = ctx.b.time('phaseA', canonicalType(FLOAT, unitTurns(), undefined, contractWrap01()));
      const phaseB = ctx.b.time('phaseB', canonicalType(FLOAT, unitTurns(), undefined, contractWrap01()));
      const pulse = ctx.b.eventPulse('InfiniteTimeRoot');
      const palette = ctx.b.time('palette', canonicalType(COLOR));
      const energy = ctx.b.time('energy', canonicalType(FLOAT));

      const periodAMs = typeof config.periodAMs === 'number' ? config.periodAMs : 1000;
      const periodBMs = typeof config.periodBMs === 'number' ? config.periodBMs : 2000;
  
      // Palette uses the canonical reserved slot declared by the IR index contract.
      const paletteSlot = SYSTEM_PALETTE_SLOT;
  
      // Get output types
      const tMsType = ctx.outTypes[0];
      const dtType = ctx.outTypes[1];
      const phaseAType = ctx.outTypes[2];
      const phaseBType = ctx.outTypes[3];
      const pulseType = ctx.outTypes[4];
      if (!pulseType) throw new Error('InfiniteTimeRoot: frontend failed to resolve pulse output type (index 4)');
      const paletteType = ctx.outTypes[5];
      const energyType = ctx.outTypes[6];
  
      return {
        outputsById: {
          tMs: { id: tMs, slot: undefined, type: tMsType, stride: payloadStride(tMsType.payload) },
          dt: { id: dt, slot: undefined, type: dtType, stride: payloadStride(dtType.payload) },
          phaseA: { id: phaseA, slot: undefined, type: phaseAType, stride: payloadStride(phaseAType.payload) },
          phaseB: { id: phaseB, slot: undefined, type: phaseBType, stride: payloadStride(phaseBType.payload) },
          pulse: { id: pulse, slot: undefined, type: pulseType, stride: payloadStride(pulseType.payload), eventSlot: undefined },
          palette: { id: palette, slot: paletteSlot, type: paletteType, stride: payloadStride(paletteType.payload) },
          energy: { id: energy, slot: undefined, type: energyType, stride: payloadStride(energyType.payload) },
        },
        effects: {
          // [LAW:one-source-of-truth] Time model is emitted by the time root block itself.
          timeModel: { periodAMs, periodBMs },
          slotRequests: [
            { portId: 'tMs', type: tMsType },
            { portId: 'dt', type: dtType },
            { portId: 'phaseA', type: phaseAType },
            { portId: 'phaseB', type: phaseBType },
            { portId: 'pulse', type: pulseType },
            // palette uses SYSTEM_PALETTE_SLOT, not requested
            { portId: 'energy', type: energyType },
          ],
          eventSlotRequests: [
            { portId: 'pulse', eventExprId: pulse },
          ],
        },
      };
    },
  });
}
