/**
 * Broadcast Block
 *
 * Broadcasts a one-cardinality value to all elements of a field (one→many).
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';
import { payloadStride, type PayloadType } from '../../core/canonical-types';
import { unitVar, payloadVar, inferType, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { rewriteFieldType } from '../layout/_helpers';

// [LAW:one-source-of-truth] Broadcast output cardinality behavior is declared on CT/ICT.
const BROADCAST_OUT_CARD = cardinalityVar(cardinalityVarId('broadcast_field'), {
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});

/**
 * Payload-Generic, Unit-Generic broadcast block (one→many).
 *
 * Broadcasts a one-cardinality value to all elements of a field.
 * The payload type and unit are resolved by the constraint solver
 * through constraint propagation from connected ports.
 *
 * Payload-Generic Contract (per spec §1):
 * - Closed admissible payload set: float, vec3, color, int, bool, phase, unit
 * - Per-payload specialization is total
 * - No implicit coercions
 * - Deterministic resolution via payloadType param
 *
 * Unit-Generic Contract:
 * - Output unit matches input unit (via unitVar constraint)
 * - No unit conversion or adaptation applied
 */
registerBlock({
  type: 'Broadcast',
  label: 'Broadcast',
  category: 'field',
  description: 'Broadcasts a one-cardinality value to all elements (one→many, type inferred)',
  form: 'primitive',
  capability: 'pure',
  loweringPurity: 'pure',
  adapterSpec: {
    from: { payload: 'any', unit: 'any', extent: 'any' },
    to: { payload: 'same', unit: 'same', extent: 'any' },
    inputPortId: 'input',
    outputPortId: 'out',
    description: 'Broadcast one→many',
    purity: 'pure',
    stability: 'stable',
    priority: 100,
  },
  payload: {
    allowedPayloads: {
      input: ALL_CONCRETE_PAYLOADS,
      out: ALL_CONCRETE_PAYLOADS,
    },
    combinations: ALL_CONCRETE_PAYLOADS.map(p => ({
      inputs: [p] as PayloadType[],
      output: p,
    })),
    semantics: 'typeSpecific',
  },
  inputs: {
    input: { label: 'Input', type: inferType(payloadVar('broadcast_payload'), unitVar('broadcast_in')) },
  },
  outputs: {
    out: { label: 'Output', type: inferType(payloadVar('broadcast_payload'), unitVar('broadcast_in'), { cardinality: BROADCAST_OUT_CARD }) },
  },
  lower: ({ ctx, inputsById }) => {
    // Get resolved payload type from ctx.outTypes (populated from pass1 portTypes)
    let outType = ctx.outTypes[0];
    if (!outType) {
      throw new Error(`Broadcast block missing resolved output type from pass1`);
    }
    // Rewrite placeholder instanceId with the actual instance from upstream context
    if (ctx.inferredInstance) {
      outType = rewriteFieldType(outType, ctx.inferredInstance, ctx.instances);
    }
    const inputValue = inputsById.input;
    if (!inputValue) throw new Error('Broadcast input required');

    const stride = payloadStride(outType.payload);

    // For multi-component values (vec2, vec3, color), pass component IDs
    // so the materializer can evaluate each component separately
    const outId = ctx.b.broadcast(
      inputValue.id,
      outType,
      inputValue.components && inputValue.components.length > 1
        ? inputValue.components
        : undefined
    );

    return {
      outputsById: {
        out: { id: outId, slot: undefined, type: outType, stride },
      },
      effects: {
        slotRequests: [
          { portId: 'out', type: outType },
        ],
      },
      instanceContext: ctx.inferredInstance,
    };
  },
});
