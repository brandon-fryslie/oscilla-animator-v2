/**
 * Field Blocks
 *
 * Blocks that work with fields (signal arrays over domains).
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from './registry';
import { canonicalType, signalTypeField, strideOf, type PayloadType, unitVar, payloadVar } from '../core/canonical-types';
import type { SigExprId, FieldExprId } from '../compiler/ir/Indices';

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
    signal: { label: 'Signal', type: canonicalType(payloadVar('broadcast_payload'), unitVar('broadcast_in')) },
  },
  outputs: {
    field: { label: 'Field', type: signalTypeField(payloadVar('broadcast_payload'), 'default', unitVar('broadcast_in')) },
  },
  lower: ({ ctx, inputsById }) => {
    // Get resolved payload type from ctx.outTypes (populated from pass1 portTypes)
    const outType = ctx.outTypes[0];
    if (!outType) {
      throw new Error(`Broadcast block missing resolved output type from pass1`);
    }
    const payloadType = outType.payload as PayloadType;

    const signalValue = inputsById.signal;
    if (!signalValue || signalValue.k !== 'sig') {
      throw new Error('Broadcast signal input must be a signal');
    }

    // Create field broadcast operation with the resolved type
    const fieldId = ctx.b.Broadcast(
      signalValue.id as SigExprId,
      signalTypeField(payloadType, 'default')
    );
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

// =============================================================================
// Reduce (Payload-Generic)
// =============================================================================

/**
 * Payload-Generic field reduction block.
 * 
 * Reduces a field to a scalar signal using an aggregation operation.
 * Supports componentwise reduction for structured types (e.g., vec2).
 * 
 * Operations:
 * - sum: Σ(field[i]) per component
 * - avg: Σ(field[i]) / count per component
 * - min: min(field) per component
 * - max: max(field) per component
 * 
 * Empty field behavior: Returns 0
 * NaN behavior: Propagates NaN if any element is NaN
 * 
 * Spec: 02-block-system.md:436, 04-compilation.md:394
 */
registerBlock({
  type: 'Reduce',
  label: 'Reduce',
  category: 'field',
  description: 'Reduce a field to a scalar using an aggregation operation',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'transform',
    laneCoupling: 'laneCoupled',
    broadcastPolicy: 'disallowSignalMix',
  },
  payload: {
    allowedPayloads: {
      field: ALL_CONCRETE_PAYLOADS,
      signal: ALL_CONCRETE_PAYLOADS,
    },
    combinations: ALL_CONCRETE_PAYLOADS.map(p => ({
      inputs: [p] as PayloadType[],
      output: p,
    })),
    semantics: 'typeSpecific',
  },
  inputs: {
    field: { 
      label: 'Field', 
      type: signalTypeField(payloadVar('reduce_payload'), 'default', unitVar('reduce_in'))
    },
  },
  outputs: {
    signal: { 
      label: 'Result', 
      type: canonicalType(payloadVar('reduce_payload'), unitVar('reduce_in'))
    },
  },
  lower: ({ ctx, inputsById, config }) => {
    // Get resolved output type from pass1
    const outType = ctx.outTypes[0];
    if (!outType) {
      throw new Error(`Reduce block missing resolved output type from pass1`);
    }
    const payloadType = outType.payload as PayloadType;

    // Get field input
    const fieldInput = inputsById.field;
    if (!fieldInput || fieldInput.k !== 'field') {
      throw new Error('Reduce field input must be a field');
    }

    // Get operation from config (default to 'sum' if not specified)
    const op = (config?.op as 'min' | 'max' | 'sum' | 'avg') ?? 'sum';
    if (!['min', 'max', 'sum', 'avg'].includes(op)) {
      throw new Error(`Invalid reduce operation: ${op}`);
    }

    // Create reduce signal expression
    const sigId = ctx.b.ReduceField(
      fieldInput.id as FieldExprId,
      op,
      canonicalType(payloadType)
    );
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        signal: { k: 'sig', id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
      },
      // Reduce is instance-agnostic (like Broadcast)
      instanceContext: undefined,
    };
  },
});
