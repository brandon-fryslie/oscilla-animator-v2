/**
 * E2E Tests: ReactFlow Editor - Auto-layout Feature
 *
 * Tests Sprint 2B Feature 1: Auto-layout
 * - Auto-layout button exists and is clickable
 * - Layout produces no overlapping nodes
 * - Zoom-to-fit after layout
 * - Edge cases (empty, single node)
 */

import { test, expect } from '@playwright/test';

test.describe('ReactFlow Editor - Auto-layout', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the editor
    await page.goto('/');
    
    // Wait for editor to be ready
    await page.waitForSelector('.react-flow');
  });

  test('Auto-layout button exists and is visible', async ({ page }) => {
    // Find the auto-layout button
    const autoLayoutBtn = page.locator('button', { hasText: /auto arrange/i });
    
    // Verify button exists
    await expect(autoLayoutBtn).toBeVisible();
    
    // Verify tooltip
    await autoLayoutBtn.hover();
    await expect(autoLayoutBtn).toHaveAttribute('title', /arrange nodes automatically/i);
  });

  test('Auto-layout arranges nodes without overlap', async ({ page }) => {
    // Add multiple blocks
    const blockCount = 5;
    for (let i = 0; i < blockCount; i++) {
      // TODO: Replace with actual block addition logic
      // This is a placeholder - actual implementation depends on how blocks are added
      await page.click('button:has-text("Add Block")');
      await page.click('text=Const'); // or whatever block type
    }

    // Get node positions before layout
    const nodesBefore = await page.locator('.react-flow__node').all();
    expect(nodesBefore.length).toBeGreaterThan(0);

    // Click auto-layout button
    await page.click('button:has-text("Auto Arrange")');

    // Wait for layout animation to complete
    await page.waitForTimeout(500);

    // Get node positions after layout
    const nodesAfter = await page.locator('.react-flow__node').all();
    expect(nodesAfter.length).toBe(nodesBefore.length);

    // Check that nodes don't overlap
    const nodeBounds = await Promise.all(
      nodesAfter.map(node => node.boundingBox())
    );

    // Verify no overlaps
    for (let i = 0; i < nodeBounds.length; i++) {
      for (let j = i + 1; j < nodeBounds.length; j++) {
        const a = nodeBounds[i];
        const b = nodeBounds[j];
        
        if (a && b) {
          const overlap = !(
            a.x + a.width < b.x ||
            b.x + b.width < a.x ||
            a.y + a.height < b.y ||
            b.y + b.height < a.y
          );
          
          expect(overlap).toBe(false);
        }
      }
    }
  });

  test('Auto-layout triggers zoom-to-fit', async ({ page }) => {
    // Add blocks
    await page.click('button:has-text("Add Block")');
    await page.click('text=Const');
    
    // Get viewport before
    const viewportBefore = await page.locator('.react-flow__viewport').getAttribute('transform');
    
    // Click auto-layout
    await page.click('button:has-text("Auto Arrange")');
    
    // Wait for animation
    await page.waitForTimeout(500);
    
    // Get viewport after
    const viewportAfter = await page.locator('.react-flow__viewport').getAttribute('transform');
    
    // Viewport should have changed (zoomed/panned)
    expect(viewportAfter).not.toBe(viewportBefore);
  });

  test('Auto-layout handles empty graph gracefully', async ({ page }) => {
    // Click auto-layout with no blocks
    await page.click('button:has-text("Auto Arrange")');
    
    // Should not error - verify page still functional
    await expect(page.locator('.react-flow')).toBeVisible();
    
    // No errors in console
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.waitForTimeout(100);
    expect(errors).toHaveLength(0);
  });

  test('Auto-layout handles single node', async ({ page }) => {
    // Add one block
    await page.click('button:has-text("Add Block")');
    await page.click('text=Const');
    
    // Click auto-layout
    await page.click('button:has-text("Auto Arrange")');
    
    // Wait for animation
    await page.waitForTimeout(500);
    
    // Verify node is still visible
    const nodes = await page.locator('.react-flow__node').count();
    expect(nodes).toBe(1);
  });

  test('Auto-layout button shows loading state', async ({ page }) => {
    // Add blocks
    for (let i = 0; i < 3; i++) {
      await page.click('button:has-text("Add Block")');
      await page.click('text=Const');
    }

    // Get button
    const autoLayoutBtn = page.locator('button:has-text("Auto Arrange")');
    
    // Click and immediately check if disabled
    await autoLayoutBtn.click();
    
    // Button should show "Arranging..." text
    await expect(page.locator('button:has-text("Arranging")')).toBeVisible();
  });
});
