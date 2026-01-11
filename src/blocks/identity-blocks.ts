/**
 * Identity Blocks
 *
 * Blocks that work with domain indices and identity/hashing.
 */

import { registerBlock } from './registry';
import { registerBlockType } from '../compiler/ir/lowerTypes';
import { signalType, signalTypeField } from '../core/canonical-types';
import { domainId } from '../compiler/ir/Indices';

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
  inputs: [
    { id: 'domain', label: 'Domain', type: signalType('float') },
  ],
  outputs: [
    { id: 'rand', label: 'Random [0,1]', type: signalTypeField('float', 'default') },
    { id: 'id01', label: 'ID [0,1]', type: signalTypeField('float', 'default') },
  ],
  params: {
    seed: 0,
  },
});

registerBlockType({
  type: 'StableIdHash',
  inputs: [
    { portId: 'domain', type: signalType('float') },
  ],
  outputs: [
    { portId: 'rand', type: signalTypeField('float', 'default') },
    { portId: 'id01', type: signalTypeField('float', 'default') },
  ],
  lower: ({ ctx, config }) => {
    const seed = (config?.seed as number) ?? 0;

    // Get the domain from context
    // For now, we'll use 'default' domain ID
    const domain = domainId('default');

    // Create field expressions that map domain index to random values
    // Use fieldSource to get domain-specific values
    const randField = ctx.b.fieldSource(domain, 'idRand', signalTypeField('float', 'default'));
    const id01Field = ctx.b.fieldSource(domain, 'normalizedIndex', signalTypeField('float', 'default'));

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
  inputs: [],
  outputs: [
    { id: 'index', label: 'Index', type: signalTypeField('float', 'default') },
    { id: 'indexInt', label: 'Index (int)', type: signalTypeField('int', 'default') },
  ],
});

registerBlockType({
  type: 'DomainIndex',
  inputs: [],
  outputs: [
    { portId: 'index', type: signalTypeField('float', 'default') },
    { portId: 'indexInt', type: signalTypeField('int', 'default') },
  ],
  lower: ({ ctx }) => {
    // Get the domain from context
    // For now, we'll use 'default' domain ID
    const domain = domainId('default');

    // Create field expressions that expose domain index
    const indexField = ctx.b.fieldSource(domain, 'normalizedIndex', signalTypeField('float', 'default'));
    const indexIntField = ctx.b.fieldSource(domain, 'index', signalTypeField('int', 'default'));

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
