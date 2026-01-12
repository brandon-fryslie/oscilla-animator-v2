/**
 * Block Library Component (React)
 *
 * Browse available block types organized by category.
 * Click to preview, double-click to add block.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { rootStore } from '../../stores';
import {
  getBlockCategories,
  getBlockTypesByCategory,
  type BlockDef,
} from '../../blocks/registry';
import './BlockLibrary.css';

// Type aliases for clarity
type BlockCategory = string;
type BlockTypeInfo = BlockDef;

// LocalStorage key for category collapse state
const COLLAPSE_STATE_KEY = 'blockLibrary.collapsedCategories';

// Debounce delay for search (ms)
const SEARCH_DEBOUNCE_MS = 150;

/**
 * Load collapsed categories from localStorage.
 */
function loadCollapsedCategories(): Set<BlockCategory> {
  try {
    const stored = localStorage.getItem(COLLAPSE_STATE_KEY);
    if (!stored) return new Set();
    const parsed = JSON.parse(stored);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (e) {
    console.warn('Failed to load collapsed categories from localStorage:', e);
    return new Set();
  }
}

/**
 * Save collapsed categories to localStorage.
 */
function saveCollapsedCategories(collapsed: Set<BlockCategory>): void {
  try {
    localStorage.setItem(COLLAPSE_STATE_KEY, JSON.stringify(Array.from(collapsed)));
  } catch (e) {
    console.warn('Failed to save collapsed categories to localStorage:', e);
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
export const BlockLibrary: React.FC = observer(() => {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [collapsedCategories, setCollapsedCategories] = useState<Set<BlockCategory>>(
    loadCollapsedCategories
  );

  // Track which category currently has focus (for keyboard navigation)
  const [focusedCategory, setFocusedCategory] = useState<BlockCategory | null>(null);

  // Selected block type (for preview/detail view)
  const [selectedType, setSelectedType] = useState<BlockTypeInfo | null>(null);

  // Callbacks
  const toggleCategory = useCallback((category: BlockCategory) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      saveCollapsedCategories(next);
      return next;
    });
  }, []);

  const handleBlockClick = useCallback((type: BlockTypeInfo) => {
    setSelectedType(type);
  }, []);

  const handleBlockDoubleClick = useCallback((type: BlockTypeInfo) => {
    // TODO: Add block to canvas
    console.log('Add block:', type.type);
  }, []);

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

  // Keyboard navigation
  useEffect(() => {
    if (debouncedSearchQuery && searchQuery === debouncedSearchQuery) {
      handleSearchClear();
    }
  }, [handleSearchClear]);

  const categories = getBlockCategories();

  // Calculate total results across all categories
  const totalResults = useMemo(() => {
    let count = 0;
    categories.forEach((category: string) => {
      const types = getBlockTypesByCategory(category);
      const filtered = debouncedSearchQuery
        ? types.filter((t: BlockDef) =>
            t.type.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
            t.label.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
            (t.description?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ?? false)
          )
        : types;
      count += filtered.length;
    });
    return count;
  }, [categories, debouncedSearchQuery]);

  return (
    <div className="block-library">
      <div className="block-library__header">
        <h2 className="block-library__title">Blocks</h2>

        <div className="block-library__search">
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
            <button
              className="block-library__search-clear"
              onClick={handleSearchClear}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {debouncedSearchQuery && (
          <div className="block-library__search-results">
            {totalResults} {totalResults === 1 ? 'result' : 'results'}
          </div>
        )}
      </div>

      <div className="block-library__categories">
        {categories.map((category: string) => (
          <BlockCategorySection
            key={category}
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
      </div>

      {selectedType && (
        <div className="block-library__preview">
          <h3>{selectedType.label}</h3>
          <p className="block-library__preview-type">{selectedType.type}</p>
          {selectedType.description && (
            <p className="block-library__preview-description">
              {selectedType.description}
            </p>
          )}
          <div className="block-library__preview-ports">
            <div className="block-library__preview-inputs">
              <h4>Inputs</h4>
              <ul>
                {selectedType.inputs.map((input) => (
                  <li key={input.id}>
                    <strong>{input.label}</strong>: {input.type}
                    {input.optional && <span className="optional">(optional)</span>}
                  </li>
                ))}
              </ul>
            </div>
            <div className="block-library__preview-outputs">
              <h4>Outputs</h4>
              <ul>
                {selectedType.outputs.map((output) => (
                  <li key={output.id}>
                    <strong>{output.label}</strong>: {output.type}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

/**
 * Block Category Section
 */
interface BlockCategorySectionProps {
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
  category,
  collapsed,
  searchQuery,
  onToggle,
  onBlockClick,
  onBlockDoubleClick,
  focused,
  onFocus,
}) => {
  const types = getBlockTypesByCategory(category);

  const filteredTypes = useMemo(() => {
    if (!searchQuery) return types;
    return types.filter((t: BlockDef) =>
      t.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
    );
  }, [types, searchQuery]);

  if (filteredTypes.length === 0) return null;

  return (
    <div
      className={`block-category ${collapsed ? 'collapsed' : ''} ${focused ? 'focused' : ''}`}
      onFocus={onFocus}
    >
      <div className="block-category__header" onClick={() => onToggle(category)}>
        <span className="block-category__icon">{collapsed ? '▶' : '▼'}</span>
        <h3 className="block-category__title">{category}</h3>
        <span className="block-category__count">{filteredTypes.length}</span>
      </div>

      {!collapsed && (
        <div className="block-category__types">
          {filteredTypes.map((type: BlockDef, index: number) => (
            <BlockTypeItem
              key={type.type}
              type={type}
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
  onClick: (type: BlockTypeInfo) => void;
  onDoubleClick: (type: BlockTypeInfo) => void;
}

const BlockTypeItem: React.FC<BlockTypeItemProps> = ({
  type,
  onClick,
  onDoubleClick,
}) => {
  return (
    <div
      className="block-type-item"
      onClick={() => onClick(type)}
      onDoubleClick={() => onDoubleClick(type)}
    >
      <div className="block-type-item__icon">
        {/* TODO: Add block icon based on category/capability */}
        📦
      </div>
      <div className="block-type-item__info">
        <div className="block-type-item__label">{type.label}</div>
        <div className="block-type-item__type">{type.type}</div>
      </div>
    </div>
  );
};
