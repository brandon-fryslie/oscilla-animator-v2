/**
 * Signal Blocks
 *
 * Blocks that produce and transform scalar signals.
 */

import { registerBlock } from './registry';
import { signalType } from '../core/canonical-types';
import { OpCode } from '../compiler/ir/types';
import type { SigExprId } from '../compiler/ir/Indices';

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
  lower: ({ ctx, inputsById, config }) => {
    // Get the phase input
    const phaseValue = inputsById.phase;
    if (!phaseValue || phaseValue.k !== 'sig') {
      throw new Error('Oscillator phase input must be a signal');
    }

    const waveform = (config?.waveform as string) ?? 'sin';
    const amplitude = (config?.amplitude as number) ?? 1.0;
    const offset = (config?.offset as number) ?? 0.0;

    // Create oscillator signal expression using sigMap
    // Map the waveform function over the phase input
    const waveFn = ctx.b.kernel(waveform); // sin, cos, etc.
    let sigId: SigExprId = ctx.b.sigMap(phaseValue.id as SigExprId, waveFn, signalType('float'));

    // Apply amplitude if not 1.0
    if (amplitude !== 1.0) {
      const ampConst = ctx.b.sigConst(amplitude, signalType('float'));
      const mulFn = ctx.b.opcode(OpCode.Mul);
      sigId = ctx.b.sigZip([sigId, ampConst], mulFn, signalType('float'));
    }

    // Apply offset if not 0.0
    if (offset !== 0.0) {
      const offsetConst = ctx.b.sigConst(offset, signalType('float'));
      const addFn = ctx.b.opcode(OpCode.Add);
      sigId = ctx.b.sigZip([sigId, offsetConst], addFn, signalType('float'));
    }

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: sigId, slot },
      },
    };
  },
});
