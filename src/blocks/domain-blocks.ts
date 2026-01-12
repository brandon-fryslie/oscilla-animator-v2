/**
 * Domain Blocks
 *
 * Blocks that define computation domains.
 */

import { registerBlock } from './registry';

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
  capability: 'pure',
  inputs: [],
  outputs: [],
  params: {
    n: 100,
    seed: 0,
  },
  lower: ({ ctx, config }) => {
    const n = (config?.n as number) ?? 100;
    const seed = (config?.seed as number) ?? 0;

    // Register domain with the builder
    ctx.b.createDomain('n', n, { seed });

    return {
      outputsById: {},
    };
  },
});
