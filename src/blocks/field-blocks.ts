/**
 * Field Blocks
 *
 * Blocks that work with fields (signal arrays over domains).
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from './registry';
import { signalType, signalTypeField, type PayloadType } from '../core/canonical-types';
import type { SigExprId } from '../compiler/ir/Indices';

// =============================================================================
// FieldBroadcast (Payload-Generic)
// =============================================================================

/**
 * Payload-Generic field broadcast block.
 *
 * Broadcasts a signal value to all elements of a field.
 * The payload type is resolved by pass0-polymorphic-types based on
 * the source signal. The resolved type is stored in `payloadType`.
 *
 * Payload-Generic Contract (per spec §1):
 * - Closed admissible payload set: float, vec2, color, int, bool, phase, unit
 * - Per-payload specialization is total
 * - No implicit coercions
 * - Deterministic resolution via payloadType param
 */
registerBlock({
  type: 'FieldBroadcast',
  label: 'Field Broadcast',
  category: 'field',
  description: 'Broadcasts a signal value to all elements of a field (type inferred)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'transform',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'requireBroadcastExpr',
  },
  payload: {
    allowedPayloads: {
      signal: ALL_CONCRETE_PAYLOADS,
      field: ALL_CONCRETE_PAYLOADS,
    },
    combinations: ALL_CONCRETE_PAYLOADS.map(p => ({
      inputs: [p] as PayloadType[],
      output: p,
    })),
    semantics: 'typeSpecific',
  },
  inputs: {
    signal: { label: 'Signal', type: signalType('float') },
    payloadType: {
      type: signalType('float'),
      value: undefined,
      hidden: true,
      exposedAsPort: false,
    },
  },
  outputs: {
    field: { label: 'Field', type: signalTypeField('float', 'default') },
  },
  lower: ({ ctx, inputsById, config }) => {
    const payloadType = config?.payloadType as PayloadType | undefined;

    if (payloadType === undefined) {
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
