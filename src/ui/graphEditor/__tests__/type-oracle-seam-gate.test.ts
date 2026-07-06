/**
 * type-oracle-seam-gate — the seam's coupling gate.
 *
 * The point of the TypeOracle seam is that the editor's wiring gate never reasons
 * about types in an era's own language — it asks the neutral oracle "can these
 * connect?" and renders the verdict. This test enforces that mechanically for the
 * consumer this ticket converted: GraphEditorCore reaches its wire verdict through
 * the oracle seam and imports no era-specific type surface (the V1
 * `semanticQueries` gate, `InferenceCanonicalType`, or the pillar scene port kinds)
 * — proving it went THROUGH the seam rather than keeping a private type opinion.
 *
 * SCOPE: this is the type-oracle seam's gate, not the whole editor's. Other files
 * in `src/ui` still read era-specific type surfaces for OTHER concerns owned by
 * sibling seams — the connection picker / context menus (candidate enumeration),
 * edge decorations (lenses), the inspectors, and the info popovers' richer detail.
 * Reseating those onto this oracle is each of those tickets' job; fusing them here
 * would be a decomposition error. The provider files (V1TypeOracle, SceneTypeOracle)
 * are where the era-specific surfaces legitimately live — behind the seam.
 * [LAW:decomposition] [LAW:single-enforcer] [LAW:verifiable-goals]
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// This file lives at src/ui/graphEditor/__tests__; the converted consumer is a sibling.
const GRAPH_EDITOR = join(__dirname, '..');

function read(rel: string): string {
  return readFileSync(join(GRAPH_EDITOR, rel), 'utf8');
}

const CONVERTED_CONSUMER = 'GraphEditorCore.tsx';

/** Era-specific type surfaces a UI consumer must not import — it goes through the oracle. */
const FORBIDDEN_IMPORT_PATTERNS: readonly RegExp[] = [
  /from\s+['"][^'"]*authoring\/semanticQueries['"]/,
  /from\s+['"][^'"]*core\/inference-types['"]/,
  /from\s+['"][^'"]*scene\/port-compatibility['"]/,
  /from\s+['"][^'"]*scene\/scene-block['"]/,
];

describe('TypeOracle seam — coupling gate', () => {
  it('the converted consumer imports no era-specific type surface', () => {
    const src = read(CONVERTED_CONSUMER);
    const offenders = FORBIDDEN_IMPORT_PATTERNS.filter((re) => re.test(src)).map((re) => re.source);
    expect(offenders).toEqual([]);
  });

  it('the converted consumer reaches its wire verdict through the oracle seam', () => {
    const src = read(CONVERTED_CONSUMER);
    expect(/from\s+['"]\.\/type-oracle['"]/.test(src)).toBe(true);
  });
});
