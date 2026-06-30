/**
 * tests/e2e/native-editor-perspective-rotation.spec.ts
 *
 * Proof for oscilla-pillars-scene-nt56.16.3: right-clicking a pivot block (one with
 * more than one downstream consumer or upstream feeder) re-roots the focused/
 * highlighted path to follow a DIFFERENT branch — without reflowing the graph.
 *
 * Builds on the chain-focus model (nt56.16.2): the lit path is now a single walk
 * through the selection following one branch at each pivot, and the perspective
 * (which branch) rotates on right-click. The canvas is a pure DOM/SVG surface
 * independent of the WebGPU preview, so this runs headless and asserts the contract
 * by reading each node's rendered opacity from the DOM. // [LAW:behavior-not-structure]
 *
 * The seeded patch fans out at `grid` so there are two distinct paths to walk:
 *
 *   grid → color  → draw    (the first branch, followed by default)
 *   grid → colorB → drawB   (the second branch, reached by rotating `grid`)
 */

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const ARTIFACT_DIR = resolve('artifacts/three-migration/nt56.16.3-perspective-rotation');

// Mirrors src/pillars/persistence.ts PILLAR_PATCH_FORMAT_VERSION and the
// PillarPatchPersistence storage key — the persisted envelope the store reads.
const PILLAR_PATCH_STORAGE_KEY = 'oscilla-pillar-patch-v1';
const PILLAR_PATCH_FORMAT_VERSION = 1;

const COLOR_CONFIG = { spread: 1, cycleSpeed: 0.2, vividness: 0.8, brightness: 0.6 };
const DRAW_CONFIG = { size: 0.08, cameraHalfExtentX: 0.6, cameraHalfExtentY: 0.6 };
const GRID_CONFIG = { rows: 4, cols: 4, spacing: 0.1, rotationPerIndex: 0.5, rotationPerTime: 2 };

// `grid` fans out to two parallel chains. Edge order makes `color` the first branch.
const FAN_OUT_PATCH = {
  blocks: [
    { id: 'grid', kind: 'generator', type: 'InstanceGrid', config: GRID_CONFIG },
    { id: 'color', kind: 'modifier', type: 'ColorCycle', config: COLOR_CONFIG },
    { id: 'draw', kind: 'intent', type: 'DrawInstances', config: DRAW_CONFIG },
    { id: 'colorB', kind: 'modifier', type: 'ColorCycle', config: COLOR_CONFIG },
    { id: 'drawB', kind: 'intent', type: 'DrawInstances', config: DRAW_CONFIG },
  ],
  edges: [
    { id: 'e0', source: 'grid', target: 'color', inputSlot: 'primary', role: 'primary' },
    { id: 'e1', source: 'color', target: 'draw', inputSlot: 'primary', role: 'primary' },
    { id: 'e2', source: 'grid', target: 'colorB', inputSlot: 'primary', role: 'primary' },
    { id: 'e3', source: 'colorB', target: 'drawB', inputSlot: 'primary', role: 'primary' },
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

/** The laid-out left position of a block's wrapper — used to prove rotation never reflows. */
function nodeLeft(page: Page, blockId: string): Promise<number> {
  return page.evaluate((id) => {
    const inner = document.querySelector(`[data-testid="native-graph-node-${id}"]`);
    const wrapper = inner?.closest('.react-flow__node') as HTMLElement | null;
    if (!wrapper) throw new Error(`node wrapper for '${id}' not found`);
    return wrapper.getBoundingClientRect().left;
  }, blockId);
}

async function clickNode(page: Page, blockId: string): Promise<void> {
  await page.getByTestId(`native-graph-node-${blockId}`).click();
}

async function rightClickNode(page: Page, blockId: string): Promise<void> {
  await page.getByTestId(`native-graph-node-${blockId}`).click({ button: 'right' });
}

test.describe('Native editor perspective rotation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ([key, blob]) => window.localStorage.setItem(key, blob),
      [
        PILLAR_PATCH_STORAGE_KEY,
        JSON.stringify({ version: PILLAR_PATCH_FORMAT_VERSION, patch: FAN_OUT_PATCH }),
      ] as const,
    );
    await page.goto('/?scenePlan=editor', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('native-graph-node-draw')).toBeVisible();
    await expect(page.getByTestId('native-graph-node-drawB')).toBeVisible();
  });

  test('right-clicking the fan-out pivot re-roots the lit path to the other branch', async ({
    page,
  }) => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });

    // Select the fan-out source. Its default focused path follows the first branch
    // (grid → color → draw); the second branch (colorB → drawB) dims.
    await clickNode(page, 'grid');
    expect(await nodeOpacity(page, 'grid'), 'selected source dimmed').toBeCloseTo(1, 1);
    expect(await nodeOpacity(page, 'color'), 'first branch dimmed before rotation').toBeCloseTo(1, 1);
    expect(await nodeOpacity(page, 'draw'), 'first branch sink dimmed before rotation').toBeCloseTo(1, 1);
    expect(await nodeOpacity(page, 'colorB'), 'second branch lit before rotation').toBeCloseTo(0.3, 1);
    expect(await nodeOpacity(page, 'drawB'), 'second branch sink lit before rotation').toBeCloseTo(0.3, 1);
    await page.getByTestId('native-graph-canvas').screenshot({ path: resolve(ARTIFACT_DIR, '01-first-branch.png') });

    // Capture positions before rotating so we can prove the overlay never reflows.
    const colorLeftBefore = await nodeLeft(page, 'color');
    const colorBLeftBefore = await nodeLeft(page, 'colorB');

    // Right-click the pivot: the perspective rotates to the second branch
    // (grid → colorB → drawB); the first branch now dims.
    await rightClickNode(page, 'grid');
    expect(await nodeOpacity(page, 'colorB'), 'second branch not lit after rotation').toBeCloseTo(1, 1);
    expect(await nodeOpacity(page, 'drawB'), 'second branch sink not lit after rotation').toBeCloseTo(1, 1);
    expect(await nodeOpacity(page, 'color'), 'first branch not dimmed after rotation').toBeCloseTo(0.3, 1);
    expect(await nodeOpacity(page, 'draw'), 'first branch sink not dimmed after rotation').toBeCloseTo(0.3, 1);
    expect(await nodeOpacity(page, 'grid'), 'pivot dimmed after rotation').toBeCloseTo(1, 1);
    await page.getByTestId('native-graph-canvas').screenshot({ path: resolve(ARTIFACT_DIR, '02-second-branch.png') });

    // Rotation is a pure overlay: positions are unchanged (no reflow).
    expect(await nodeLeft(page, 'color'), 'color reflowed on rotation').toBeCloseTo(colorLeftBefore, 0);
    expect(await nodeLeft(page, 'colorB'), 'colorB reflowed on rotation').toBeCloseTo(colorBLeftBefore, 0);

    // Rotating again wraps back to the first branch.
    await rightClickNode(page, 'grid');
    expect(await nodeOpacity(page, 'color'), 'rotation did not wrap to first branch').toBeCloseTo(1, 1);
    expect(await nodeOpacity(page, 'colorB'), 'second branch still lit after wrap').toBeCloseTo(0.3, 1);
  });
});
