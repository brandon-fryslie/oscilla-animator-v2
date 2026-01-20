/**
 * Identity Blocks
 *
 * Blocks that work with domain indices and identity/hashing.
 */

import { registerBlock } from './registry';
import { signalType, signalTypeField } from '../core/canonical-types';

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
  inputs: {
    domain: { label: 'Domain', type: signalType('float') },
    seed: { value: 0, exposedAsPort: false },
  },
  outputs: {
    rand: { label: 'Random [0,1]', type: signalTypeField('float', 'default') },
    id01: { label: 'ID [0,1]', type: signalTypeField('float', 'default') },
  },
  lower: ({ ctx, config }) => {
    const seed = (config?.seed as number) ?? 0;

    // Get instance context from Array block or inferred from inputs
    const instance = ctx.inferredInstance ?? ctx.instance;
    if (!instance) {
      throw new Error('StableIdHash requires instance context');
    }

    // Create field expressions that map instance index to random values
    // Use fieldIntrinsic to get instance-specific values
    const randField = ctx.b.fieldIntrinsic(instance, 'randomId', signalTypeField('float', 'default'));
    const id01Field = ctx.b.fieldIntrinsic(instance, 'normalizedIndex', signalTypeField('float', 'default'));

    const randSlot = ctx.b.allocSlot();
    const id01Slot = ctx.b.allocSlot();

    return {
      outputsById: {
        rand: { k: 'field', id: randField, slot: randSlot },
        id01: { k: 'field', id: id01Field, slot: id01Slot },
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
  inputs: {},
  outputs: {
    index: { label: 'Index', type: signalTypeField('float', 'default') },
    indexInt: { label: 'Index (int)', type: signalTypeField('int', 'default') },
  },
  lower: ({ ctx }) => {
    // Get instance context from Array block or inferred from inputs
    const instance = ctx.inferredInstance ?? ctx.instance;
    if (!instance) {
      throw new Error('DomainIndex requires instance context');
    }

    // Create field expressions that expose instance index
    const indexField = ctx.b.fieldIntrinsic(instance, 'normalizedIndex', signalTypeField('float', 'default'));
    const indexIntField = ctx.b.fieldIntrinsic(instance, 'index', signalTypeField('int', 'default'));

    const indexSlot = ctx.b.allocSlot();
    const indexIntSlot = ctx.b.allocSlot();

    return {
      outputsById: {
        index: { k: 'field', id: indexField, slot: indexSlot },
        indexInt: { k: 'field', id: indexIntField, slot: indexIntSlot },
      },
    };
  },
});
