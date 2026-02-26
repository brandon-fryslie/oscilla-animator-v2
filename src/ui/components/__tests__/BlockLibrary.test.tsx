import { describe, it, expect, beforeEach, vi } from 'vitest';
import { autorun } from 'mobx';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MantineProvider } from '@mantine/core';
import { useEffect } from 'react';

import { BlockLibrary } from '../BlockLibrary';
import { EditorProvider, useEditor, type EditorHandle } from '../../editorCommon';
import { RootStore, StoreProvider } from '../../../stores';
import { getBlockCategories, getBlockTypesByCategory } from '../../../blocks/registry';

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
        <EditorProvider>
          <InjectEditorHandle handle={mockEditorHandle} />
          {children}
        </EditorProvider>
      </StoreProvider>
    </MantineProvider>
  );
}

function getVisibleCategories(): string[] {
  return getBlockCategories().filter((category: string) => {
    const types = getBlockTypesByCategory(category);
    return types.some((t: any) => t.capability !== 'time');
  });
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

  it('filters blocks from search input (case-insensitive)', async () => {
    render(<BlockLibrary />, { wrapper: TestWrapper });

    const searchInput = screen.getByPlaceholderText('Search blocks...');
    fireEvent.change(searchInput, { target: { value: 'SINE' } });

    await waitFor(() => {
      expect(screen.getByText(/\bresults?\b/i)).toBeInTheDocument();
    });
  });

  it('adds a block to the patch on double click', async () => {
    render(<BlockLibrary />, { wrapper: TestWrapper });

    const categories = getVisibleCategories();
    expect(categories.length).toBeGreaterThan(0);

    const types = getBlockTypesByCategory(categories[0]!);
    const firstVisible = types.find((t: any) => t.capability !== 'time');
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
