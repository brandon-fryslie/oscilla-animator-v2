import { describe, it, expect, beforeEach, vi } from 'vitest';
import { autorun } from 'mobx';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MantineProvider } from '@mantine/core';
import { useEffect } from 'react';

import { BlockLibrary, SEARCH_DEBOUNCE_MS } from '../BlockLibrary';
import { EditorProvider, useEditor, type EditorHandle } from '../../editorCommon';
import { RootStore, StoreProvider } from '../../../stores';
import { registerAllBlocks } from '../../../blocks/all';
import { BlockCatalogProvider } from '../../graphEditor/BlockCatalogContext';
import { v1BlockCatalog } from '../../graphEditor/V1BlockCatalog';
import { insertableByCategory } from '../../graphEditor/block-catalog';

registerAllBlocks();

function readComputed<T>(reader: () => T): T {
  let value!: T;
  const disposer = autorun(() => {
    value = reader();
  });
  disposer();
  return value;
}

let testStore: RootStore;
let mockEditorHandle: EditorHandle | null = null;

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

function InjectEditorHandle({ handle }: { handle: EditorHandle | null }) {
  const { setEditorHandle } = useEditor();
  useEffect(() => {
    setEditorHandle(handle);
    return () => setEditorHandle(null);
  }, [handle, setEditorHandle]);
  return null;
}

function createMockEditorHandle(): EditorHandle {
  return {
    type: 'reactflow',
    async addBlock(blockType: string, options?: { displayName?: string }) {
      return testStore.patch.addBlock(blockType, {}, { displayName: options?.displayName });
    },
    async removeBlock() {},
    async zoomToFit() {},
    getRawHandle() {
      return null;
    },
  };
}

function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider>
      <StoreProvider store={testStore}>
        <BlockCatalogProvider catalog={v1BlockCatalog}>
          <EditorProvider>
            <InjectEditorHandle handle={mockEditorHandle} />
            {children}
          </EditorProvider>
        </BlockCatalogProvider>
      </StoreProvider>
    </MantineProvider>
  );
}

function getVisibleCategories(): string[] {
  return [...insertableByCategory(v1BlockCatalog.entries).categories];
}

describe('BlockLibrary', () => {
  beforeEach(() => {
    testStore = new RootStore();
    localStorageMock.clear();
    testStore.selection.clearSelection();
    testStore.selection.clearPreview();
    mockEditorHandle = createMockEditorHandle();
    vi.clearAllMocks();
  });

  it('filters blocks from search input (case-insensitive)', () => {
    // The search box debounces input (a setTimeout). Drive that timer explicitly
    // so the assertion never races a real 150ms timeout under machine load — the
    // result must be a function of the input, not of wall-clock timing.
    // [LAW:no-ambient-temporal-coupling]
    vi.useFakeTimers();
    try {
      render(<BlockLibrary />, { wrapper: TestWrapper });

      const searchInput = screen.getByPlaceholderText('Search blocks...');
      fireEvent.change(searchInput, { target: { value: 'SINE' } });

      // Settle the debounce deterministically, then flush the state update.
      act(() => {
        vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 50);
      });

      expect(screen.getByText(/\bresults?\b/i)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('adds a block to the patch on double click', async () => {
    render(<BlockLibrary />, { wrapper: TestWrapper });

    const categories = getVisibleCategories();
    expect(categories.length).toBeGreaterThan(0);

    const entries = insertableByCategory(v1BlockCatalog.entries).byCategory.get(categories[0]!) ?? [];
    const firstVisible = entries[0];
    expect(firstVisible).toBeTruthy();

    const beforeCount = readComputed(() => testStore.patch.blocks.size);
    fireEvent.doubleClick(screen.getByText(firstVisible!.label));

    await waitFor(() => {
      expect(readComputed(() => testStore.patch.blocks.size)).toBe(beforeCount + 1);
    });
  });

  it('persists category collapse state in localStorage', () => {
    render(<BlockLibrary />, { wrapper: TestWrapper });

    const categories = getVisibleCategories();
    expect(categories.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText(categories[0]!));

    const stored = localStorageMock.getItem('blockLibrary.collapsedCategories');
    expect(stored).toBeTruthy();

    const parsed = JSON.parse(stored!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toContain(categories[0]);
  });

  it('clears active search when Escape is pressed', async () => {
    render(<BlockLibrary />, { wrapper: TestWrapper });

    const searchInput = screen.getByPlaceholderText('Search blocks...') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'noise' } });
    expect(searchInput.value).toBe('noise');

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(searchInput.value).toBe('');
    });
  });
});
