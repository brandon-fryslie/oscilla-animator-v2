/**
 * UnitDelay Block
 *
 * Delays input by one frame.
 */

import { registerBlock, type LowerResult } from '../registry';
import { canonicalType, payloadStride, requireInst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { stableStateId } from '../../compiler/ir/types';
import { defaultSourceConst } from '../../types';
import type { StateSlotId } from '../../compiler/ir/Indices';

registerBlock({
  type: 'UnitDelay',
  label: 'Unit Delay',
  category: 'signal',
  description: 'Delays input by one frame',
  form: 'primitive',
  capability: 'state',
  isStateful: true,  // Allows feedback cycles - reads from previous frame
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'Input', type: canonicalType(FLOAT), defaultSource: defaultSourceConst(0) },
    initialValue: { type: canonicalType(FLOAT), value: 0, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Output', type: canonicalType(FLOAT) },
  },
  // Phase 1: Generate output (reading from state) without needing input resolved
  lowerOutputsOnly: ({ ctx, config }) => {
    const initialValue = (config?.initialValue as number) ?? 0;
    const outType = ctx.outTypes[0];

    // Allocate state slot (will be reused in phase 2)
    const stateId = stableStateId(ctx.instanceId, 'delay');
    const stateSlot = ctx.b.allocStateSlot(stateId, { initialValue });

    // Read previous state (this is the output - delayed by 1 frame)
    const outputId = ctx.b.stateRead(stateSlot, canonicalType(FLOAT));

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { id: outputId, slot, type: outType, stride: payloadStride(outType.payload) },
      },
      stateSlot, // Pass to phase 2
    };
  },
  // Phase 2: Generate state write step using resolved input
  lower: ({ ctx, inputsById, config, existingOutputs }): LowerResult => {
    const input = inputsById.in;
    const isInputSignal = input && 'type' in input && requireInst(input.type.extent.temporality, 'temporality').kind === 'continuous';
    if (!input || !isInputSignal) {
      throw new Error('UnitDelay requires signal input');
    }

    // If called from two-phase lowering, reuse existing outputs and state slot
    if (existingOutputs?.outputsById && existingOutputs?.stateSlot !== undefined) {
      // Write current input to state for next frame
      ctx.b.stepStateWrite(existingOutputs.stateSlot as StateSlotId, input.id);
      // Return the existing outputs (already registered in phase 1)
      return {
        outputsById: existingOutputs.outputsById,
      };
    }

    // Single-pass lowering (for non-cycle usage)
    const initialValue = (config?.initialValue as number) ?? 0;
    const outType = ctx.outTypes[0];

    // Create state for delayed value
    const stateId = stableStateId(ctx.instanceId, 'delay');
    const stateSlot = ctx.b.allocStateSlot(stateId, { initialValue });

    // Read previous state (this is the output - delayed by 1 frame)
    const outputId = ctx.b.stateRead(stateSlot, canonicalType(FLOAT));

    // Write current input to state for next frame
    ctx.b.stepStateWrite(stateSlot, input.id);

    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { id: outputId, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
