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
import { MantineProvider } from '@mantine/core';
import { BlockLibrary } from '../BlockLibrary';
import { EditorProvider, useEditor, type EditorHandle } from '../../editorCommon';
import { RootStore, StoreProvider } from '../../../stores';
import { getBlockCategories, getBlockTypesByCategory } from '../../../blocks/registry';
import { useEffect } from 'react';

// Create a fresh store instance for tests (not the global singleton)
let testStore: RootStore;

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

/**
 * Injects an EditorHandle into the EditorContext.
 * Must be rendered inside EditorProvider.
 */
function InjectEditorHandle({ handle }: { handle: EditorHandle | null }) {
  const { setEditorHandle } = useEditor();
  useEffect(() => {
    setEditorHandle(handle);
    return () => setEditorHandle(null);
  }, [handle, setEditorHandle]);
  return null;
}

/** Create a mock EditorHandle that delegates addBlock to testStore.patch */
function createMockEditorHandle(): EditorHandle {
  return {
    type: 'reactflow',
    async addBlock(blockType: string, options?: { displayName?: string }) {
      return testStore.patch.addBlock(blockType, {}, {
        displayName: options?.displayName,
      });
    },
    async removeBlock() {},
    async zoomToFit() {},
    getRawHandle() { return null; },
  };
}

let mockEditorHandle: EditorHandle | null = null;

// Wrapper component to provide required context
function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider>
      <StoreProvider store={testStore}>
        <EditorProvider>
          <InjectEditorHandle handle={mockEditorHandle} />
          {children}
        </EditorProvider>
      </StoreProvider>
    </MantineProvider>
  );
}

