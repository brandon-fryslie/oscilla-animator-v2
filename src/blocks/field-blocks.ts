/**
 * Field Blocks
 *
 * Blocks that work with fields (signal arrays over domains).
 */

import { registerBlock } from './registry';
import { signalType, signalTypeField, type PayloadType } from '../core/canonical-types';
import type { SigExprId } from '../compiler/ir/Indices';

// =============================================================================
// FieldBroadcast (Polymorphic)
// =============================================================================

/**
 * Polymorphic field broadcast block.
 *
 * The input/output types are '???' (polymorphic) - resolved by the normalizer
 * based on context. When an adapter inserts this block, the normalizer will
 * resolve the type from the source (input edge) and propagate to output.
 *
 * Supported payload types: float, vec2, color, int, bool, phase, unit
 */
registerBlock({
  type: 'FieldBroadcast',
  label: 'Field Broadcast',
  category: 'field',
  description: 'Broadcasts a signal value to all elements of a field (type inferred)',
  form: 'primitive',
  capability: 'pure',
  inputs: {
    signal: { label: 'Signal', type: signalType('???') },
    payloadType: {
      type: signalType('???'),
      value: undefined,
      hidden: true,
      exposedAsPort: false,
    },
  },
  outputs: {
    field: { label: 'Field', type: signalTypeField('???', 'default') },
  },
  lower: ({ ctx, inputsById, config }) => {
    const payloadType = config?.payloadType as PayloadType | undefined;

    if (payloadType === undefined || payloadType === '???') {
      throw new Error(
        `FieldBroadcast block missing payloadType. Type must be resolved by normalizer before lowering.`
      );
    }

    const signalValue = inputsById.signal;
    if (!signalValue || signalValue.k !== 'sig') {
      throw new Error('FieldBroadcast signal input must be a signal');
    }

    // Create field broadcast operation with the resolved type
    const fieldId = ctx.b.fieldBroadcast(
      signalValue.id as SigExprId,
      signalTypeField(payloadType, 'default')
    );
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        field: { k: 'field', id: fieldId, slot },
      },
      // Propagate instance context from inputs
      // FieldBroadcast is special - it can receive instance context even though
      // it doesn't have field inputs (it's inserted by adapters in field contexts)
      instanceContext: ctx.inferredInstance,
    };
  },
});
