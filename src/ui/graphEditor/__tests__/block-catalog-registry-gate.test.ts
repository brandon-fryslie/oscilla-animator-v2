/**
 * block-catalog-registry-gate — the seam's grep gate.
 *
 * The point of the BlockCatalog seam is that the editor's palette/insertion
 * consumers never read a backend block registry directly — they browse, define,
 * and suggest through the neutral catalog. This test enforces that mechanically
 * for the four consumers this ticket converted: each imports nothing from
 * `blocks/registry`, and each imports the neutral catalog module instead (proving
 * it went *through* the seam rather than dropping the feature).
 *
 * SCOPE: this is the catalog seam's gate, not the whole editor's. Other files in
 * `src/ui` still read the registry for OTHER concerns owned by sibling seams —
 * the type oracle (wiring compatibility), edge decorations (lenses), the
 * inspector, parameter controls, and the GraphDataAdapters' own instance
 * projection. Severing those is each of those tickets' job; fusing them here
 * would be a decomposition error. The epic-wide "no registry imports in src/ui"
 * gate lands when the last of those seams closes. [LAW:decomposition]
 * [LAW:single-enforcer] [LAW:verifiable-goals]
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, sep } from 'path';

// src/ui — this file lives at src/ui/graphEditor/__tests__.
const UI_ROOT = join(__dirname, '..', '..');

/** The consumers this seam converted — none may touch the registry any more. */
const CONVERTED_CONSUMERS = [
  join('components', 'BlockLibrary.tsx'),
  join('components', 'ConnectionPicker.tsx'),
  join('reactFlowEditor', 'menus', 'blockReplacement.ts'),
  join('reactFlowEditor', 'menus', 'BlockContextMenu.tsx'),
];

function read(rel: string): string {
  return readFileSync(join(UI_ROOT, rel), 'utf8');
}

describe('BlockCatalog seam — registry coupling gate', () => {
  it('the four converted consumers import nothing from blocks/registry', () => {
    const offenders: string[] = [];
    for (const rel of CONVERTED_CONSUMERS) {
      if (/from\s+['"][^'"]*blocks\/registry['"]/.test(read(rel))) {
        offenders.push(rel.split(sep).join('/'));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the four converted consumers browse through the neutral catalog seam', () => {
    const missing: string[] = [];
    for (const rel of CONVERTED_CONSUMERS) {
      // Each consumer must reach the catalog — directly (block-catalog) or via
      // the injected provider (BlockCatalogContext).
      if (!/graphEditor\/(block-catalog|BlockCatalogContext)/.test(read(rel))) {
        missing.push(rel.split(sep).join('/'));
      }
    }
    expect(missing).toEqual([]);
  });
});
