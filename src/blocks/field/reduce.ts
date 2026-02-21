/**
 * Reduce Block
 *
 * Reduce a field to a scalar using an aggregation operation.
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS, requireConfigEnum } from '../registry';
import { canonicalType, payloadStride, type PayloadType, requireInst, INT } from '../../core/canonical-types';
import { unitVar, payloadVar, inferType, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { DOMAIN_SHAPE } from '../../core/domain-registry';
import { defaultSourceConst } from '../../types';

// [LAW:one-source-of-truth] Reduce input cardinality behavior is declared on CT/ICT.
const REDUCE_FIELD_INPUT_CARD = cardinalityVar(cardinalityVarId('reduce_field_input'), {
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'Reduce',
  label: 'Reduce',
  category: 'field',
  description: 'Reduce a field to a scalar using an aggregation operation',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'transform',
    laneCoupling: 'laneCoupled',
    broadcastPolicy: 'disallowSignalMix',
    domainType: DOMAIN_SHAPE,  // Reduce works with any domain (consumes from inferred instance)
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
      type: inferType(payloadVar('reduce_payload'), unitVar('reduce_in'), { cardinality: REDUCE_FIELD_INPUT_CARD })
    },
    op: {
      label: 'Operation',
      type: canonicalType(INT),
      defaultValue: 'sum',
      defaultSource: defaultSourceConst(0),
      exposedAsPort: false,
      uiHint: {
        kind: 'select',
        options: [
          { value: 'sum', label: 'Sum' },
          { value: 'avg', label: 'Average' },
          { value: 'min', label: 'Min' },
          { value: 'max', label: 'Max' },
        ],
      },
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

    const op = requireConfigEnum(config!, 'op', ['min', 'max', 'sum', 'avg'] as const);

    // Create reduce signal expression
    const sigId = ctx.b.reduce(
      fieldInput.id,
      op,
      canonicalType(payloadType)
    );

    return {
      outputsById: {
        signal: { id: sigId, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'signal', type: outType },
        ],
      },
      instanceContext: undefined,
    };
  },
});
