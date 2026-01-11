/**
 * Signal Blocks
 *
 * Blocks that produce and transform scalar signals.
 */

import { registerBlock } from './registry';
import { registerBlockType } from '../compiler/ir/lowerTypes';
import { signalType } from '../core/canonical-types';

// =============================================================================
// ConstFloat
// =============================================================================

registerBlock({
  type: 'ConstFloat',
  label: 'Constant Float',
  category: 'signal',
  description: 'Outputs a constant float value',
  form: 'primitive',
  capability: 'pure',
  inputs: [],
  outputs: [
    { id: 'out', label: 'Output', type: signalType('float') },
  ],
  params: {
    value: 0,
  },
});

registerBlockType({
  type: 'ConstFloat',
  inputs: [],
  outputs: [
    { portId: 'out', type: signalType('float') },
  ],
  lower: ({ ctx, config }) => {
    // Get the constant value from config (block params)
    const value = (config?.value as number) ?? 0;

    // Create a constant signal
    const sigId = ctx.b.sigConst(value, signalType('float'));
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: sigId, slot },
      },
    };
  },
});

// =============================================================================
// Oscillator
// =============================================================================

registerBlock({
  type: 'Oscillator',
  label: 'Oscillator',
  category: 'signal',
  description: 'Generates waveforms (sin, cos, triangle, square, sawtooth)',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'phase', label: 'Phase', type: signalType('float') },
  ],
  outputs: [
    { id: 'out', label: 'Output', type: signalType('float') },
  ],
  params: {
    waveform: 'sin',
    amplitude: 1.0,
    offset: 0.0,
  },
});

registerBlockType({
  type: 'Oscillator',
  inputs: [
    { portId: 'phase', type: signalType('float') },
  ],
  outputs: [
    { portId: 'out', type: signalType('float') },
  ],
  lower: ({ ctx, inputsById, config }) => {
    // Get the phase input
    const phaseValue = inputsById.phase;
    if (!phaseValue || phaseValue.k !== 'sig') {
      throw new Error('Oscillator phase input must be a signal');
    }

    const waveform = (config?.waveform as string) ?? 'sin';
    const amplitude = (config?.amplitude as number) ?? 1.0;
    const offset = (config?.offset as number) ?? 0.0;

    // Create oscillator signal expression
    // For now, just use a basic wave generation
    // Real implementation would use proper IR opcodes
    const sigId = ctx.b.sigCall(
      waveform,
      [phaseValue.id],
      signalType('float')
    );

    // Apply amplitude and offset if not default
    let finalSigId = sigId;
    if (amplitude !== 1.0) {
      const ampConst = ctx.b.sigConst(amplitude, signalType('float'));
      finalSigId = ctx.b.sigCall('mul', [finalSigId, ampConst], signalType('float'));
    }
    if (offset !== 0.0) {
      const offsetConst = ctx.b.sigConst(offset, signalType('float'));
      finalSigId = ctx.b.sigCall('add', [finalSigId, offsetConst], signalType('float'));
    }

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: finalSigId, slot },
      },
    };
  },
});
