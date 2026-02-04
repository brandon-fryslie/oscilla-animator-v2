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

registerBlock({
  type: 'UnitDelay',
  label: 'Unit Delay',
  category: 'signal',
  description: 'Delays input by one frame',
  form: 'primitive',
  capability: 'state',
  loweringPurity: 'stateful',
  isStateful: true,  // Allows feedback cycles - reads from previous frame
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'Input', type: canonicalType(FLOAT), defaultSource: defaultSourceConst(0) },
    initialValue: { type: canonicalType(FLOAT), defaultValue: 0, exposedAsPort: false },
  },
  outputs: {
    out: { label: 'Output', type: canonicalType(FLOAT) },
  },
  // Phase 1: Generate output (reading from state) without needing input resolved
  lowerOutputsOnly: ({ ctx, config }) => {
    const initialValue = (config?.initialValue as number) ?? 0;
    const outType = ctx.outTypes[0];

    // Symbolic state key (will be reused in phase 2)
    const stateKey = stableStateId(ctx.instanceId, 'delay');

    // Read previous state (this is the output - delayed by 1 frame, symbolic key)
    const outputId = ctx.b.stateRead(stateKey, canonicalType(FLOAT));

    // Phase 1: declare state and output slot, but NO step request yet (phase 2 writes to state)
    return {
      outputsById: {
        out: { id: outputId, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        stateDecls: [
          { key: stateKey, initialValue },
        ],
        stepRequests: [], // Phase 2 will add the state write
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
      stateSlot: stateKey as any, // Pass symbolic key to phase 2 (temporary compatibility)
    };
  },
  // Phase 2: Generate state write step using resolved input
  lower: ({ ctx, inputsById, config, existingOutputs }): LowerResult => {
    const input = inputsById.in;
    const isInputSignal = input && 'type' in input && requireInst(input.type.extent.temporality, 'temporality').kind === 'continuous';
    if (!input || !isInputSignal) {
      throw new Error('UnitDelay requires signal input');
    }

    // If called from two-phase lowering, reuse existing outputs and add state write effect
    if (existingOutputs?.outputsById && existingOutputs?.stateSlot !== undefined) {
      const stateKey = existingOutputs.stateSlot as any; // Symbolic key passed from phase 1
      // Return existing outputs with additional step request for state write
      return {
        outputsById: existingOutputs.outputsById,
        effects: {
          stepRequests: [
            { kind: 'stateWrite' as const, stateKey, value: input.id },
          ],
        },
      };
    }

    // Single-pass lowering (for non-cycle usage)
    const initialValue = (config?.initialValue as number) ?? 0;
    const outType = ctx.outTypes[0];

    // Symbolic state key
    const stateKey = stableStateId(ctx.instanceId, 'delay');

    // Read previous state (this is the output - delayed by 1 frame, symbolic key)
    const outputId = ctx.b.stateRead(stateKey, canonicalType(FLOAT));

    // Return effects-as-data (no imperative calls)
    return {
      outputsById: {
        out: { id: outputId, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        stateDecls: [
          { key: stateKey, initialValue },
        ],
        stepRequests: [
          { kind: 'stateWrite' as const, stateKey, value: input.id },
        ],
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
    };
  },
});
