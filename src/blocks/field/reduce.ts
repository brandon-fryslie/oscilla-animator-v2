/**
 * Reduce Block
 *
 * Reduce a field to a scalar using an aggregation operation.
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../../core/ids';
import { canonicalType, strideOf, type PayloadType, requireInst } from '../../core/canonical-types';
import { unitVar, payloadVar, inferType, inferField } from '../../core/inference-types';

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
      type: inferField(payloadVar('reduce_payload'), unitVar('reduce_in'), { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') })
    },
  },
  outputs: {
    signal: {
      label: 'Result',
      type: inferType(payloadVar('reduce_payload'), unitVar('reduce_in'))
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
    const isFieldInput = fieldInput && 'type' in fieldInput && requireInst(fieldInput.type.extent.cardinality, 'cardinality').kind === 'many';
    if (!fieldInput || !isFieldInput) {
      throw new Error('Reduce field input must be a field');
    }

    // Get operation from config (default to 'sum' if not specified)
    const op = (config?.op as 'min' | 'max' | 'sum' | 'avg') ?? 'sum';
    if (!['min', 'max', 'sum', 'avg'].includes(op)) {
      throw new Error(`Invalid reduce operation: ${op}`);
    }

    // Create reduce signal expression
    const sigId = ctx.b.reduce(
      fieldInput.id,
      op,
      canonicalType(payloadType)
    );
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        signal: { id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
      },
      // Reduce is instance-agnostic (like Broadcast)
      instanceContext: undefined,
    };
  },
});
