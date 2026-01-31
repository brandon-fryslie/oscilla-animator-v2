/**
 * Identity Blocks
 *
 * Blocks that work with domain indices and identity/hashing.
 */

import { registerBlock } from './registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../core/ids';
import { canonicalType, canonicalField, strideOf } from '../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION } from '../core/canonical-types';
import { defaultSourceConst } from '../types';

// =============================================================================
// StableIdHash
// =============================================================================

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
    // Use fieldIntrinsic to get instance-specific values
    const randField = ctx.b.fieldIntrinsic('randomId', randType);
    const id01Field = ctx.b.fieldIntrinsic('normalizedIndex', id01Type);

    const randSlot = ctx.b.allocSlot();
    const id01Slot = ctx.b.allocSlot();

    return {
      outputsById: {
        rand: { k: 'field', id: randField, slot: randSlot, type: randType, stride: strideOf(randType.payload) },
        id01: { k: 'field', id: id01Field, slot: id01Slot, type: id01Type, stride: strideOf(id01Type.payload) },
      },
    };
  },
});

// =============================================================================
// DomainIndex
// =============================================================================

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
    const indexField = ctx.b.fieldIntrinsic('normalizedIndex', indexType);
    const indexIntField = ctx.b.fieldIntrinsic('index', indexIntType);

    const indexSlot = ctx.b.allocSlot();
    const indexIntSlot = ctx.b.allocSlot();

    return {
      outputsById: {
        index: { k: 'field', id: indexField, slot: indexSlot, type: indexType, stride: strideOf(indexType.payload) },
        indexInt: { k: 'field', id: indexIntField, slot: indexIntSlot, type: indexIntType, stride: strideOf(indexIntType.payload) },
      },
    };
  },
});
