/**
 * tests/e2e/native-editor-chain-focus.spec.ts
 *
 * Proof for oscilla-pillars-scene-nt56.16.2: selecting a block in the native graph
 * canvas focuses its dataflow chain — the selected block plus its transitive
 * upstream/downstream are full opacity while every unrelated block dims to ~30% —
 * and arrow keys step the selection along the chain.
 *
 * The graph canvas is a pure DOM/SVG surface independent of the WebGPU preview, so
 * this runs headless and asserts the dimming/traversal CONTRACT by reading each
 * node's rendered opacity and selection ring from the DOM. // [LAW:behavior-not-structure]
 *
 * The patch is seeded into localStorage before boot (PillarPatchStore loads it),
 * shaped with a disconnected second branch so there is genuinely something to dim:
 *
 *   grid → color → draw      (the main chain)
 *   gridB → colorB           (a parallel branch, off every node's chain in 'draw')
 */

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const ARTIFACT_DIR = resolve('artifacts/three-migration/nt56.16.2-chain-focus');

// Mirrors src/pillars/persistence.ts PILLAR_PATCH_FORMAT_VERSION and the
// PillarPatchPersistence storage key — the persisted envelope the store reads.
const PILLAR_PATCH_STORAGE_KEY = 'oscilla-pillar-patch-v1';
const PILLAR_PATCH_FORMAT_VERSION = 1;

const BRANCHY_PATCH = {
  blocks: [
    { id: 'grid', kind: 'generator', type: 'InstanceGrid', config: { rows: 4, cols: 4, spacing: 0.1, rotationPerIndex: 0.5, rotationPerTime: 2 } },
    { id: 'color', kind: 'modifier', type: 'ColorCycle', config: { spread: 1, cycleSpeed: 0.2, vividness: 0.8, brightness: 0.6 } },
    { id: 'draw', kind: 'intent', type: 'DrawInstances', config: { size: 0.08, cameraHalfExtentX: 0.6, cameraHalfExtentY: 0.6 } },
    { id: 'gridB', kind: 'generator', type: 'InstanceGrid', config: { rows: 4, cols: 4, spacing: 0.1, rotationPerIndex: 0.5, rotationPerTime: 2 } },
    { id: 'colorB', kind: 'modifier', type: 'ColorCycle', config: { spread: 1, cycleSpeed: 0.2, vividness: 0.8, brightness: 0.6 } },
  ],
  edges: [
    { id: 'e0', source: 'grid', target: 'color', inputSlot: 'primary', role: 'primary' },
    { id: 'e1', source: 'color', target: 'draw', inputSlot: 'primary', role: 'primary' },
    { id: 'e2', source: 'gridB', target: 'colorB', inputSlot: 'primary', role: 'primary' },
  ],
};

/** Computed opacity of a block's `.react-flow__node` wrapper (where node.style lands). */
function nodeOpacity(page: Page, blockId: string): Promise<number> {
  return page.evaluate((id) => {
    const inner = document.querySelector(`[data-testid="native-graph-node-${id}"]`);
    const wrapper = inner?.closest('.react-flow__node');
    if (!wrapper) throw new Error(`node wrapper for '${id}' not found`);
    return Number.parseFloat(getComputedStyle(wrapper).opacity);
  }, blockId);
}

/** Whether a block's wrapper carries the selection ring (a non-'none' box-shadow). */
function nodeHasRing(page: Page, blockId: string): Promise<boolean> {
  return page.evaluate((id) => {
    const inner = document.querySelector(`[data-testid="native-graph-node-${id}"]`);
    const wrapper = inner?.closest('.react-flow__node');
    if (!wrapper) throw new Error(`node wrapper for '${id}' not found`);
    return getComputedStyle(wrapper).boxShadow !== 'none';
  }, blockId);
}

async function clickNode(page: Page, blockId: string): Promise<void> {
  await page.getByTestId(`native-graph-node-${blockId}`).click();
}

test.describe('Native editor chain focus', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ([key, blob]) => window.localStorage.setItem(key, blob),
      [
        PILLAR_PATCH_STORAGE_KEY,
        JSON.stringify({ version: PILLAR_PATCH_FORMAT_VERSION, patch: BRANCHY_PATCH }),
      ] as const,
    );
    await page.goto('/?scenePlan=editor', { waitUntil: 'domcontentloaded' });
    // All five seeded blocks must lay out before we probe focus behavior.
    await expect(page.getByTestId('native-graph-node-draw')).toBeVisible();
    await expect(page.getByTestId('native-graph-node-colorB')).toBeVisible();
  });

  test('selecting a block dims the unrelated branch and rings the selection', async ({ page }) => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });

    // With nothing selected, every block is full opacity — dimming hides nothing.
    for (const id of ['grid', 'color', 'draw', 'gridB', 'colorB']) {
      expect(await nodeOpacity(page, id), `${id} dimmed before any selection`).toBeCloseTo(1, 1);
    }
    await page.getByTestId('native-graph-canvas').screenshot({ path: resolve(ARTIFACT_DIR, '01-no-selection.png') });

    // Select the sink: its chain is {grid, color, draw}; the gridB→colorB branch
    // is on neither side of it, so that branch dims to ~30%.
    await clickNode(page, 'draw');
    expect(await nodeOpacity(page, 'draw'), 'selected sink dimmed').toBeCloseTo(1, 1);
    expect(await nodeOpacity(page, 'color'), 'upstream feeder dimmed').toBeCloseTo(1, 1);
    expect(await nodeOpacity(page, 'grid'), 'transitive upstream feeder dimmed').toBeCloseTo(1, 1);
    expect(await nodeOpacity(page, 'gridB'), 'off-chain branch not dimmed').toBeCloseTo(0.3, 1);
    expect(await nodeOpacity(page, 'colorB'), 'off-chain branch not dimmed').toBeCloseTo(0.3, 1);
    expect(await nodeHasRing(page, 'draw'), 'selected block missing its ring').toBe(true);
    expect(await nodeHasRing(page, 'color'), 'unselected block wrongly ringed').toBe(false);
    await page.getByTestId('native-graph-canvas').screenshot({ path: resolve(ARTIFACT_DIR, '02-draw-selected.png') });
  });

  test('arrow keys step the selection upstream and downstream along the chain', async ({ page }) => {
    await clickNode(page, 'draw');
    expect(await nodeHasRing(page, 'draw')).toBe(true);

    // ArrowLeft walks toward sources: draw → color → grid.
    await page.keyboard.press('ArrowLeft');
    expect(await nodeHasRing(page, 'color'), 'ArrowLeft did not move selection to the feeder').toBe(true);
    expect(await nodeHasRing(page, 'draw'), 'old selection still ringed after step').toBe(false);

    await page.keyboard.press('ArrowLeft');
    expect(await nodeHasRing(page, 'grid'), 'ArrowLeft did not reach the source').toBe(true);

    // At the source there is no further upstream — selection holds.
    await page.keyboard.press('ArrowLeft');
    expect(await nodeHasRing(page, 'grid'), 'ArrowLeft past the source moved selection').toBe(true);

    // ArrowRight walks back toward the sink: grid → color → draw.
    await page.keyboard.press('ArrowRight');
    expect(await nodeHasRing(page, 'color'), 'ArrowRight did not move selection downstream').toBe(true);
    await page.keyboard.press('ArrowRight');
    expect(await nodeHasRing(page, 'draw'), 'ArrowRight did not reach the sink').toBe(true);
  });
});
