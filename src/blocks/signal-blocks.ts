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

// =============================================================================
// UnitDelay - z^-1 delay block
// =============================================================================

registerBlock({
  type: 'UnitDelay',
  label: 'Unit Delay (z^-1)',
  category: 'signal',
  description: 'Delays signal by one frame. Output on frame N = input from frame N-1',
  form: 'primitive',
  capability: 'state',
  inputs: [
    { id: 'in', label: 'Input', type: signalType('float') },
  ],
  outputs: [
    { id: 'out', label: 'Output', type: signalType('float') },
  ],
  params: {
    initialValue: 0,
  },
  lower: ({ ctx, inputsById, config }) => {
    // Get the input signal
    const input = inputsById.in;
    if (!input || input.k !== 'sig') {
      throw new Error('UnitDelay input must be a signal');
    }

    const initialValue = (config?.initialValue as number) ?? 0;

    // Allocate persistent state slot (initialized to initialValue)
    const stateSlot = ctx.b.allocStateSlot(initialValue);

    // Read previous value FIRST (before any writes in this frame)
    const prevId = ctx.b.sigStateRead(stateSlot, signalType('float'));

    // Schedule write of current input for end of frame
    // This will be written in Phase 2 of ScheduleExecutor
    ctx.b.stepStateWrite(stateSlot, input.id as SigExprId);

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: prevId, slot },
      },
    };
  },
});

// =============================================================================
// Hash - Deterministic hash function
// =============================================================================

registerBlock({
  type: 'Hash',
  label: 'Hash',
  category: 'signal',
  description: 'Deterministic hash function for seeded randomness. Output in [0, 1)',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'value', label: 'Value', type: signalType('float') },
    { id: 'seed', label: 'Seed', type: signalType('float'), optional: true },
  ],
  outputs: [
    { id: 'out', label: 'Output', type: signalType('float') },
  ],
  params: {},
  lower: ({ ctx, inputsById }) => {
    // Get required value input
    const value = inputsById.value;
    if (!value || value.k !== 'sig') {
      throw new Error('Hash value input must be a signal');
    }

    // Get optional seed input (default to 0 if not connected)
    const seedInput = inputsById.seed;
    let seedId: SigExprId;
    if (seedInput && seedInput.k === 'sig') {
      seedId = seedInput.id as SigExprId;
    } else {
      seedId = ctx.b.sigConst(0, signalType('float'));
    }

    // Apply hash opcode (already implemented in OpcodeInterpreter)
    const hashFn = ctx.b.opcode(OpCode.Hash);
    const hashId = ctx.b.sigZip([value.id as SigExprId, seedId], hashFn, signalType('float'));

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: hashId, slot },
      },
    };
  },
});

// =============================================================================
// Id01 - Normalized element ID
// =============================================================================

registerBlock({
  type: 'Id01',
  label: 'Normalized ID',
  category: 'signal',
  description: 'Normalize index by count: output = index / count. Safe division handles count=0',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'index', label: 'Index', type: signalType('float') },
    { id: 'count', label: 'Count', type: signalType('float') },
  ],
  outputs: [
    { id: 'out', label: 'Output', type: signalType('float') },
  ],
  params: {},
  lower: ({ ctx, inputsById }) => {
    // Get required inputs
    const index = inputsById.index;
    const count = inputsById.count;

    if (!index || index.k !== 'sig') {
      throw new Error('Id01 index input must be a signal');
    }
    if (!count || count.k !== 'sig') {
      throw new Error('Id01 count input must be a signal');
    }

    // Safe division: index / max(count, 1)
    // This ensures we never divide by zero
    const one = ctx.b.sigConst(1, signalType('float'));
    const maxFn = ctx.b.opcode(OpCode.Max);
    const safeCount = ctx.b.sigZip([count.id as SigExprId, one], maxFn, signalType('float'));

    // Divide index by safe count
    const divFn = ctx.b.opcode(OpCode.Div);
    const normalized = ctx.b.sigZip([index.id as SigExprId, safeCount], divFn, signalType('float'));

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: normalized, slot },
      },
    };
  },
});
