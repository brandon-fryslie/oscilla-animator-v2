/**
 * Block Library Component (React)
 *
 * Browse available block types organized by category.
 * Click to preview, double-click to add block.
 */

import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { rootStore } from '../../stores';
import { colors } from '../theme';
import {
  getBlockCategories,
  getBlockTypesByCategory,
  type BlockCategory,
  type BlockTypeInfo,
} from '../registry/blockTypes';

/**
 * Block Library component.
 */
export const BlockLibrary = observer(function BlockLibrary() {
  const [expandedCategories, setExpandedCategories] = useState<Set<BlockCategory>>(
    new Set(getBlockCategories())
  );
  const [searchQuery, setSearchQuery] = useState('');

  const toggleCategory = (category: BlockCategory) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleBlockClick = (type: BlockTypeInfo) => {
    // Click = preview mode
    rootStore.selection.setPreviewType(type.type);
  };

  const handleBlockDoubleClick = (type: BlockTypeInfo) => {
    // Double-click = add block
    const blockId = rootStore.patch.addBlock(type.type, {});
    // Select the newly added block
    rootStore.selection.selectBlock(blockId);
  };

  const categories = getBlockCategories();

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      background: colors.bgContent,
    }}>
      {/* Header with search */}
      <div style={{
        padding: '0.75rem 1rem',
        borderBottom: `1px solid ${colors.border}`,
        background: colors.bgPanel,
        flexShrink: 0,
      }}>
        <h3 style={{
          margin: '0 0 0.5rem 0',
          fontSize: '0.875rem',
          fontWeight: '600',
          color: colors.textPrimary,
        }}>
          Block Library
        </h3>

        <input
          type="text"
          placeholder="Search blocks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem',
            background: colors.bgContent,
            border: `1px solid ${colors.border}`,
            borderRadius: '4px',
            color: colors.textPrimary,
            fontSize: '0.8125rem',
          }}
        />
      </div>

      {/* Scrollable content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '0.5rem',
      }}>
        {categories.map(category => (
          <CategorySection
            key={category}
            category={category}
            isExpanded={expandedCategories.has(category)}
            searchQuery={searchQuery}
            onToggle={() => toggleCategory(category)}
            onBlockClick={handleBlockClick}
            onBlockDoubleClick={handleBlockDoubleClick}
          />
        ))}
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
}

const CategorySection: React.FC<CategorySectionProps> = ({
  category,
  isExpanded,
  searchQuery,
  onToggle,
  onBlockClick,
  onBlockDoubleClick,
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
    <div style={{ marginBottom: '0.5rem' }}>
      {/* Category header */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0.5rem',
          cursor: 'pointer',
          background: colors.bgPanel,
          borderRadius: '4px',
          marginBottom: '0.25rem',
          userSelect: 'none',
        }}
      >
        <span style={{
          marginRight: '0.5rem',
          color: colors.textMuted,
          fontFamily: 'monospace',
          fontSize: '0.875rem',
        }}>
          {isExpanded ? '▼' : '▸'}
        </span>

        <span style={{
          fontSize: '0.8125rem',
          fontWeight: '600',
          color: colors.textPrimary,
          flex: 1,
        }}>
          {category}
        </span>

        <span style={{
          fontSize: '0.75rem',
          color: colors.textMuted,
          background: colors.bgContent,
          padding: '0.125rem 0.5rem',
          borderRadius: '12px',
        }}>
          {filteredTypes.length}
        </span>
      </div>

      {/* Block list (if expanded) */}
      {isExpanded && (
        <div style={{ paddingLeft: '1rem' }}>
          {filteredTypes.map(type => (
            <BlockItem
              key={type.type}
              type={type}
              onClick={() => onBlockClick(type)}
              onDoubleClick={() => onBlockDoubleClick(type)}
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
}

const BlockItem: React.FC<BlockItemProps> = ({ type, onClick, onDoubleClick }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: '0.5rem',
        marginBottom: '0.25rem',
        background: isHovered ? 'rgba(255, 255, 255, 0.05)' : colors.bgContent,
        borderRadius: '4px',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
    >
      {/* Block name */}
      <div style={{
        fontSize: '0.8125rem',
        fontWeight: '500',
        color: colors.primary,
        marginBottom: '0.25rem',
      }}>
        {type.label}
      </div>

      {/* Block type (monospace) */}
      <div style={{
        fontSize: '0.7rem',
        fontFamily: "'Courier New', monospace",
        color: colors.textMuted,
        marginBottom: '0.25rem',
      }}>
        {type.type}
      </div>

      {/* Description */}
      <div style={{
        fontSize: '0.7rem',
        color: colors.textSecondary,
        lineHeight: '1.4',
      }}>
        {type.description}
      </div>

      {/* Port counts */}
      <div style={{
        fontSize: '0.65rem',
        color: colors.textMuted,
        marginTop: '0.25rem',
      }}>
        {type.inputs.length} in, {type.outputs.length} out
      </div>
    </div>
  );
};
