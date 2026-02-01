/**
 * FromDomainId Block
 *
 * Generates normalized (0..1) ID for each element in a domain.
 */

import { registerBlock } from '../registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../../core/ids';
import { canonicalType, canonicalField, payloadStride } from '../../core/canonical-types';
import { FLOAT, INT } from '../../core/canonical-types';

registerBlock({
  type: 'FromDomainId',
  label: 'From Domain ID',
  category: 'field',
  description: 'Generates normalized (0..1) ID for each element in a domain',
  form: 'primitive',
  capability: 'identity',
  cardinality: {
    cardinalityMode: 'fieldOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  inputs: {
    domain: { label: 'Domain', type: canonicalType(INT) }, // Domain count
  },
  outputs: {
    id01: { label: 'ID (0..1)', type: canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
  },
  lower: ({ ctx }) => {
    // Get instance context from Array block or inferred from inputs
    const instance = ctx.inferredInstance ?? ctx.instance;
    if (!instance) {
      throw new Error('FromDomainId requires instance context');
    }

    const outType = ctx.outTypes[0];
    // Use intrinsic to get normalized index (0..1) for each instance element
    const id01Field = ctx.b.intrinsic('normalizedIndex', outType);
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        id01: { id: id01Field, slot, type: outType, stride: payloadStride(outType.payload) },
      },
      // Propagate instance context
      instanceContext: instance,
    };
  },
});
