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

// [LAW:one-source-of-truth] Broadcast output field behavior is declared on CT/ICT.
const BROADCAST_FIELD_CARD = cardinalityVar(cardinalityVarId('broadcast_field'), {
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});

/**
 * Payload-Generic, Unit-Generic field broadcast block.
 *
 * Broadcasts a one-cardinality value to all elements of a field.
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
 * - Output unit matches input one-cardinality unit (via unitVar constraint)
 * - No unit conversion or adaptation applied
 */
export function register(): void {
  registerBlock({
    type: 'Broadcast',
    label: 'Broadcast',
    category: 'field',
    description: 'Broadcasts a one-cardinality value to all elements of a field (type inferred)',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    adapterSpec: {
      from: { payload: 'any', unit: 'any', extent: 'any' },
      to: { payload: 'same', unit: 'same', extent: 'any' },
      inputPortId: 'one',
      outputPortId: 'field',
      description: 'Broadcast one to field',
      purity: 'pure',
      stability: 'stable',
      priority: 100,
    },
    payload: {
      allowedPayloads: {
        one: ALL_CONCRETE_PAYLOADS,
        field: ALL_CONCRETE_PAYLOADS,
      },
      combinations: ALL_CONCRETE_PAYLOADS.map(p => ({
        inputs: [p] as PayloadType[],
        output: p,
      })),
      semantics: 'typeSpecific',
    },
    inputs: {
      one: { label: 'One', type: inferType(payloadVar('broadcast_payload'), unitVar('broadcast_in')) },
    },
    outputs: {
      field: { label: 'Field', type: inferType(payloadVar('broadcast_payload'), unitVar('broadcast_in'), { cardinality: BROADCAST_FIELD_CARD }) },
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
      const oneValue = inputsById.one;
      if (!oneValue) throw new Error('Broadcast input required');
  
      const stride = payloadStride(outType.payload);
  
      // For multi-component one-cardinality values (vec2, vec3, color), pass component IDs
      // so the materializer can evaluate each component separately
      const fieldId = ctx.b.broadcast(
        oneValue.id,
        outType,
        oneValue.components && oneValue.components.length > 1
          ? oneValue.components
          : undefined
      );
  
      return {
        outputsById: {
          field: { id: fieldId, slot: undefined, type: outType, stride },
        },
        effects: {
          slotRequests: [
            { portId: 'field', type: outType },
          ],
        },
        instanceContext: ctx.inferredInstance,
      };
    },
  });
}
