/**
 * Field Blocks
 *
 * Blocks that work with fields (signal arrays over domains).
 */

import { registerBlock } from './registry';
import { registerBlockType } from '../compiler/ir/lowerTypes';
import { signalType, signalTypeField } from '../core/canonical-types';
import type { SigExprId } from '../compiler/ir/Indices';

// =============================================================================
// FieldBroadcast
// =============================================================================

registerBlock({
  type: 'FieldBroadcast',
  label: 'Field Broadcast',
  category: 'field',
  description: 'Broadcasts a signal value to all elements of a field',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'signal', label: 'Signal', type: signalType('float') },
  ],
  outputs: [
    { id: 'field', label: 'Field', type: signalTypeField('float', 'default') },
  ],
});

registerBlockType({
  type: 'FieldBroadcast',
  inputs: [
    { portId: 'signal', type: signalType('float') },
  ],
  outputs: [
    { portId: 'field', type: signalTypeField('float', 'default') },
  ],
  lower: ({ ctx, inputsById }) => {
    // Get the signal input
    const signalValue = inputsById.signal;
    if (!signalValue || signalValue.k !== 'sig') {
      throw new Error('FieldBroadcast signal input must be a signal');
    }

    // Create field broadcast operation
    const fieldId = ctx.b.fieldBroadcast(signalValue.id as SigExprId, signalTypeField('float', 'default'));
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        field: { k: 'field', id: fieldId, slot },
      },
    };
  },
});
