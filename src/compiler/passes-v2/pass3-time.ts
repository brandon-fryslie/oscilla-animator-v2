/**
 * Pass 3: Time Model Pass
 *
 * Determines the time model (finite/infinite) and generates time-derived signals.
 */

import type { Block } from '../../graph/Patch';
import type { TimeModelIR, TimeSignals, TypedPatch, TimeResolvedPatch } from '../ir';
import { IRBuilderImpl } from '../ir/IRBuilderImpl';
import { signalType } from '../../core/canonical-types';

// =============================================================================
// Error Types
// =============================================================================

export class Pass3Error extends Error {
  constructor(
    public readonly code:
      | 'NoTimeRoot'
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
 * @param typedPatch - The typed patch from Pass 2
 * @returns Time-resolved patch with time model and signals
 */
export function pass3Time(typedPatch: TypedPatch): TimeResolvedPatch {
  // Find TimeRoot block
  const timeRoots = Array.from(typedPatch.patch.blocks.values()).filter(
    (b) => b.type === 'TimeRoot' || b.type === 'FiniteTimeRoot' || b.type === 'InfiniteTimeRoot'
  );

  if (timeRoots.length === 0) {
    throw new Pass3Error('NoTimeRoot', 'Patch must have exactly one TimeRoot block');
  }

  if (timeRoots.length > 1) {
    throw new Pass3Error('MultipleTimeRoots', 'Patch cannot have multiple TimeRoot blocks');
  }

  const timeRoot = timeRoots[0];

  // Extract time model from TimeRoot
  const timeModel = extractTimeModel(timeRoot);

  // Generate time signals based on model
  const timeSignals = generateTimeSignals(timeModel);

  return {
    ...typedPatch,
    timeModel,
    timeSignals,
  };
}

/**
 * Extract time model from TimeRoot block.
 *
 * Note: This reads from block params which are set by the block definition.
 * The time model kind is determined by the block type (FiniteTimeRoot vs InfiniteTimeRoot)
 * but parameters like duration come from block params.
 */
function extractTimeModel(
  timeRoot: Block
): TimeModelIR {
  // Determine time model from block type
  if (timeRoot.type === 'FiniteTimeRoot') {
    // Finite time model - extract duration from params
    const durationMs = (timeRoot.params?.durationMs as number) ?? 5000;
    return {
      kind: 'finite',
      durationMs,
    };
  }

  // Default to infinite time model
  return { kind: 'infinite' };
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
