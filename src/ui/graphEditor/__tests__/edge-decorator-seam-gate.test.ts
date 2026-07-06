/**
 * edge-decorator-seam-gate — the seam's coupling gate.
 *
 * The point of the EdgeDecorator seam is that the shared edge renderer never reads
 * an era's transform machinery in that era's own language — it asks the neutral
 * decorator "what decorates this edge?" and paints the chips + param editor from the
 * answer. This test enforces that mechanically for the consumer this ticket
 * converted: OscillaEdge (the single edge type GraphEditorCore registers for BOTH
 * boots) reaches its decorations through the seam and imports no V1 lens surface —
 * no `lensUtils`, no `LensParamControls`, and none of the `inputPorts…lenses`
 * direct-store bypass it used before.
 *
 * SCOPE: this is the edge-decorator seam's gate, not the whole editor's. Other files
 * still read the lens model for OTHER concerns owned by sibling tickets — the edge
 * inspector's lens management (inspector-panels ticket), lens chain growth
 * (scene-adapters). Reseating those is each ticket's job; the provider files
 * (V1EdgeDecorator) are where the lens surface legitimately lives — behind the seam.
 * [LAW:decomposition] [LAW:single-enforcer] [LAW:verifiable-goals]
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// This file lives at src/ui/graphEditor/__tests__; the converted consumer is under src/ui/reactFlowEditor.
const UI_ROOT = join(__dirname, '..', '..');

function read(rel: string): string {
  return readFileSync(join(UI_ROOT, rel), 'utf8');
}

const CONVERTED_CONSUMER = 'reactFlowEditor/OscillaEdge.tsx';

/** V1 lens surfaces a UI consumer must not touch — it goes through the decorator. */
const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /from\s+['"][^'"]*\/lensUtils['"]/,
  /from\s+['"][^'"]*\/LensParamControls['"]/,
  // The former direct-store bypass: reading lenses off a port on the patch model.
  /inputPorts\.get\(/,
  /\.lenses\b/,
];

describe('EdgeDecorator seam — coupling gate', () => {
  it('the converted consumer imports no V1 lens surface', () => {
    const src = read(CONVERTED_CONSUMER);
    const offenders = FORBIDDEN_PATTERNS.filter((re) => re.test(src)).map((re) => re.source);
    expect(offenders).toEqual([]);
  });

  it('the converted consumer reaches its decorations through the seam', () => {
    const src = read(CONVERTED_CONSUMER);
    expect(/from\s+['"][^'"]*\/edge-decorations['"]/.test(src)).toBe(true);
    expect(/decorator\.decorations\(/.test(src)).toBe(true);
  });
});
