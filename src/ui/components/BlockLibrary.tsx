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
  type BlockCategory,
  type BlockTypeInfo,
} from '../registry/blockTypes';
import './BlockLibrary.css';

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
    if (stored) {
      const parsed = JSON.parse(stored);
      return new Set(parsed);
    }
  } catch (e) {
    // Ignore parse errors
  }
  return new Set();
}

/**
 * Save collapsed categories to localStorage.
 */
function saveCollapsedCategories(collapsed: Set<BlockCategory>): void {
  try {
    localStorage.setItem(COLLAPSE_STATE_KEY, JSON.stringify(Array.from(collapsed)));
  } catch (e) {
    // Ignore storage errors
  }
}

/**
 * Custom hook for debounced search query.
 */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Block Library component.
 */
export const BlockLibrary = observer(function BlockLibrary() {
  // Collapse state (persisted to localStorage)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<BlockCategory>>(
    loadCollapsedCategories
  );

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS);

  // Keyboard navigation state
  const [focusedCategory, setFocusedCategory] = useState<BlockCategory | null>(null);
  const [focusedBlockIndex, setFocusedBlockIndex] = useState<number>(-1);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Save collapse state to localStorage whenever it changes
  useEffect(() => {
    saveCollapsedCategories(collapsedCategories);
  }, [collapsedCategories]);

  const toggleCategory = useCallback((category: BlockCategory) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const handleBlockClick = useCallback((type: BlockTypeInfo) => {
    // Click = preview mode
    rootStore.selection.setPreviewType(type.type);
  }, []);

  const handleBlockDoubleClick = useCallback((type: BlockTypeInfo) => {
    // Double-click = add block
    const blockId = rootStore.patch.addBlock(type.type, {});
    // Select the newly added block
    rootStore.selection.selectBlock(blockId);
  }, []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  const handleSearchClear = useCallback(() => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  }, []);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      handleSearchClear();
    }
  }, [handleSearchClear]);

  const categories = getBlockCategories();

  // Calculate total results across all categories
  const totalResults = useMemo(() => {
    let count = 0;
    categories.forEach(category => {
      const types = getBlockTypesByCategory(category);
      const filtered = debouncedSearchQuery
        ? types.filter(t =>
            t.type.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
            t.label.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
            t.description.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
          )
        : types;
      count += filtered.length;
    });
    return count;
  }, [categories, debouncedSearchQuery]);

  return (
    <div className="block-library">
      {/* Header with search */}
      <div className="library-header">
        <h3>Block Library</h3>

        <div className="library-search-container">
          <input
            ref={searchInputRef}
            type="text"
            className="library-search"
            placeholder="Search blocks..."
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
          />
          {searchQuery && (
            <button
              className="library-search-clear"
              onClick={handleSearchClear}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {debouncedSearchQuery && (
          <div className="library-result-count">
            {totalResults} {totalResults === 1 ? 'result' : 'results'}
          </div>
        )}
      </div>

      {/* Scrollable categories */}
      <div className="library-categories">
        {categories.map(category => (
          <CategorySection
            key={category}
            category={category}
            isExpanded={!collapsedCategories.has(category)}
            searchQuery={debouncedSearchQuery}
            onToggle={() => toggleCategory(category)}
            onBlockClick={handleBlockClick}
            onBlockDoubleClick={handleBlockDoubleClick}
            isFocused={focusedCategory === category}
            focusedBlockIndex={focusedBlockIndex}
            onFocusChange={(blockIndex) => {
              setFocusedCategory(category);
              setFocusedBlockIndex(blockIndex);
            }}
          />
        ))}

        {totalResults === 0 && debouncedSearchQuery && (
          <div className="library-no-results">
            No blocks found matching "{debouncedSearchQuery}"
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * Category section component.
 */
interface CategorySectionProps {
  category: BlockCategory;
  isExpanded: boolean;
  searchQuery: string;
  onToggle: () => void;
  onBlockClick: (type: BlockTypeInfo) => void;
  onBlockDoubleClick: (type: BlockTypeInfo) => void;
  isFocused: boolean;
  focusedBlockIndex: number;
  onFocusChange: (blockIndex: number) => void;
}

const CategorySection: React.FC<CategorySectionProps> = ({
  category,
  isExpanded,
  searchQuery,
  onToggle,
  onBlockClick,
  onBlockDoubleClick,
  isFocused,
  focusedBlockIndex,
  onFocusChange,
}) => {
  const types = getBlockTypesByCategory(category);

  // Filter by search query
  const filteredTypes = searchQuery
    ? types.filter(t =>
        t.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : types;

  if (filteredTypes.length === 0) return null;

  return (
    <div className="category">
      {/* Category header */}
      <div
        className="category-header"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <span className="category-chevron">
          {isExpanded ? '▼' : '▸'}
        </span>

        <span className="category-label">
          {category}
        </span>

        <span className="category-count">
          {filteredTypes.length}
        </span>
      </div>

      {/* Block list (if expanded) */}
      {isExpanded && (
        <div className="category-blocks">
          {filteredTypes.map((type, index) => (
            <BlockItem
              key={type.type}
              type={type}
              onClick={() => onBlockClick(type)}
              onDoubleClick={() => onBlockDoubleClick(type)}
              isFocused={isFocused && focusedBlockIndex === index}
              onFocus={() => onFocusChange(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Block item component.
 */
interface BlockItemProps {
  type: BlockTypeInfo;
  onClick: () => void;
  onDoubleClick: () => void;
  isFocused: boolean;
  onFocus: () => void;
}

const BlockItem: React.FC<BlockItemProps> = ({
  type,
  onClick,
  onDoubleClick,
  isFocused,
  onFocus,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const isSelected = rootStore.selection.previewType === type.type;
  const itemRef = useRef<HTMLDivElement>(null);

  // Scroll into view when focused
  useEffect(() => {
    if (isFocused && itemRef.current) {
      itemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isFocused]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        onDoubleClick(); // Shift+Enter = add block
      } else {
        onClick(); // Enter = preview block
      }
    }
  }, [onClick, onDoubleClick]);

  return (
    <div
      ref={itemRef}
      className={`block-item ${isSelected ? 'selected' : ''} ${isFocused ? 'keyboard-focused' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={onFocus}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
    >
      {/* Block label (bold) */}
      <div className="block-label">
        {type.label}
      </div>

      {/* Block type (monospace) */}
      <div className="block-type">
        {type.type}
      </div>

      {/* Description (gray, truncated to 3 lines) */}
      <div className="block-description">
        {type.description}
      </div>

      {/* Port counts */}
      <div className="block-ports">
        {type.inputs.length} in, {type.outputs.length} out
      </div>
    </div>
  );
};
