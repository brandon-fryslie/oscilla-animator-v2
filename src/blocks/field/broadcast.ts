/**
 * Broadcast Block
 *
 * Broadcasts a signal value to all elements of a field.
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../../core/ids';
import { payloadStride, type PayloadType, requireInst } from '../../core/canonical-types';
import { unitVar, payloadVar, inferType, inferField } from '../../core/inference-types';
import { DOMAIN_SHAPE } from '../../core/domain-registry';
import { rewriteFieldType } from '../layout/_helpers';

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
  loweringPurity: 'pure',
  cardinality: {
    cardinalityMode: 'transform',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'requireBroadcastExpr',
    domainType: DOMAIN_SHAPE,  // Broadcast works with any domain (uses inferred instance)
  },
  adapterSpec: {
    from: { payload: 'any', unit: 'any', extent: 'any' },
    to: { payload: 'same', unit: 'same', extent: 'any' },
    inputPortId: 'signal',
    outputPortId: 'field',
    description: 'Broadcast signal to field',
    purity: 'pure',
    stability: 'stable',
    priority: 100,
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
    signal: { label: 'Signal', type: inferType(payloadVar('broadcast_payload'), unitVar('broadcast_in')) },
  },
  outputs: {
    field: { label: 'Field', type: inferField(payloadVar('broadcast_payload'), unitVar('broadcast_in'), { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
  },
  lower: ({ ctx, inputsById }) => {
    // Get resolved payload type from ctx.outTypes (populated from pass1 portTypes)
    let outType = ctx.outTypes[0];
    if (!outType) {
      throw new Error(`Broadcast block missing resolved output type from pass1`);
    }
    // Rewrite placeholder instanceId with the actual instance from upstream context
    if (ctx.inferredInstance) {
      outType = rewriteFieldType(outType, ctx.inferredInstance, ctx.b);
    }
    const signalValue = inputsById.signal;
    const isSignalValue = signalValue && 'type' in signalValue && requireInst(signalValue.type.extent.temporality, 'temporality').kind === 'continuous';
    if (!signalValue || !isSignalValue) {
      throw new Error('Broadcast signal input must be a signal');
    }

    const stride = payloadStride(outType.payload);

    // For multi-component signals (vec2, vec3, color), pass component IDs
    // so the materializer can evaluate each component separately
    const fieldId = ctx.b.broadcast(
      signalValue.id,
      outType,
      signalValue.components && signalValue.components.length > 1
        ? signalValue.components
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
