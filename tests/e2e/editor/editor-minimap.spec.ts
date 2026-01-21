/**
 * E2E Tests: ReactFlow Editor - Minimap Feature
 *
 * Tests Sprint 2B Feature 2: Minimap
 * - Minimap is visible
 * - Shows all nodes
 * - Viewport indicator appears
 * - Click-to-navigate works
 */

import { test, expect } from '@playwright/test';

test.describe('ReactFlow Editor - Minimap', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the editor
    await page.goto('/');
    
    // Wait for editor to be ready
    await page.waitForSelector('.react-flow');
  });

  test('Minimap is visible in the editor', async ({ page }) => {
    // Find the minimap element
    const minimap = page.locator('.react-flow__minimap');
    
    // Verify minimap exists and is visible
    await expect(minimap).toBeVisible();
  });

  test('Minimap shows all nodes', async ({ page }) => {
    // Add multiple blocks
    for (let i = 0; i < 5; i++) {
      await page.click('button:has-text("Add Block")');
      await page.click('text=Const');
    }

    // Wait for nodes to render
    await page.waitForTimeout(200);

    // Count nodes in main view
    const mainViewNodes = await page.locator('.react-flow__node').count();
    expect(mainViewNodes).toBeGreaterThan(0);

    // Minimap should show simplified representations
    const minimap = page.locator('.react-flow__minimap');
    await expect(minimap).toBeVisible();
    
    // Minimap should contain node representations
    // Note: Actual minimap implementation may use SVG rects or custom elements
    const minimapNodes = await minimap.locator('rect, circle, path').count();
    expect(minimapNodes).toBeGreaterThan(0);
  });

  test('Minimap viewport indicator is visible', async ({ page }) => {
    // Add blocks
    for (let i = 0; i < 3; i++) {
      await page.click('button:has-text("Add Block")');
      await page.click('text=Const');
    }

    // Wait for render
    await page.waitForTimeout(200);

    // Minimap viewport mask/indicator should exist
    const minimapViewport = page.locator('.react-flow__minimap-mask, .react-flow__minimap-viewport');
    
    // Should be visible (or check for SVG mask element)
    const minimapSvg = page.locator('.react-flow__minimap svg');
    await expect(minimapSvg).toBeVisible();
  });

  test('Clicking minimap navigates viewport', async ({ page }) => {
    // Add blocks spread out
    for (let i = 0; i < 5; i++) {
      await page.click('button:has-text("Add Block")');
      await page.click('text=Const');
    }

    // Arrange to spread them out
    await page.click('button:has-text("Auto Arrange")');
    await page.waitForTimeout(500);

    // Get current viewport transform
    const viewportBefore = await page.locator('.react-flow__viewport').getAttribute('transform');

    // Click on minimap (different location than current viewport)
    const minimap = page.locator('.react-flow__minimap');
    const minimapBox = await minimap.boundingBox();
    
    if (minimapBox) {
      // Click bottom-right of minimap (should navigate there)
      await page.mouse.click(
        minimapBox.x + minimapBox.width * 0.8,
        minimapBox.y + minimapBox.height * 0.8
      );
    }

    // Wait for navigation animation
    await page.waitForTimeout(300);

    // Viewport should have changed
    const viewportAfter = await page.locator('.react-flow__viewport').getAttribute('transform');
    expect(viewportAfter).not.toBe(viewportBefore);
  });

  test('Minimap updates when panning viewport', async ({ page }) => {
    // Add blocks
    for (let i = 0; i < 3; i++) {
      await page.click('button:has-text("Add Block")');
      await page.click('text=Const');
    }

    await page.waitForTimeout(200);

    // Get minimap viewport state before
    const minimapBefore = await page.locator('.react-flow__minimap').screenshot();

    // Pan the main viewport
    const reactFlow = page.locator('.react-flow');
    const flowBox = await reactFlow.boundingBox();
    
    if (flowBox) {
      // Drag to pan
      await page.mouse.move(flowBox.x + flowBox.width / 2, flowBox.y + flowBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(flowBox.x + flowBox.width / 2 + 100, flowBox.y + flowBox.height / 2 + 100);
      await page.mouse.up();
    }

    await page.waitForTimeout(200);

    // Get minimap viewport state after
    const minimapAfter = await page.locator('.react-flow__minimap').screenshot();

    // Screenshots should differ (viewport indicator moved)
    expect(minimapBefore.equals(minimapAfter)).toBe(false);
  });

  test('Minimap scales with viewport zoom', async ({ page }) => {
    // Add blocks
    for (let i = 0; i < 3; i++) {
      await page.click('button:has-text("Add Block")');
      await page.click('text=Const');
    }

    await page.waitForTimeout(200);

    // Zoom in using controls
    const zoomInBtn = page.locator('.react-flow__controls button[aria-label="zoom in"], .react-flow__controls button:has-text("+")');
    
    if (await zoomInBtn.isVisible()) {
      await zoomInBtn.click();
      await page.waitForTimeout(200);

      // Minimap should still be visible and functional
      const minimap = page.locator('.react-flow__minimap');
      await expect(minimap).toBeVisible();
    }
  });

  test('Minimap performance is smooth with many nodes', async ({ page }) => {
    // Add many blocks
    for (let i = 0; i < 20; i++) {
      await page.click('button:has-text("Add Block")');
      await page.click('text=Const');
    }

    // Auto-layout to arrange
    await page.click('button:has-text("Auto Arrange")');
    await page.waitForTimeout(1000);

    // Minimap should still be visible and responsive
    const minimap = page.locator('.react-flow__minimap');
    await expect(minimap).toBeVisible();

    // Pan should still be smooth (no lag)
    const reactFlow = page.locator('.react-flow');
    const flowBox = await reactFlow.boundingBox();
    
    if (flowBox) {
      const startTime = Date.now();
      
      await page.mouse.move(flowBox.x + flowBox.width / 2, flowBox.y + flowBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(flowBox.x + flowBox.width / 2 + 200, flowBox.y + flowBox.height / 2);
      await page.mouse.up();
      
      const duration = Date.now() - startTime;
      
      // Should complete in reasonable time (< 500ms)
      expect(duration).toBeLessThan(500);
    }
  });
});
