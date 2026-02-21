/**
 * StableIdHash Block
 *
 * Generates stable random values from domain element IDs.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, FLOAT, INT } from '../../core/canonical-types';
import { inferType, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { defaultSourceConst } from '../../types';

// [LAW:one-source-of-truth] StableIdHash field outputs declare their cardinality policy on CT/ICT.
const STABLE_ID_HASH_CARD = cardinalityVar(cardinalityVarId('stable_id_hash_fields'), {
  relation: 'uniform',
  acceptance: 'manyOnly',
  instanceBinding: 'inherit',
});

registerBlock({
  type: 'StableIdHash',
  label: 'Stable ID Hash',
  category: 'domain',
  description: 'Generates stable random values from domain element IDs',
  form: 'primitive',
  capability: 'identity',
  loweringPurity: 'pure',
  inputs: {
    domain: { label: 'Domain', type: canonicalType(FLOAT) },
    seed: { type: canonicalType(INT), defaultValue: 0, defaultSource: defaultSourceConst(0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1000, step: 1 } },
  },
  outputs: {
    rand: { label: 'Random [0,1]', type: inferType(FLOAT, { kind: 'none' }, { cardinality: STABLE_ID_HASH_CARD }) },
    id01: { label: 'ID [0,1]', type: inferType(FLOAT, { kind: 'none' }, { cardinality: STABLE_ID_HASH_CARD }) },
  },
  lower: ({ ctx }) => {
    // Get instance context from Array block or inferred from inputs
    const instance = ctx.inferredInstance;
    if (!instance) throw new Error('StableIdHash: instance inference failed — field block requires inferredInstance');

    const randType = ctx.outTypes[0];
    const id01Type = ctx.outTypes[1];

    // Create field expressions that map instance index to random values
    // Use intrinsic to get instance-specific values
    const randField = ctx.b.intrinsic('randomId', randType);
    const id01Field = ctx.b.intrinsic('normalizedIndex', id01Type);

    // Slot will be allocated by orchestrator
    // Slot will be allocated by orchestrator

    return {
      outputsById: {
        rand: { id: randField, slot: undefined, type: randType, stride: payloadStride(randType.payload) },
        id01: { id: id01Field, slot: undefined, type: id01Type, stride: payloadStride(id01Type.payload) },
      },
      effects: {
        slotRequests: [
          { portId: 'rand', type: randType },
          { portId: 'id01', type: id01Type },
        ],
      },
    };
  },
});
