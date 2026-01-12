/**
 * Domain Blocks
 *
 * Blocks that define computation domains.
 */

import { registerBlock } from './registry';
import { signalType, signalTypeField } from '../core/canonical-types';
import { domainId } from '../compiler/ir/Indices';

// =============================================================================
// GridDomain
// =============================================================================

registerBlock({
  type: 'GridDomain',
  label: 'Grid Domain',
  category: 'domain',
  description: 'Creates a 2D grid domain with rows and columns',
  form: 'primitive',
  capability: 'pure',
  inputs: [],
  outputs: [],
  params: {
    rows: 4,
    cols: 4,
  },
  lower: ({ ctx, config }) => {
    const rows = (config?.rows as number) ?? 4;
    const cols = (config?.cols as number) ?? 4;
    const count = rows * cols;

    // Register domain with the builder
    ctx.b.createDomain('grid', count, { rows, cols });

    return {
      outputsById: {},
    };
  },
});

// =============================================================================
// DomainN
// =============================================================================

registerBlock({
  type: 'DomainN',
  label: 'Domain N',
  category: 'domain',
  description: 'Creates a 1D domain with N elements',
  form: 'primitive',
  capability: 'identity',
  inputs: [],
  outputs: [
    { id: 'domain', label: 'Domain', type: signalType('int') },
    { id: 'rand', label: 'Random', type: signalTypeField('float', 'default') },
  ],
  params: {
    n: 100,
    seed: 0,
  },
  lower: ({ ctx, config }) => {
    const n = (config?.n as number) ?? 100;
    const seed = (config?.seed as number) ?? 0;

    // Register domain with the builder
    ctx.b.createDomain('n', n, { seed });

    // Create domain count signal
    const domainCountSig = ctx.b.sigConst(n, signalType('int'));
    const domainSlot = ctx.b.allocSlot();

    // Create per-element random field (idRand gives stable random values per element)
    const domain = domainId('default');
    const randField = ctx.b.fieldSource(domain, 'idRand', signalTypeField('float', 'default'));
    const randSlot = ctx.b.allocSlot();

    return {
      outputsById: {
        domain: { k: 'sig', id: domainCountSig, slot: domainSlot },
        rand: { k: 'field', id: randField, slot: randSlot },
      },
    };
  },
});
