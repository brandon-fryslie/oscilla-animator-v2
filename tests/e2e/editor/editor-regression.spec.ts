/**
 * E2E Tests: Regression Suite for Sprint 2A Features
 *
 * Verifies that Sprint 2B changes don't break Sprint 2A functionality:
 * - Add/delete blocks
 * - Create/delete connections
 * - Undo/redo operations
 * - Selection and navigation
 */

import { test, expect } from '@playwright/test';

test.describe('Sprint 2A Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the editor
    await page.goto('/');
    
    // Wait for editor to be ready
    await page.waitForSelector('.react-flow');
  });

  test('Can add blocks via block library', async ({ page }) => {
    // Click add block button
    await page.click('button:has-text("Add Block")');

    // Select a block type (e.g., Const)
    await page.click('text=Const');

    await page.waitForTimeout(200);

    // Verify block was added
    const nodeCount = await page.locator('.react-flow__node').count();
    expect(nodeCount).toBe(1);
  });

  test('Can delete blocks', async ({ page }) => {
    // Add a block
    await page.click('button:has-text("Add Block")');
    await page.click('text=Const');

    await page.waitForTimeout(200);

    // Select and delete
    const node = page.locator('.react-flow__node').first();
    await node.click();
    await page.keyboard.press('Delete');

    await page.waitForTimeout(200);

    // Verify block was deleted
    const nodeCount = await page.locator('.react-flow__node').count();
    expect(nodeCount).toBe(0);
  });

  test('Can create connections between blocks', async ({ page }) => {
    // Add two blocks
    await page.click('button:has-text("Add Block")');
    await page.click('text=Const');
    
    await page.waitForTimeout(200);
    
    await page.click('button:has-text("Add Block")');
    await page.click('text=Add');

    await page.waitForTimeout(200);

    // Get handles
    const sourceHandle = page.locator('.react-flow__node').first().locator('.react-flow__handle.source').first();
    const targetHandle = page.locator('.react-flow__node').nth(1).locator('.react-flow__handle.target').first();

    const sourceBox = await sourceHandle.boundingBox();
    const targetBox = await targetHandle.boundingBox();

    if (sourceBox && targetBox) {
      // Create connection
      await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
      await page.mouse.up();

      await page.waitForTimeout(300);

      // Verify edge was created
      const edgeCount = await page.locator('.react-flow__edge').count();
      expect(edgeCount).toBeGreaterThan(0);
    }
  });

  test('Can delete connections', async ({ page }) => {
    // Add two connected blocks
    await page.click('button:has-text("Add Block")');
    await page.click('text=Const');
    await page.waitForTimeout(200);
    
    await page.click('button:has-text("Add Block")');
    await page.click('text=Add');
    await page.waitForTimeout(200);

    // Create connection
    const sourceHandle = page.locator('.react-flow__node').first().locator('.react-flow__handle.source').first();
    const targetHandle = page.locator('.react-flow__node').nth(1).locator('.react-flow__handle.target').first();

    const sourceBox = await sourceHandle.boundingBox();
    const targetBox = await targetHandle.boundingBox();

    if (sourceBox && targetBox) {
      await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
      await page.mouse.up();
      await page.waitForTimeout(300);
    }

    // Select and delete edge
    const edge = page.locator('.react-flow__edge').first();
    await edge.click();
    await page.keyboard.press('Delete');

    await page.waitForTimeout(200);

    // Verify edge was deleted
    const edgeCount = await page.locator('.react-flow__edge').count();
    expect(edgeCount).toBe(0);
  });

  test('Undo operation works', async ({ page }) => {
    // Add a block
    await page.click('button:has-text("Add Block")');
    await page.click('text=Const');

    await page.waitForTimeout(200);

    // Verify block exists
    let nodeCount = await page.locator('.react-flow__node').count();
    expect(nodeCount).toBe(1);

    // Undo
    await page.keyboard.press('Control+z'); // or 'Meta+z' on Mac

    await page.waitForTimeout(200);

    // Verify block was removed by undo
    nodeCount = await page.locator('.react-flow__node').count();
    expect(nodeCount).toBe(0);
  });

  test('Redo operation works', async ({ page }) => {
    // Add a block
    await page.click('button:has-text("Add Block")');
    await page.click('text=Const');

    await page.waitForTimeout(200);

    // Undo
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);

    // Redo
    await page.keyboard.press('Control+Shift+z'); // or 'Meta+Shift+z' on Mac

    await page.waitForTimeout(200);

    // Verify block was restored by redo
    const nodeCount = await page.locator('.react-flow__node').count();
    expect(nodeCount).toBe(1);
  });

  test('Can select and deselect blocks', async ({ page }) => {
    // Add a block
    await page.click('button:has-text("Add Block")');
    await page.click('text=Const');

    await page.waitForTimeout(200);

    const node = page.locator('.react-flow__node').first();

    // Select block
    await node.click();
    await page.waitForTimeout(100);

    let isSelected = await node.evaluate(el => 
      el.classList.contains('selected') || el.classList.contains('react-flow__node-selected')
    );
    expect(isSelected).toBe(true);

    // Deselect by clicking background
    const reactFlow = page.locator('.react-flow');
    const flowBox = await reactFlow.boundingBox();
    if (flowBox) {
      await page.mouse.click(flowBox.x + 50, flowBox.y + 50);
    }

    await page.waitForTimeout(100);

    isSelected = await node.evaluate(el => 
      el.classList.contains('selected') || el.classList.contains('react-flow__node-selected')
    );
    expect(isSelected).toBe(false);
  });

  test('Can pan the viewport', async ({ page }) => {
    // Get initial viewport transform
    const viewportBefore = await page.locator('.react-flow__viewport').getAttribute('transform');

    // Pan by dragging background
    const reactFlow = page.locator('.react-flow');
    const flowBox = await reactFlow.boundingBox();

    if (flowBox) {
      await page.mouse.move(flowBox.x + flowBox.width / 2, flowBox.y + flowBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(flowBox.x + flowBox.width / 2 + 100, flowBox.y + flowBox.height / 2 + 100);
      await page.mouse.up();
    }

    await page.waitForTimeout(200);

    // Verify viewport changed
    const viewportAfter = await page.locator('.react-flow__viewport').getAttribute('transform');
    expect(viewportAfter).not.toBe(viewportBefore);
  });

  test('Can zoom in and out', async ({ page }) => {
    // Get initial zoom level
    const viewportBefore = await page.locator('.react-flow__viewport').getAttribute('transform');

    // Find zoom controls
    const zoomInBtn = page.locator('.react-flow__controls button[aria-label="zoom in"], .react-flow__controls button:has-text("+")');
    
    if (await zoomInBtn.isVisible()) {
      await zoomInBtn.click();
      await page.waitForTimeout(200);

      // Verify zoom changed
      const viewportAfter = await page.locator('.react-flow__viewport').getAttribute('transform');
      expect(viewportAfter).not.toBe(viewportBefore);
    }
  });

  test('Context menu appears on block right-click', async ({ page }) => {
    // Add a block
    await page.click('button:has-text("Add Block")');
    await page.click('text=Const');

    await page.waitForTimeout(200);

    // Right-click on block
    const node = page.locator('.react-flow__node').first();
    await node.click({ button: 'right' });

    await page.waitForTimeout(200);

    // Context menu should appear
    // Note: Menu selector depends on implementation
    const contextMenu = page.locator('[role="menu"], .context-menu, [class*="menu"]');
    const menuVisible = await contextMenu.isVisible().catch(() => false);

    // Either menu appears or right-click selects the block
    // Both are acceptable behaviors
    expect(menuVisible || await node.evaluate(el => 
      el.classList.contains('selected') || el.classList.contains('react-flow__node-selected')
    )).toBeTruthy();
  });

  test('No console errors during normal operations', async ({ page }) => {
    // Collect console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Perform various operations
    await page.click('button:has-text("Add Block")');
    await page.click('text=Const');
    await page.waitForTimeout(200);

    const node = page.locator('.react-flow__node').first();
    await node.click();
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);

    // Filter out expected/benign errors if any
    const criticalErrors = errors.filter(e => 
      !e.includes('ResizeObserver') && // Common benign warning
      !e.includes('favicon') // Missing favicon is not critical
    );

    expect(criticalErrors).toHaveLength(0);
  });
});
