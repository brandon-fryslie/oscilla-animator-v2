/**
 * Field Blocks
 *
 * Blocks that work with fields (signal arrays over domains).
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from './registry';
import { signalType, signalTypeField, strideOf, type PayloadType, unitVar, payloadVar } from '../core/canonical-types';
import type { SigExprId } from '../compiler/ir/Indices';

// =============================================================================
// Broadcast (Payload-Generic)
// =============================================================================

/**
 * Payload-Generic, Unit-Generic field broadcast block.
 *
 * Broadcasts a signal value to all elements of a field.
 * The payload type and unit are resolved by pass1 constraint solver
 * through constraint propagation from connected ports.
 *
 * Payload-Generic Contract (per spec §1):
 * - Closed admissible payload set: float, vec3, color, int, bool, phase, unit
 * - Per-payload specialization is total
 * - No implicit coercions
 * - Deterministic resolution via payloadType param
 *
 * Unit-Generic Contract:
 * - Output unit matches input signal unit (via unitVar constraint)
 * - No unit conversion or adaptation applied
 */
registerBlock({
  type: 'Broadcast',
  label: 'Broadcast',
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
    signal: { label: 'Signal', type: signalType(payloadVar('broadcast_payload'), unitVar('broadcast_in')) },
    payloadType: {
      type: signalType('float'),
      value: undefined,
      hidden: true,
      exposedAsPort: false,
    },
  },
  outputs: {
    field: { label: 'Field', type: signalTypeField(payloadVar('broadcast_payload'), 'default', unitVar('broadcast_in')) },
  },
  lower: ({ ctx, inputsById, config }) => {
    const payloadType = config?.payloadType as PayloadType | undefined;

    if (payloadType === undefined) {
      throw new Error(
        `Broadcast block missing payloadType. Type must be resolved by normalizer before lowering.`
      );
    }

    const signalValue = inputsById.signal;
    if (!signalValue || signalValue.k !== 'sig') {
      throw new Error('Broadcast signal input must be a signal');
    }

    // Create field broadcast operation with the resolved type
    const fieldId = ctx.b.Broadcast(
      signalValue.id as SigExprId,
      signalTypeField(payloadType, 'default')
    );
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        field: { k: 'field', id: fieldId, slot, type: outType, stride: strideOf(outType.payload) },
      },
      // Propagate instance context from inputs
      // Broadcast is special - it can receive instance context even though
      // it doesn't have field inputs (it's inserted by adapters in field contexts)
      instanceContext: ctx.inferredInstance,
    };
  },
});