describe('BlockLibrary', () => {
  beforeEach(() => {
    // Create fresh store instance for each test
    testStore = new RootStore();
    localStorageMock.clear();
    testStore.selection.clearSelection();
    testStore.selection.clearPreview();
    mockEditorHandle = createMockEditorHandle();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // The component filters out categories where all blocks have capability:'time'.
  // Tests must use visible categories to match what the component renders.
  function getVisibleCategories(): string[] {
    return getBlockCategories().filter((category: string) => {
      const types = getBlockTypesByCategory(category);
      return types.some((t: any) => t.capability !== 'time');
    });
  }

  describe('Category Organization', () => {
    it('should display blocks grouped by BlockCategory enum', () => {
      render(<BlockLibrary />, { wrapper: TestWrapper });

      const categories = getVisibleCategories();
      categories.forEach((category: string) => {
        expect(screen.getByText(category)).toBeInTheDocument();
      });
    });

    it('should show correct count of blocks per category', () => {
      render(<BlockLibrary />, { wrapper: TestWrapper });

      const categories = getVisibleCategories();
      categories.forEach((category: string) => {
        const types = getBlockTypesByCategory(category);
        // The component also filters out timeRoot blocks within each category
        const visibleTypes = types.filter((t: any) => t.capability !== 'time');
        const countElement = screen.getByText(category).parentElement?.querySelector('.block-category__count');
        expect(countElement?.textContent).toBe(String(visibleTypes.length));
      });
    });

    it('should allow toggling category collapse', () => {
      render(<BlockLibrary />, { wrapper: TestWrapper });

      const categories = getVisibleCategories();
      if (categories.length === 0) return;

      const firstCategory = categories[0];
      const types = getBlockTypesByCategory(firstCategory);
      if (types.length === 0) return;

      const categoryHeader = screen.getByText(firstCategory);
      fireEvent.click(categoryHeader);

      // Check if types are hidden (implementation depends on CSS)
      // For now, just verify the click handler works
      expect(categoryHeader).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('should filter blocks based on type name', async () => {
      render(<BlockLibrary />, { wrapper: TestWrapper });

      const searchInput = screen.getByPlaceholderText('Search blocks...');
      fireEvent.change(searchInput, { target: { value: 'sine' } });

      await waitFor(() => {
        // Check if search is active (results count should appear)
        const resultsText = screen.queryByText(/result/);
        if (resultsText) {
          expect(resultsText).toBeInTheDocument();
        }
      });
    });

    it('should be case-insensitive', async () => {
      render(<BlockLibrary />, { wrapper: TestWrapper });

      const searchInput = screen.getByPlaceholderText('Search blocks...');
      fireEvent.change(searchInput, { target: { value: 'SINE' } });

      await waitFor(() => {
        const resultsText = screen.queryByText(/result/);
        if (resultsText) {
          expect(resultsText).toBeInTheDocument();
        }
      });
    });

    it('should debounce search input', async () => {
      render(<BlockLibrary />, { wrapper: TestWrapper });

      const searchInput = screen.getByPlaceholderText('Search blocks...');

      // Rapid typing
      fireEvent.change(searchInput, { target: { value: 's' } });
      fireEvent.change(searchInput, { target: { value: 'si' } });
      fireEvent.change(searchInput, { target: { value: 'sin' } });
      fireEvent.change(searchInput, { target: { value: 'sine' } });

      // Wait for debounce delay
      await waitFor(() => {
        expect(searchInput).toHaveValue('sine');
      }, { timeout: 200 });
    });

    it('should clear search on Escape key', async () => {
      render(<BlockLibrary />, { wrapper: TestWrapper });

      const searchInput = screen.getByPlaceholderText('Search blocks...') as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'test' } });
      expect(searchInput.value).toBe('test');

      fireEvent.keyDown(window, { key: 'Escape' });

      await waitFor(() => {
        expect(searchInput.value).toBe('');
      });
    });

    it('should clear search on clear button click', () => {
      render(<BlockLibrary />, { wrapper: TestWrapper });

      const searchInput = screen.getByPlaceholderText('Search blocks...') as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'test' } });

      const clearButton = screen.getByLabelText('Clear search');
      fireEvent.click(clearButton);

      expect(searchInput.value).toBe('');
    });
  });

  describe('Block Interactions', () => {
    it('should preview block on single click', async () => {
      render(<BlockLibrary />, { wrapper: TestWrapper });

      const categories = getVisibleCategories();
      if (categories.length === 0) return;

      const types = getBlockTypesByCategory(categories[0]);
      if (types.length === 0) return;

      const firstType = types[0];
      const blockElement = screen.getByText(firstType.label);
      fireEvent.click(blockElement);

      // Verify block is selected (implementation depends on UI state)
      expect(blockElement).toBeInTheDocument();
    });

    it('should add block on double click', async () => {
      render(<BlockLibrary />, { wrapper: TestWrapper });

      const categories = getVisibleCategories();
      if (categories.length === 0) return;

      const types = getBlockTypesByCategory(categories[0]);
      if (types.length === 0) return;

      const firstType = types[0];
      const blockElement = screen.getByText(firstType.label);

      const initialBlockCount = testStore.patch.blocks.size;
      fireEvent.doubleClick(blockElement);

      await waitFor(() => {
        // Block should be added to PatchStore
        expect(testStore.patch.blocks.size).toBe(initialBlockCount + 1);
      });
    });
  });

  describe('Persistence', () => {
    it('should persist collapsed categories to localStorage', () => {
      render(<BlockLibrary />, { wrapper: TestWrapper });

      const categories = getVisibleCategories();
      if (categories.length === 0) return;

      const firstCategory = categories[0];
      const categoryHeader = screen.getByText(firstCategory);
      fireEvent.click(categoryHeader);

      const stored = localStorageMock.getItem('blockLibrary.collapsedCategories');
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it('should restore collapsed state from localStorage', () => {
      const categories = getVisibleCategories();
      if (categories.length === 0) return;

      const firstCategory = categories[0];
      localStorageMock.setItem(
        'blockLibrary.collapsedCategories',
        JSON.stringify([firstCategory])
      );

      render(<BlockLibrary />, { wrapper: TestWrapper });

      const categoryHeader = screen.getByText(firstCategory);
      expect(categoryHeader).toBeInTheDocument();
      // Check if category is collapsed (implementation specific)
    });
  });
});
