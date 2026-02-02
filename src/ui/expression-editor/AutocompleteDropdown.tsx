/**
 * Autocomplete Dropdown Component
 *
 * Displays autocomplete suggestions for expression editor.
 * Controlled component - all state managed by parent (ExpressionEditor).
 *
 * Features:
 * - Keyboard navigation (arrows, enter, escape)
 * - Mouse hover and click selection
 * - Type icons for different suggestion types
 * - Dark theme matching BlockInspector
 * - Positioning near cursor in textarea
 */

import React, { useRef, useEffect } from 'react';
import type { Suggestion } from '../../expr/suggestions';
import './AutocompleteDropdown.css';

// =============================================================================
// Component Props
// =============================================================================

export interface AutocompleteDropdownProps {
  /** Suggestions to display */
  readonly suggestions: readonly Suggestion[];

  /** Currently selected index (for keyboard navigation) */
  readonly selectedIndex: number;

  /** Called when a suggestion is selected (click or enter key) */
  readonly onSelect: (suggestion: Suggestion) => void;

  /** Whether the dropdown is visible */
  readonly isVisible: boolean;

  /** Position of dropdown relative to viewport */
  readonly position: { top: number; left: number };

  /** Called when close is requested (escape key) */
  readonly onClose?: () => void;
}

// =============================================================================
// Type Icons
// =============================================================================

/**
 * Get icon for suggestion type.
 * - function: f(x)
 * - block: ◆
 * - port: .
 * - output: →
 */
function getTypeIcon(type: Suggestion['type']): string {
  switch (type) {
    case 'function':
      return 'f(x)';
    case 'block':
      return '◆';
    case 'port':
      return '.';
    case 'output':
      return '→';
  }
}

// =============================================================================
// Component
// =============================================================================

/**
 * AutocompleteDropdown - Display suggestions with keyboard navigation.
 *
 * This is a controlled component. The parent manages:
 * - Visibility state
 * - Selected index
 * - Position calculation
 * - Keyboard event handling
 *
 * The dropdown provides:
 * - Visual rendering of suggestions
 * - Mouse hover and click handling
 * - Scroll support for long lists
 *
 * @example
 * ```tsx
 * <AutocompleteDropdown
 *   suggestions={filteredSuggestions}
 *   selectedIndex={selectedIndex}
 *   onSelect={handleSelect}
 *   isVisible={showDropdown}
 *   position={{ top: cursorY, left: cursorX }}
 *   onClose={handleClose}
 * />
 * ```
 */
export const AutocompleteDropdown: React.FC<AutocompleteDropdownProps> = ({
  suggestions,
  selectedIndex,
  onSelect,
  isVisible,
  position,
  onClose,
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view when selection changes
  useEffect(() => {
    if (selectedItemRef.current && isVisible) {
      selectedItemRef.current.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [selectedIndex, isVisible]);

  // Handle empty state or hidden
  if (!isVisible || suggestions.length === 0) {
    return null;
  }

  return (
    <div
      ref={dropdownRef}
      className="autocomplete-dropdown"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      <div className="autocomplete-dropdown__list">
        {suggestions.map((suggestion, index) => {
          const isSelected = index === selectedIndex;
          const icon = getTypeIcon(suggestion.type);

          return (
            <div
              key={`${suggestion.type}-${suggestion.label}-${index}`}
              ref={isSelected ? selectedItemRef : undefined}
              className={`autocomplete-dropdown__item ${
                isSelected ? 'autocomplete-dropdown__item--selected' : ''
              }`}
              onClick={() => onSelect(suggestion)}
              onMouseEnter={() => {
                // Parent will handle hover state updates if needed
                // For now, visual hover is handled by CSS
              }}
            >
              <span className="autocomplete-dropdown__icon">{icon}</span>
              <div className="autocomplete-dropdown__content">
                <span className="autocomplete-dropdown__label">
                  {suggestion.label}
                </span>
                {suggestion.description && (
                  <span className="autocomplete-dropdown__description">
                    {suggestion.description.length > 80
                      ? `${suggestion.description.substring(0, 80)}...`
                      : suggestion.description}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
