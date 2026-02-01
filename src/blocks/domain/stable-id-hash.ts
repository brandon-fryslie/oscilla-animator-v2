/**
 * StableIdHash Block
 *
 * Generates stable random values from domain element IDs.
 */

import { registerBlock } from '../registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../../core/ids';
import { canonicalType, canonicalField, payloadStride, FLOAT, INT } from '../../core/canonical-types';
import { defaultSourceConst } from '../../types';

registerBlock({
  type: 'StableIdHash',
  label: 'Stable ID Hash',
  category: 'domain',
  description: 'Generates stable random values from domain element IDs',
  form: 'primitive',
  capability: 'identity',
  cardinality: {
    cardinalityMode: 'fieldOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'disallowSignalMix',
  },
  inputs: {
    domain: { label: 'Domain', type: canonicalType(FLOAT) },
    seed: { type: canonicalType(INT), value: 0, defaultSource: defaultSourceConst(0), exposedAsPort: true, uiHint: { kind: 'slider', min: 0, max: 1000, step: 1 } },
  },
  outputs: {
    rand: { label: 'Random [0,1]', type: canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
    id01: { label: 'ID [0,1]', type: canonicalField(FLOAT, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
  },
  lower: ({ ctx, config }) => {
    const seed = (config?.seed as number) ?? 0;

    // Get instance context from Array block or inferred from inputs
    const instance = ctx.inferredInstance ?? ctx.instance;
    if (!instance) {
      throw new Error('StableIdHash requires instance context');
    }

    const randType = ctx.outTypes[0];
    const id01Type = ctx.outTypes[1];

    // Create field expressions that map instance index to random values
    // Use intrinsic to get instance-specific values
    const randField = ctx.b.intrinsic('randomId', randType);
    const id01Field = ctx.b.intrinsic('normalizedIndex', id01Type);

    const randSlot = ctx.b.allocSlot();
    const id01Slot = ctx.b.allocSlot();

    return {
      outputsById: {
        rand: { id: randField, slot: randSlot, type: randType, stride: payloadStride(randType.payload) },
        id01: { id: id01Field, slot: id01Slot, type: id01Type, stride: payloadStride(id01Type.payload) },
      },
    };
  },
});
