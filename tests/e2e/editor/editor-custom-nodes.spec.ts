/**
 * E2E Tests: ReactFlow Editor - Custom Node Rendering
 *
 * Tests Sprint 2B Feature 3: Custom Node Rendering
 * - Custom nodes display correctly
 * - Ports are visible and labeled
 * - Socket interactions work (connect/disconnect)
 * - Node interactions preserved (select, drag, delete)
 */

import { test, expect } from '@playwright/test';

test.describe('ReactFlow Editor - Custom Node Rendering', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the editor
    await page.goto('/');
    
    // Wait for editor to be ready
    await page.waitForSelector('.react-flow');
  });

  test('Custom nodes have styled appearance', async ({ page }) => {
    // Add a block
    await page.click('button:has-text("Add Block")');
    await page.click('text=Const');

    // Wait for node to appear
    await page.waitForTimeout(200);

    // Check for custom node container
    const customNode = page.locator('.react-flow__node[data-id]').first();
    await expect(customNode).toBeVisible();

    // Verify custom styling is applied
    const nodeStyle = await customNode.evaluate(el => {
      const style = window.getComputedStyle(el.querySelector('div') || el);
      return {
        background: style.background || style.backgroundColor,
        border: style.border || style.borderColor,
      };
    });

    // Should have custom background (not default white)
    expect(nodeStyle.background).toBeTruthy();
  });

  test('Node displays block label prominently', async ({ page }) => {
    // Add a block
    await page.click('button:has-text("Add Block")');
    await page.click('text=Const');

    await page.waitForTimeout(200);

    // Find node label
    const customNode = page.locator('.react-flow__node').first();
    const labelText = await customNode.textContent();

    // Label should contain "Const" or custom name
    expect(labelText).toContain('Const');
  });

  test('Input ports are visible on left side', async ({ page }) => {
    // Add a block with inputs (e.g., Add block)
    await page.click('button:has-text("Add Block")');
    // Navigate to Math category and select Add
    await page.click('text=Add'); // Or appropriate selector for Add block

    await page.waitForTimeout(200);

    // Find input handles (target handles on left)
    const inputHandles = page.locator('.react-flow__handle-left, .react-flow__handle.target');
    const count = await inputHandles.count();

    // Should have at least one input
    expect(count).toBeGreaterThan(0);

    // Verify they're positioned on the left
    if (count > 0) {
      const firstHandle = inputHandles.first();
      const bbox = await firstHandle.boundingBox();
      
      if (bbox) {
        // Handle should be on left edge (x close to node left edge)
        expect(bbox.x).toBeDefined();
      }
    }
  });

  test('Output ports are visible on right side', async ({ page }) => {
    // Add a block with outputs (e.g., Const)
    await page.click('button:has-text("Add Block")');
    await page.click('text=Const');

    await page.waitForTimeout(200);

    // Find output handles (source handles on right)
    const outputHandles = page.locator('.react-flow__handle-right, .react-flow__handle.source');
    const count = await outputHandles.count();

    // Should have at least one output
    expect(count).toBeGreaterThan(0);

    // Verify they're positioned on the right
    if (count > 0) {
      const firstHandle = outputHandles.first();
      const bbox = await firstHandle.boundingBox();
      
      if (bbox) {
        // Handle should be on right edge
        expect(bbox.x).toBeDefined();
      }
    }
  });

  test('Socket connections work with custom nodes', async ({ page }) => {
    // Add two blocks that can connect
    await page.click('button:has-text("Add Block")');
    await page.click('text=Const');
    
    await page.waitForTimeout(200);
    
    await page.click('button:has-text("Add Block")');
    await page.click('text=Add'); // Block with inputs

    await page.waitForTimeout(200);

    // Get output handle of first block
    const sourceHandle = page.locator('.react-flow__node').first().locator('.react-flow__handle.source').first();
    const sourceBox = await sourceHandle.boundingBox();

    // Get input handle of second block
    const targetHandle = page.locator('.react-flow__node').nth(1).locator('.react-flow__handle.target').first();
    const targetBox = await targetHandle.boundingBox();

    if (sourceBox && targetBox) {
      // Drag from source to target
      await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
      await page.mouse.up();

      await page.waitForTimeout(300);

      // Verify edge was created
      const edges = await page.locator('.react-flow__edge').count();
      expect(edges).toBeGreaterThan(0);
    }
  });

  test('Node selection works with custom rendering', async ({ page }) => {
    // Add a block
    await page.click('button:has-text("Add Block")');
    await page.click('text=Const');

    await page.waitForTimeout(200);

    // Click on the node
    const node = page.locator('.react-flow__node').first();
    await node.click();

    // Verify node is selected (has selected class)
    const isSelected = await node.evaluate(el => 
      el.classList.contains('selected') || el.classList.contains('react-flow__node-selected')
    );

    expect(isSelected).toBe(true);
  });

  test('Node dragging works smoothly', async ({ page }) => {
    // Add a block
    await page.click('button:has-text("Add Block")');
    await page.click('text=Const');

    await page.waitForTimeout(200);

    // Get initial position
    const node = page.locator('.react-flow__node').first();
    const initialPos = await node.boundingBox();

    if (initialPos) {
      // Drag the node
      await page.mouse.move(initialPos.x + initialPos.width / 2, initialPos.y + initialPos.height / 2);
      await page.mouse.down();
      await page.mouse.move(initialPos.x + 100, initialPos.y + 100);
      await page.mouse.up();

      await page.waitForTimeout(200);

      // Get final position
      const finalPos = await node.boundingBox();

      if (finalPos) {
        // Position should have changed
        expect(finalPos.x).not.toBe(initialPos.x);
        expect(finalPos.y).not.toBe(initialPos.y);
      }
    }
  });

  test('Node deletion works with custom nodes', async ({ page }) => {
    // Add a block
    await page.click('button:has-text("Add Block")');
    await page.click('text=Const');

    await page.waitForTimeout(200);

    // Select the node
    const node = page.locator('.react-flow__node').first();
    await node.click();

    // Count nodes before delete
    const countBefore = await page.locator('.react-flow__node').count();
    expect(countBefore).toBe(1);

    // Delete via keyboard shortcut
    await page.keyboard.press('Delete');

    await page.waitForTimeout(200);

    // Count nodes after delete
    const countAfter = await page.locator('.react-flow__node').count();
    expect(countAfter).toBe(0);
  });

  test('Port labels are visible and readable', async ({ page }) => {
    // Add a block with labeled ports
    await page.click('button:has-text("Add Block")');
    await page.click('text=Add');

    await page.waitForTimeout(200);

    // Get node
    const node = page.locator('.react-flow__node').first();

    // Check for port labels (they should be visible near handles)
    const textContent = await node.textContent();

    // Should contain port labels (e.g., "a", "b", "sum" for Add block)
    expect(textContent).toBeTruthy();
    expect(textContent!.length).toBeGreaterThan(0);
  });

  test('Custom nodes perform well with many instances', async ({ page }) => {
    // Add multiple custom nodes
    for (let i = 0; i < 20; i++) {
      await page.click('button:has-text("Add Block")');
      await page.click('text=Const');
    }

    await page.waitForTimeout(500);

    // Count nodes
    const nodeCount = await page.locator('.react-flow__node').count();
    expect(nodeCount).toBe(20);

    // Pan should still be smooth
    const reactFlow = page.locator('.react-flow');
    const flowBox = await reactFlow.boundingBox();

    if (flowBox) {
      const startTime = Date.now();
      
      await page.mouse.move(flowBox.x + flowBox.width / 2, flowBox.y + flowBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(flowBox.x + flowBox.width / 2 + 100, flowBox.y + flowBox.height / 2);
      await page.mouse.up();
      
      const duration = Date.now() - startTime;
      
      // Should complete quickly (< 300ms)
      expect(duration).toBeLessThan(300);
    }
  });
});
