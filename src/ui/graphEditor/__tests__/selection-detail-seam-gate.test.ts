/**
 * selection-detail-seam-gate — the seam's coupling gate.
 *
 * The point of the SelectionDetail seam is that the inspector never reads an era's
 * model in that era's own language — it asks the neutral provider "describe this
 * selection" and renders the answer. This test enforces that mechanically for the
 * consumers this ticket converted: the dockview panel (`BlockInspector`) and the ONE
 * neutral body it mounts (`SelectionDetailView`). Neither may read a V1 store, the
 * block registry, the frontend result store, or the lens surface directly — every
 * fact comes through `useSelectionDetail()`, every mutation through a `SelectionDetail`
 * command. [LAW:single-enforcer] [LAW:verifiable-goals]
 *
 * SCOPE: this is the selection-detail seam's gate, not the whole editor's. The
 * era-specific leaves the view mounts (InspectorExpressionField, InspectorEdgeDebugProbe)
 * and the selection hook (useEditorSelection) legitimately hold their era/store
 * coupling BEHIND the seam — that is where it belongs, exactly as V1EdgeDecorator holds
 * the lens surface behind the EdgeDecorator seam. [LAW:decomposition]
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// This file lives at src/ui/graphEditor/__tests__; the converted consumers are under src/ui.
const UI_ROOT = join(__dirname, '..', '..');

function read(rel: string): string {
  return readFileSync(join(UI_ROOT, rel), 'utf8');
}

/** The two files that render the inspector — they must speak only the neutral seam. */
const CONVERTED_CONSUMERS = ['components/BlockInspector.tsx', 'graphEditor/SelectionDetailView.tsx'];

/**
 * Era/store surfaces an inspector must not touch — it goes through SelectionDetail.
 * The fact-deriving couplings only: the V1 store hook, the block registry, the
 * frontend result store, the raw patch model, and the lens surface.
 */
const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /\buseStores\b/,
  // Any import from the stores barrel OR a concrete store module (…/stores,
  // …/stores/PatchStore, …/stores/PillarPatchStore, …). [LAW:single-enforcer]
  /from\s+['"][^'"]*\/stores(\/[^'"]+)?['"]/,
  /\bgetAnyBlockDefinition\b/,
  /\bBLOCK_DEFS_BY_TYPE\b/,
  /\bFrontendResultStore\b/,
  /from\s+['"][^'"]*\/lensUtils['"]/,
  /from\s+['"][^'"]*\/LensParamControls['"]/,
  /\.inputPorts\.get\(/,
  /\.lenses\b/,
];

describe('SelectionDetail seam — coupling gate', () => {
  for (const consumer of CONVERTED_CONSUMERS) {
    it(`${consumer} reads no era store/registry/frontend/lens surface directly`, () => {
      const src = read(consumer);
      const offenders = FORBIDDEN_PATTERNS.filter((re) => re.test(src)).map((re) => re.source);
      expect(offenders).toEqual([]);
    });
  }

  it('the neutral view reaches its facts through the seam', () => {
    const src = read('graphEditor/SelectionDetailView.tsx');
    expect(/from\s+['"]\.\/SelectionDetailContext['"]/.test(src)).toBe(true);
    expect(/useSelectionDetail\(\)/.test(src)).toBe(true);
    expect(/\.describeBlock\(|\.describeEdge\(|\.describePort\(/.test(src)).toBe(true);
  });

  it('the dockview panel mounts the neutral view, holding no era opinion', () => {
    const src = read('components/BlockInspector.tsx');
    expect(/SelectionDetailView/.test(src)).toBe(true);
  });
});
