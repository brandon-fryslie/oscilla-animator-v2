/**
 * Pass 3: Time Model Pass
 *
 * Determines the time model (finite/infinite) and generates time-derived signals.
 */

import type { NormalizedPatch } from '../../graph/normalize';
import type { Block } from '../../graph/Patch';
import type { TimeModelIR, TimeSignals } from '../ir';
import { IRBuilderImpl } from '../ir/IRBuilderImpl';
import { signalType } from '../../core/canonical-types';

// =============================================================================
// Error Types
// =============================================================================

export class Pass3Error extends Error {
  constructor(
    public readonly code:
      | 'MissingTimeRoot'
      | 'MultipleTimeRoots'
      | 'InvalidDuration',
    message: string
  ) {
    super(message);
    this.name = 'Pass3Error';
  }
}

// =============================================================================
// Pass 3: Time Model
// =============================================================================

/**
 * Extract time model and generate time signals.
 *
 * @param normalized - The normalized patch from Pass 2
 * @returns Time model IR
 */
export function pass3Time(normalized: NormalizedPatch): {
  timeModel: TimeModelIR;
  timeSignals: TimeSignals;
} {
  // Find TimeRoot block
  const timeRoots = Array.from(normalized.patch.blocks.values()).filter(
    (b) => b.type === 'TimeRoot' || b.type === 'FiniteTimeRoot' || b.type === 'InfiniteTimeRoot'
  );

  if (timeRoots.length === 0) {
    throw new Pass3Error('MissingTimeRoot', 'Patch must have exactly one TimeRoot block');
  }

  if (timeRoots.length > 1) {
    throw new Pass3Error('MultipleTimeRoots', 'Patch cannot have multiple TimeRoot blocks');
  }

  const timeRoot = timeRoots[0];

  // Extract time model from TimeRoot
  const timeModel = extractTimeModel(timeRoot);

  // Generate time signals based on model
  const timeSignals = generateTimeSignals(timeModel);

  return { timeModel, timeSignals };
}

/**
 * Extract time model from TimeRoot block.
 */
function extractTimeModel(
  timeRoot: Block
): TimeModelIR {
  // For now, return infinite time model
  // TODO: Extract from block params when block lowering is implemented
  return { kind: 'infinite' };

  // THIS IS ILLEGAL - no compiler passes can have special cases per block type
  // The time model should come from the block's lowering function, not from
  // special-casing the block type in the compiler pass.
}

/**
 * Generate time signals for the time model.
 */
function generateTimeSignals(timeModel: TimeModelIR): TimeSignals {
  const builder = new IRBuilderImpl();

  // All models have tModelMs - float scalar
  const tModelMs = builder.sigTime('tMs', signalType('float'));

  // Generate phase and other time-derived signals based on model type
  if (timeModel.kind === 'finite') {
    const phaseA = builder.sigTime('phaseA', signalType('phase'));
    const phaseB = builder.sigTime('phaseB', signalType('phase'));
    const dt = builder.sigTime('dt', signalType('float'));
    const pulse = builder.sigTime('pulse', signalType('bool'));
    const progress = builder.sigTime('progress', signalType('unit'));

    return {
      tModelMs,
      phaseA,
      phaseB,
      dt,
      pulse,
      progress,
    };
  }

  // Infinite time model
  const phaseA = builder.sigTime('phaseA', signalType('phase'));
  const phaseB = builder.sigTime('phaseB', signalType('phase'));
  const dt = builder.sigTime('dt', signalType('float'));

  return {
    tModelMs,
    phaseA,
    phaseB,
    dt,
    pulse: null,
    progress: null,
  };
}
