/**
 * Test Blocks
 *
 * Blocks used only for testing. These provide ways to capture signal values
 * that would otherwise be lazily evaluated only when consumed by render blocks.
 */

import { registerBlock } from './registry';
import { signalType } from '../core/canonical-types';
import type { SigExprId } from '../types';

// =============================================================================
// TestSignal - Captures a signal value for testing
// =============================================================================

/**
 * TestSignal block - forces evaluation of a signal and stores it to a slot.
 *
 * This block is a "sink" that ensures its input signal is evaluated during
 * frame execution. The result is stored in state.values.f64 at the allocated slot.
 *
 * Usage in tests:
 * ```typescript
 * const patch = buildPatch((b) => {
 *   b.addBlock('InfiniteTimeRoot', {});
 *   const value = b.addBlock('Const', { value: 42 });
 *   const hash = b.addBlock('Hash', {});
 *   const testSig = b.addBlock('TestSignal', {});
 *   b.wire(value, 'out', hash, 'value');
 *   b.wire(hash, 'out', testSig, 'value');
 * });
 *
 * // After compile, find the evalSig step to get the slot:
 * const schedule = program.schedule;
 * const evalSigStep = schedule.steps.find(s => s.kind === 'evalSig');
 * const slot = evalSigStep.target;
 *
 * // After executeFrame, the hash output will be in state.values.f64[slot]
 * ```
 */
registerBlock({
  type: 'TestSignal',
  label: 'Test Signal',
  category: 'test',
  description: 'Captures a signal value for testing (sink block)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'signalOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  inputs: {
    value: { label: 'Value', type: signalType('float') },
  },
  outputs: {},
  lower: ({ ctx, inputsById }) => {
    const value = inputsById.value;

    if (!value || value.k !== 'sig') {
      throw new Error('TestSignal value input must be a signal');
    }

    // Emit a StepEvalSig to force evaluation of this signal
    const slot = ctx.b.allocSlot();
    ctx.b.stepEvalSig(value.id as SigExprId, slot);

    // Sink block - no outputs
    return {
      outputsById: {},
    };
  },
});
