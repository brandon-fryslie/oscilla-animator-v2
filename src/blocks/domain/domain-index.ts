/**
 * DomainIndex Block
 *
 * Provides the normalized index [0,1] for each domain element.
 */

import { registerBlock } from '../registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../../core/ids';
import { canonicalField, payloadStride, FLOAT, INT } from '../../core/canonical-types';

registerBlock({
  type: 'DomainIndex',
  label: 'Domain Index',
  category: 'domain',
  description: 'Provides the normalized index [0,1] for each domain element',
  form: 'primitive',
  capability: 'identity',
  cardinality: {
    cardinalityMode: 'fieldOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  inputs: {},
  outputs: {
    index: { label: 'Index', type: canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
    indexInt: { label: 'Index (int)', type: canonicalField(INT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
  },
  lower: ({ ctx }) => {
    // Get instance context from Array block or inferred from inputs
    const instance = ctx.inferredInstance ?? ctx.instance;
    if (!instance) {
      throw new Error('DomainIndex requires instance context');
    }

    const indexType = ctx.outTypes[0];
    const indexIntType = ctx.outTypes[1];

    // Create field expressions that expose instance index
    const indexField = ctx.b.intrinsic('normalizedIndex', indexType);
    const indexIntField = ctx.b.intrinsic('index', indexIntType);

    const indexSlot = ctx.b.allocSlot();
    const indexIntSlot = ctx.b.allocSlot();

    return {
      outputsById: {
        index: { id: indexField, slot: indexSlot, type: indexType, stride: payloadStride(indexType.payload) },
        indexInt: { id: indexIntField, slot: indexIntSlot, type: indexIntType, stride: payloadStride(indexIntType.payload) },
      },
    };
  },
});
