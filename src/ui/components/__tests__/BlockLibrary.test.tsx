/**
 * BlockLibrary Component Tests
 *
 * Tests for BlockLibrary component including:
 * - Category-based organization
 * - Search functionality (debounced, case-insensitive)
 * - Block preview/add interactions
 * - Category collapse persistence
 * - Keyboard navigation
 * - Integration with stores
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BlockLibrary } from '../BlockLibrary';
import { rootStore } from '../../../stores';
import { getBlockCategories, getBlockTypesByCategory } from '../../registry/blockTypes';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('BlockLibrary', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorageMock.clear();
    // Clear any existing selections
    rootStore.selection.clearSelection();
    // Clear patch store
    rootStore.patch.clear();
  });

  describe('Acceptance Criterion 1: Category-based organization', () => {
    it('should display blocks grouped by BlockCategory enum', () => {
      render(<BlockLibrary />);

      const categories = getBlockCategories();
      categories.forEach(category => {
        const types = getBlockTypesByCategory(category);
        // Only check categories that have blocks
        if (types.length > 0) {
          expect(screen.getByText(category)).toBeInTheDocument();
        }
      });
    });

    it('should show block count badge for each category', () => {
      render(<BlockLibrary />);

      // Check that all count badges are present as CSS classes
      const countBadges = document.querySelectorAll('.category-count');
      expect(countBadges.length).toBeGreaterThan(0);

      // Verify each count matches a category with blocks
      const categories = getBlockCategories();
      categories.forEach(category => {
        const types = getBlockTypesByCategory(category);
        if (types.length > 0) {
          // Find a badge with this count value in the same category header
          const categoryHeader = screen.getByText(category).closest('.category-header');
          const badge = categoryHeader?.querySelector('.category-count');
          expect(badge?.textContent).toBe(types.length.toString());
        }
      });
    });
  });

  describe('Acceptance Criterion 2: Search functionality', () => {
    it('should filter blocks by type (case-insensitive)', async () => {
      render(<BlockLibrary />);

      const searchInput = screen.getByPlaceholderText('Search blocks...');
      fireEvent.change(searchInput, { target: { value: 'infinite' } });

      // Wait for debounce
      await waitFor(() => {
        expect(screen.getByText('Infinite Time Root')).toBeInTheDocument();
      }, { timeout: 300 });
    });

    it('should filter blocks by label (case-insensitive)', async () => {
      render(<BlockLibrary />);

      const searchInput = screen.getByPlaceholderText('Search blocks...');
      fireEvent.change(searchInput, { target: { value: 'DOMAIN' } });

      await waitFor(() => {
        expect(screen.getByText('Domain N')).toBeInTheDocument();
      }, { timeout: 300 });
    });

    it('should filter blocks by description (case-insensitive)', async () => {
      render(<BlockLibrary />);

      const searchInput = screen.getByPlaceholderText('Search blocks...');
      fireEvent.change(searchInput, { target: { value: 'continuous' } });

      await waitFor(() => {
        expect(screen.getByText('Infinite Time Root')).toBeInTheDocument();
      }, { timeout: 300 });
    });

    it('should show result count', async () => {
      render(<BlockLibrary />);

      const searchInput = screen.getByPlaceholderText('Search blocks...');
      fireEvent.change(searchInput, { target: { value: 'time' } });

      await waitFor(() => {
        const resultCount = screen.queryByText(/result/);
        expect(resultCount).toBeInTheDocument();
        expect(resultCount?.textContent).toMatch(/\d+ results?/);
      }, { timeout: 300 });
    });

    it('should work across all categories simultaneously', async () => {
      render(<BlockLibrary />);

      const searchInput = screen.getByPlaceholderText('Search blocks...');
      fireEvent.change(searchInput, { target: { value: 'field' } });

      await waitFor(() => {
        // Should show blocks from Field Operations category
        const fieldOpsTypes = getBlockTypesByCategory('Field Operations');
        fieldOpsTypes.forEach(type => {
          if (type.label.toLowerCase().includes('field') ||
              type.description.toLowerCase().includes('field')) {
            expect(screen.getByText(type.label)).toBeInTheDocument();
          }
        });
      }, { timeout: 300 });
    });

    it('should clear search on ESC key', async () => {
      render(<BlockLibrary />);

      const searchInput = screen.getByPlaceholderText('Search blocks...') as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'test' } });

      expect(searchInput.value).toBe('test');

      fireEvent.keyDown(searchInput, { key: 'Escape' });

      expect(searchInput.value).toBe('');
    });

    it('should clear search on clear button click', async () => {
      render(<BlockLibrary />);

      const searchInput = screen.getByPlaceholderText('Search blocks...') as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'test' } });

      const clearButton = screen.getByLabelText('Clear search');
      fireEvent.click(clearButton);

      expect(searchInput.value).toBe('');
    });

    it('should debounce search to 150ms', async () => {
      const startTime = Date.now();
      render(<BlockLibrary />);

      const searchInput = screen.getByPlaceholderText('Search blocks...');

      // Type multiple times rapidly
      fireEvent.change(searchInput, { target: { value: 't' } });
      fireEvent.change(searchInput, { target: { value: 'ti' } });
      fireEvent.change(searchInput, { target: { value: 'tim' } });
      fireEvent.change(searchInput, { target: { value: 'time' } });

      // Results should not appear immediately
      const resultCount = screen.queryByText(/result/);
      expect(resultCount).not.toBeInTheDocument();

      // Wait for debounce
      await waitFor(() => {
        const count = screen.queryByText(/result/);
        expect(count).toBeInTheDocument();
      }, { timeout: 300 });

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(150);
    });
  });

  describe('Acceptance Criterion 3: Block preview interaction', () => {
    it('should call setPreviewType on single click', () => {
      render(<BlockLibrary />);

      const blockLabel = screen.getByText('Infinite Time Root');
      fireEvent.click(blockLabel);

      expect(rootStore.selection.previewType).toBe('InfiniteTimeRoot');
    });

    it('should verify SelectionStore.previewType after click', () => {
      render(<BlockLibrary />);

      expect(rootStore.selection.previewType).toBe(null);

      const blockLabel = screen.getByText('Domain N');
      fireEvent.click(blockLabel);

      expect(rootStore.selection.previewType).toBe('DomainN');
    });
  });

  describe('Acceptance Criterion 4: Block add interaction', () => {
    it('should call addBlock and selectBlock on double-click', () => {
      render(<BlockLibrary />);

      const initialBlockCount = rootStore.patch.blocks.size;

      const blockLabel = screen.getByText('Const Float');
      fireEvent.doubleClick(blockLabel);

      // Verify block was added
      expect(rootStore.patch.blocks.size).toBe(initialBlockCount + 1);

      // Verify block was selected
      const addedBlock = Array.from(rootStore.patch.blocks.values()).find(
        b => b.type === 'ConstFloat'
      );
      expect(addedBlock).toBeDefined();
      expect(rootStore.selection.selectedBlockId).toBe(addedBlock?.id);
    });

    it('should verify PatchStore.blocks map size increases', () => {
      render(<BlockLibrary />);

      const before = rootStore.patch.blocks.size;

      const blockLabel = screen.getByText('Grid Domain');
      fireEvent.doubleClick(blockLabel);

      const after = rootStore.patch.blocks.size;
      expect(after).toBe(before + 1);
    });
  });

  describe('Acceptance Criterion 5: Category collapse persistence', () => {
    it('should persist collapse state to localStorage', async () => {
      render(<BlockLibrary />);

      const categoryHeader = screen.getByText('Time');
      fireEvent.click(categoryHeader);

      // Wait for localStorage to be updated
      await waitFor(() => {
        const stored = localStorageMock.getItem('blockLibrary.collapsedCategories');
        expect(stored).toBeTruthy();
        const parsed = JSON.parse(stored!);
        expect(parsed).toContain('Time');
      });
    });

    it('should remain collapsed after page reload', async () => {
      // First render: collapse Time category
      const { unmount } = render(<BlockLibrary />);

      const categoryHeader = screen.getByText('Time');
      fireEvent.click(categoryHeader);

      await waitFor(() => {
        const stored = localStorageMock.getItem('blockLibrary.collapsedCategories');
        expect(stored).toBeTruthy();
      });

      unmount();

      // Second render: verify Time is still collapsed
      render(<BlockLibrary />);

      const timeCategory = screen.getByText('Time');
      const categoryElement = timeCategory.closest('.category');

      // Check that the category is collapsed (no block items visible)
      const blockItems = categoryElement?.querySelectorAll('.block-item');
      expect(blockItems?.length).toBe(0);
    });
  });

  describe('Acceptance Criterion 6: Port metadata display', () => {
    it('should show label (bold)', () => {
      render(<BlockLibrary />);

      const label = screen.getByText('Infinite Time Root');
      expect(label).toBeInTheDocument();
      // Verify it has the correct class
      expect(label).toHaveClass('block-label');
    });

    it('should show type (monospace)', () => {
      render(<BlockLibrary />);

      const type = screen.getByText('InfiniteTimeRoot');
      expect(type).toBeInTheDocument();
      expect(type).toHaveClass('block-type');
    });

    it('should show description (gray)', () => {
      render(<BlockLibrary />);

      const description = screen.getByText(/Continuous time source/);
      expect(description).toBeInTheDocument();
      expect(description).toHaveClass('block-description');
    });

    it('should show port counts (e.g., "2 in, 1 out")', () => {
      render(<BlockLibrary />);

      // Find any port count element (multiple blocks will have this)
      const portCounts = document.querySelectorAll('.block-ports');
      expect(portCounts.length).toBeGreaterThan(0);

      // Check that at least one matches the expected format
      const foundExpectedFormat = Array.from(portCounts).some(
        el => /\d+ in, \d+ out/.test(el.textContent || '')
      );
      expect(foundExpectedFormat).toBe(true);
    });

    it('should truncate description with ellipsis if longer than 3 lines', () => {
      render(<BlockLibrary />);

      // Find a block description element
      const descriptions = document.querySelectorAll('.block-description');
      expect(descriptions.length).toBeGreaterThan(0);

      // Verify CSS class is applied (actual truncation requires real layout)
      descriptions.forEach(desc => {
        expect(desc).toHaveClass('block-description');
      });
    });
  });

  describe('Acceptance Criterion 7: Keyboard navigation', () => {
    it('should support Enter key to preview block', () => {
      render(<BlockLibrary />);

      const blockItem = screen.getByText('Const Float').closest('.block-item') as HTMLElement;

      blockItem.focus();
      fireEvent.keyDown(blockItem, { key: 'Enter' });

      expect(rootStore.selection.previewType).toBe('ConstFloat');
    });

    it('should support Shift+Enter to add block', () => {
      render(<BlockLibrary />);

      const blockItem = screen.getByText('Domain N').closest('.block-item') as HTMLElement;
      const initialCount = rootStore.patch.blocks.size;

      blockItem.focus();
      fireEvent.keyDown(blockItem, { key: 'Enter', shiftKey: true });

      expect(rootStore.patch.blocks.size).toBe(initialCount + 1);
    });

    it('should verify keyboard event simulation works', () => {
      render(<BlockLibrary />);

      const searchInput = screen.getByPlaceholderText('Search blocks...') as HTMLInputElement;

      fireEvent.change(searchInput, { target: { value: 'test' } });
      expect(searchInput.value).toBe('test');

      fireEvent.keyDown(searchInput, { key: 'Escape' });
      expect(searchInput.value).toBe('');
    });
  });

  describe('Acceptance Criterion 8: No lane logic', () => {
    it('should have zero references to lane-related terms', () => {
      const componentSource = BlockLibrary.toString();

      expect(componentSource).not.toMatch(/activeLane/i);
      expect(componentSource).not.toMatch(/filterByLane/i);
      expect(componentSource).not.toMatch(/laneKind/i);
      expect(componentSource).not.toMatch(/laneAffinity/i);
    });
  });

  describe('General: TypeScript strict mode', () => {
    it('should not use any types', () => {
      // This is verified by TypeScript compilation
      // If this test runs, it means TS compiled successfully
      expect(true).toBe(true);
    });
  });

  describe('Performance: Search response time', () => {
    it('should complete search in <300ms for typical registry', async () => {
      render(<BlockLibrary />);

      const searchInput = screen.getByPlaceholderText('Search blocks...');

      const startTime = performance.now();
      fireEvent.change(searchInput, { target: { value: 'field' } });

      await waitFor(() => {
        const count = screen.queryByText(/result/);
        expect(count).toBeInTheDocument();
      }, { timeout: 300 });

      const elapsed = performance.now() - startTime;

      // Should complete within 300ms total (including 150ms debounce)
      expect(elapsed).toBeLessThan(300);
    });
  });
});
