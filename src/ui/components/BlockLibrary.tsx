/**
 * Block Library Component (React)
 *
 * Browse available block types organized by category.
 * Click to preview type in inspector, double-click to add block.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useStores } from '../../stores';
import {
  getBlockCategories,
  getBlockTypesByCategory,
  type BlockDef,
} from '../../blocks/registry';
import { useEditor } from '../editorCommon';
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
function loadCollapsedCategories(diagnostics: any): Set<BlockCategory> {
  try {
    const stored = localStorage.getItem(COLLAPSE_STATE_KEY);
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
function saveCollapsedCategories(collapsed: Set<BlockCategory>, diagnostics: any): void {
  try {
    localStorage.setItem(COLLAPSE_STATE_KEY, JSON.stringify(Array.from(collapsed)));
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
  const { selection, patch, diagnostics } = useStores();
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
  }, []); // TODO: add selection to dependency array for correctness (currently relying on closure)

  const handleBlockDoubleClick = useCallback(
    (type: BlockTypeInfo) => {
      // Add block to PatchStore
      const blockId = patch.addBlock(type.type, {}, {
        displayName: type.label,
      });

      // If editor is ready, add node to editor using generic interface
      if (editorHandle) {
        editorHandle.addBlock(blockId, type.type).then(() => {
          // Select the new block
          selection.selectBlock(blockId);
        });
      }
    }, // TODO: add selection, patch, editorHandle to dependency array for correctness
    [editorHandle]
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

  const categories = getBlockCategories();

  // Filter out timeRoot blocks (P5: TimeRoot Hidden)
  const filteredCategories = useMemo(() => {
    return categories.filter(category => {
      const types = getBlockTypesByCategory(category);
      // Check if category has any non-timeRoot blocks
      return types.some((t: BlockDef) => t.capability !== 'time');
    });
  }, [categories]);

  // Calculate total results across all categories
  const totalResults = useMemo(() => {
    let count = 0;
    filteredCategories.forEach((category: string) => {
      const types = getBlockTypesByCategory(category);
      // Filter out timeRoot blocks
      const nonTimeRootTypes = types.filter((t: BlockDef) => t.capability !== 'time');
      const filtered = debouncedSearchQuery
        ? nonTimeRootTypes.filter((t: BlockDef) =>
          t.type.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
          t.label.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
          (t.description?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ?? false)
        )
        : nonTimeRootTypes;
      count += filtered.length;
    });
    return count;
  }, [filteredCategories, debouncedSearchQuery]);

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
            <IconButton
              onClick={handleSearchClear}
              size="small"
              aria-label="Clear search"
              sx={{
                position: 'absolute',
                right: '4px',
                top: '50%',
                transform: 'translateY(-50%)',
                padding: '4px',
                color: '#888',
                '&:hover': {
                  color: '#fff',
                  background: 'rgba(255, 255, 255, 0.1)',
                },
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
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

  // Filter out timeRoot blocks (P5: TimeRoot Hidden)
  const nonTimeRootTypes = useMemo(() => {
    return types.filter((t: BlockDef) => t.capability !== 'time');
  }, [types]);

  const filteredTypes = useMemo(() => {
    if (!searchQuery) return nonTimeRootTypes;
    return nonTimeRootTypes.filter((t: BlockDef) =>
      t.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
    );
  }, [nonTimeRootTypes, searchQuery]);

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
          {filteredTypes.map((type: BlockDef) => (
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
  category,
  onClick,
  onDoubleClick,
}) => {
  const inputCount = Object.keys(type.inputs).length;
  const outputCount = Object.keys(type.outputs).length;
  const isPrimitive = type.form === 'primitive';

  return (
    <div
      className="block-type-item"
      onClick={() => onClick(type)}
      onDoubleClick={() => onDoubleClick(type)}
    >
      <div className="block-type-item__icon" />
      <div className="block-type-item__info">
        <div className="block-type-item__header">
          <span className="block-type-item__label">{type.label}</span>
          <span
            className={`block-type-item__badge ${isPrimitive ? 'block-type-item__badge--primitive' : 'block-type-item__badge--macro'}`}
          >
            {isPrimitive ? 'P' : 'M'}
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
