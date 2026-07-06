/**
 * Block Library Component (React)
 *
 * Browse available block types organized by category.
 * Click to preview type in inspector, double-click to add block.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ActionIcon, rem } from '@mantine/core';
import type { BlockId } from '../../types';
import { useStores } from '../../stores';
import { useBlockCatalog } from '../graphEditor/BlockCatalogContext';
import {
  type CatalogEntry,
  catalogCategories,
  catalogEntriesInCategory,
  searchEntries,
} from '../graphEditor/block-catalog';
import { useEditor } from '../editorCommon';
import { resolveLocalStorageCapability } from '../../services/local-storage-capability';
import type { DiagnosticsStore } from '../../stores/DiagnosticsStore';
import './BlockLibrary.css';

// Type aliases for clarity
type BlockCategory = string;
type BlockTypeInfo = CatalogEntry;

// LocalStorage key for category collapse state
const COLLAPSE_STATE_KEY = 'blockLibrary.collapsedCategories';

// Debounce delay for search (ms). Exported so tests can drive the debounce timer
// deterministically rather than racing it. [LAW:one-source-of-truth]
export const SEARCH_DEBOUNCE_MS = 150;

/**
 * Load collapsed categories from localStorage.
 */
function loadCollapsedCategories(diagnostics: Pick<DiagnosticsStore, 'log'>): Set<BlockCategory> {
  try {
    // [LAW:single-enforcer] localStorage capability detection is centralized.
    const storage = resolveLocalStorageCapability();
    if (!storage) return new Set();
    const stored = storage.getItem(COLLAPSE_STATE_KEY);
    if (!stored) return new Set();
    const parsed = JSON.parse(stored);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (e) {
    diagnostics.log({
      level: 'warn',
      message: 'Failed to load collapsed categories from localStorage',
      data: { error: String(e) },
    });
    return new Set();
  }
}

/**
 * Save collapsed categories to localStorage.
 */
function saveCollapsedCategories(collapsed: Set<BlockCategory>, diagnostics: Pick<DiagnosticsStore, 'log'>): void {
  try {
    // [LAW:single-enforcer] localStorage capability detection is centralized.
    const storage = resolveLocalStorageCapability();
    if (!storage) return;
    storage.setItem(COLLAPSE_STATE_KEY, JSON.stringify(Array.from(collapsed)));
  } catch (e) {
    diagnostics.log({
      level: 'warn',
      message: 'Failed to save collapsed categories to localStorage',
      data: { error: String(e) },
    });
  }
}

/**
 * Debounce helper - returns a debounced value.
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Block Library Component
 */
export const BlockLibrary: React.FC = () => {
  const { selection, diagnostics } = useStores();
  const catalog = useBlockCatalog();
  // Read the catalog ONCE per render. The V1 catalog reads the mutable registry
  // fresh on each access, so this snapshot both stays current (runtime-registered
  // composites appear) and is materialized a single time for every derived view
  // below. Do NOT memoize on `catalog` — its reference never changes, which would
  // freeze the library on the first render's registry state. [LAW:effects-at-boundaries]
  const entries = catalog.entries;
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [collapsedCategories, setCollapsedCategories] = useState<Set<BlockCategory>>(() =>
    loadCollapsedCategories(diagnostics)
  );

  // Track which category currently has focus (for keyboard navigation)
  const [focusedCategory, setFocusedCategory] = useState<BlockCategory | null>(null);

  // Get editor handle from context
  const { editorHandle } = useEditor();

  // Callbacks
  const toggleCategory = useCallback((category: BlockCategory) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      saveCollapsedCategories(next, diagnostics);
      return next;
    });
  }, [diagnostics]);

  const handleBlockClick = useCallback((type: BlockTypeInfo) => {
    // Set preview type in selection store to trigger inspector preview
    selection.setPreviewType(type.type);
  }, [selection]);

  const handleBlockDoubleClick = useCallback(
    (type: BlockTypeInfo) => {
      if (!editorHandle) return;

      // EditorHandle is the single authority for block creation.
      // It routes to the correct store (PatchStore or CompositeEditorStore).
      editorHandle.addBlock(type.type, { displayName: type.label }).then((blockId) => {
        // Selection only applies in the main patch editor context
        if (editorHandle.type === 'reactflow') {
          selection.selectBlock(blockId as BlockId);
        }
      });
    },
    [selection, editorHandle]
  );

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  const handleSearchClear = useCallback(() => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  }, []);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Clear search on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && searchQuery) {
        e.preventDefault();
        handleSearchClear();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery, handleSearchClear]);

  // Non-insertable types (e.g. singleton roots) are already excluded by the
  // catalog helpers, so every returned category has insertable entries.
  const filteredCategories = useMemo(() => catalogCategories(entries), [entries]);

  // Calculate total results across all categories
  const totalResults = useMemo(() => {
    let count = 0;
    filteredCategories.forEach((category: string) => {
      const inCategory = catalogEntriesInCategory(entries, category);
      count += searchEntries(inCategory, debouncedSearchQuery).length;
    });
    return count;
  }, [entries, filteredCategories, debouncedSearchQuery]);

  return (
    <div className="block-library">
      <div className="block-library__header">
        <h2 className="block-library__title">Blocks</h2>

        <div className="block-library__search">
          <span className="block-library__search-icon">⌕</span>
          <input
            ref={searchInputRef}
            type="text"
            className="block-library__search-input"
            placeholder="Search blocks..."
            value={searchQuery}
            onChange={handleSearchChange}
            aria-label="Search blocks"
          />
          {searchQuery && (
            <ActionIcon
              onClick={handleSearchClear}
              size="sm"
              variant="subtle"
              color="gray"
              aria-label="Clear search"
              style={{
                position: 'absolute',
                right: rem(4),
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            >
              <span style={{ fontSize: rem(14), lineHeight: 1 }}>×</span>
            </ActionIcon>
          )}
        </div>

        {debouncedSearchQuery && (
          <div className="block-library__search-results">
            {totalResults} {totalResults === 1 ? 'result' : 'results'}
          </div>
        )}
      </div>

      <div className="block-library__categories">
        {filteredCategories.map((category: string) => (
          <BlockCategorySection
            key={category}
            entries={entries}
            category={category}
            collapsed={collapsedCategories.has(category)}
            searchQuery={debouncedSearchQuery}
            onToggle={toggleCategory}
            onBlockClick={handleBlockClick}
            onBlockDoubleClick={handleBlockDoubleClick}
            focused={focusedCategory === category}
            onFocus={() => setFocusedCategory(category)}
          />
        ))}

        {debouncedSearchQuery && totalResults === 0 && (
          <div className="block-library__empty">
            <div className="block-library__empty-icon">🔍</div>
            <div>No blocks match "{debouncedSearchQuery}"</div>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Block Category Section
 */
interface BlockCategorySectionProps {
  entries: readonly CatalogEntry[];
  category: BlockCategory;
  collapsed: boolean;
  searchQuery: string;
  onToggle: (category: BlockCategory) => void;
  onBlockClick: (type: BlockTypeInfo) => void;
  onBlockDoubleClick: (type: BlockTypeInfo) => void;
  focused: boolean;
  onFocus: () => void;
}

const BlockCategorySection: React.FC<BlockCategorySectionProps> = ({
  entries,
  category,
  collapsed,
  searchQuery,
  onToggle,
  onBlockClick,
  onBlockDoubleClick,
  focused,
  onFocus,
}) => {
  const inCategory = useMemo(() => catalogEntriesInCategory(entries, category), [entries, category]);

  const filteredTypes = useMemo(
    () => searchEntries(inCategory, searchQuery),
    [inCategory, searchQuery],
  );

  if (filteredTypes.length === 0) return null;

  return (
    <div
      className={`block-category ${collapsed ? 'collapsed' : ''} ${focused ? 'focused' : ''}`}
      data-category={category}
      onFocus={onFocus}
    >
      <div className="block-category__header" onClick={() => onToggle(category)}>
        <span className="block-category__dot" />
        <span className="block-category__icon">▼</span>
        <h3 className="block-category__title">{category}</h3>
        <span className="block-category__count">{filteredTypes.length}</span>
      </div>

      {!collapsed && (
        <div className="block-category__types">
          {filteredTypes.map((type: BlockTypeInfo) => (
            <BlockTypeItem
              key={type.type}
              type={type}
              category={category}
              onClick={onBlockClick}
              onDoubleClick={onBlockDoubleClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Block Type Item
 */
interface BlockTypeItemProps {
  type: BlockTypeInfo;
  category: string;
  onClick: (type: BlockTypeInfo) => void;
  onDoubleClick: (type: BlockTypeInfo) => void;
}

const BlockTypeItem: React.FC<BlockTypeItemProps> = ({
  type,
  category: _category,
  onClick,
  onDoubleClick,
}) => {
  const inputCount = type.inputs.length;
  const outputCount = type.outputs.length;
  const isComposite = type.form === 'composite';
  const isPrimitive = type.form === 'primitive';

  // For composites, a locked (library) definition is not editable; a user one is.
  const isLibraryComposite = isComposite && !type.editable;
  const isUserComposite = isComposite && type.editable;

  // Determine badge appearance
  let badgeText: string;
  let badgeClass: string;
  if (isLibraryComposite) {
    badgeText = '🔒'; // Lock icon for library composites
    badgeClass = 'block-type-item__badge--library';
  } else if (isUserComposite) {
    badgeText = '✏️'; // Edit icon for user composites
    badgeClass = 'block-type-item__badge--user';
  } else if (isPrimitive) {
    badgeText = 'P';
    badgeClass = 'block-type-item__badge--primitive';
  } else {
    badgeText = 'M';
    badgeClass = 'block-type-item__badge--macro';
  }

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      // Set block type data for drag-and-drop
      e.dataTransfer.setData('application/oscilla-block-type', type.type);
      // Also set flag if this is a composite (for composite editor drops)
      if (isComposite) {
        e.dataTransfer.setData('application/oscilla-composite-type', type.type);
      }
      e.dataTransfer.effectAllowed = 'copy';
    },
    [type.type, isComposite]
  );

  return (
    <div
      className={`block-type-item ${isComposite ? 'block-type-item--composite' : ''}`}
      onClick={() => onClick(type)}
      onDoubleClick={() => onDoubleClick(type)}
      draggable
      onDragStart={handleDragStart}
    >
      <div className="block-type-item__icon" />
      <div className="block-type-item__info">
        <div className="block-type-item__header">
          <span className="block-type-item__label">{type.label}</span>
          <span className={`block-type-item__badge ${badgeClass}`}>
            {badgeText}
          </span>
        </div>
        <div className="block-type-item__meta">
          <span className="block-type-item__type">{type.type}</span>
          <span className="block-type-item__ports">
            <span className="block-type-item__port-in">{inputCount}</span>
            <span className="block-type-item__port-arrow">→</span>
            <span className="block-type-item__port-out">{outputCount}</span>
          </span>
        </div>
        {type.description && (
          <div className="block-type-item__description">{type.description}</div>
        )}
      </div>
    </div>
  );
};
