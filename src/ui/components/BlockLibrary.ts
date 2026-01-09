/**
 * Block Library Component
 *
 * Browse available block types organized by category.
 */

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
export class BlockLibrary {
  private container: HTMLElement;
  private expandedCategories = new Set<BlockCategory>();
  private searchQuery = '';

  constructor(container: HTMLElement) {
    this.container = container;
    // Expand all categories by default
    this.expandedCategories = new Set(getBlockCategories());
    this.render();
  }

  /**
   * Render the library.
   */
  private render(): void {
    this.container.innerHTML = '';

    // Apply container styles
    Object.assign(this.container.style, {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      background: colors.bgContent,
    });

    // Header with search
    const header = this.createHeader();
    this.container.appendChild(header);

    // Scrollable content
    const scrollContainer = document.createElement('div');
    Object.assign(scrollContainer.style, {
      flex: '1',
      overflow: 'auto',
      padding: '0.5rem',
    });

    // Render categories
    const categories = getBlockCategories();
    for (const category of categories) {
      const categorySection = this.createCategorySection(category);
      if (categorySection) {
        scrollContainer.appendChild(categorySection);
      }
    }

    this.container.appendChild(scrollContainer);
  }

  /**
   * Create header with search input.
   */
  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    Object.assign(header.style, {
      padding: '0.75rem 1rem',
      borderBottom: `1px solid ${colors.border}`,
      background: colors.bgPanel,
      flexShrink: '0',
    });

    // Title
    const title = document.createElement('h3');
    title.textContent = 'Block Library';
    Object.assign(title.style, {
      margin: '0 0 0.5rem 0',
      fontSize: '0.875rem',
      fontWeight: '600',
      color: colors.textPrimary,
    });
    header.appendChild(title);

    // Search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search blocks...';
    searchInput.value = this.searchQuery;
    Object.assign(searchInput.style, {
      width: '100%',
      padding: '0.5rem',
      background: colors.bgContent,
      border: `1px solid ${colors.border}`,
      borderRadius: '4px',
      color: colors.textPrimary,
      fontSize: '0.8125rem',
    });

    searchInput.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.render();
    });

    header.appendChild(searchInput);

    return header;
  }

  /**
   * Create a category section.
   */
  private createCategorySection(category: BlockCategory): HTMLElement | null {
    const types = getBlockTypesByCategory(category);

    // Filter by search query
    const filteredTypes = this.searchQuery
      ? types.filter(t =>
          t.type.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
          t.label.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
          t.description.toLowerCase().includes(this.searchQuery.toLowerCase())
        )
      : types;

    if (filteredTypes.length === 0) return null;

    const section = document.createElement('div');
    Object.assign(section.style, {
      marginBottom: '0.5rem',
    });

    // Category header
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'center',
      padding: '0.5rem',
      cursor: 'pointer',
      background: colors.bgPanel,
      borderRadius: '4px',
      marginBottom: '0.25rem',
      userSelect: 'none',
    });

    const isExpanded = this.expandedCategories.has(category);

    // Expand icon
    const expandIcon = document.createElement('span');
    expandIcon.textContent = isExpanded ? '▼' : '▸';
    Object.assign(expandIcon.style, {
      marginRight: '0.5rem',
      color: colors.textMuted,
      fontFamily: 'monospace',
      fontSize: '0.875rem',
    });
    header.appendChild(expandIcon);

    // Category name
    const nameEl = document.createElement('span');
    nameEl.textContent = category;
    Object.assign(nameEl.style, {
      fontSize: '0.8125rem',
      fontWeight: '600',
      color: colors.textPrimary,
      flex: '1',
    });
    header.appendChild(nameEl);

    // Block count
    const countEl = document.createElement('span');
    countEl.textContent = filteredTypes.length.toString();
    Object.assign(countEl.style, {
      fontSize: '0.75rem',
      color: colors.textMuted,
      background: colors.bgContent,
      padding: '0.125rem 0.5rem',
      borderRadius: '12px',
    });
    header.appendChild(countEl);

    // Toggle expand on click
    header.addEventListener('click', () => {
      if (this.expandedCategories.has(category)) {
        this.expandedCategories.delete(category);
      } else {
        this.expandedCategories.add(category);
      }
      this.render();
    });

    section.appendChild(header);

    // Block list (if expanded)
    if (isExpanded) {
      const blockList = document.createElement('div');
      Object.assign(blockList.style, {
        paddingLeft: '1rem',
      });

      for (const type of filteredTypes) {
        const blockItem = this.createBlockItem(type);
        blockList.appendChild(blockItem);
      }

      section.appendChild(blockList);
    }

    return section;
  }

  /**
   * Create a block type item.
   */
  private createBlockItem(type: BlockTypeInfo): HTMLElement {
    const item = document.createElement('div');
    Object.assign(item.style, {
      padding: '0.5rem',
      marginBottom: '0.25rem',
      background: colors.bgContent,
      borderRadius: '4px',
      cursor: 'pointer',
      transition: 'background 0.15s',
    });

    // Block name
    const nameEl = document.createElement('div');
    nameEl.textContent = type.label;
    Object.assign(nameEl.style, {
      fontSize: '0.8125rem',
      fontWeight: '500',
      color: colors.primary,
      marginBottom: '0.25rem',
    });
    item.appendChild(nameEl);

    // Block type (monospace)
    const typeEl = document.createElement('div');
    typeEl.textContent = type.type;
    Object.assign(typeEl.style, {
      fontSize: '0.7rem',
      fontFamily: "'Courier New', monospace",
      color: colors.textMuted,
      marginBottom: '0.25rem',
    });
    item.appendChild(typeEl);

    // Description
    const descEl = document.createElement('div');
    descEl.textContent = type.description;
    Object.assign(descEl.style, {
      fontSize: '0.7rem',
      color: colors.textSecondary,
      lineHeight: '1.4',
    });
    item.appendChild(descEl);

    // Port counts
    const portsEl = document.createElement('div');
    portsEl.textContent = `${type.inputs.length} in, ${type.outputs.length} out`;
    Object.assign(portsEl.style, {
      fontSize: '0.65rem',
      color: colors.textMuted,
      marginTop: '0.25rem',
    });
    item.appendChild(portsEl);

    // Hover effect
    item.addEventListener('mouseenter', () => {
      item.style.background = 'rgba(255, 255, 255, 0.05)';
    });

    item.addEventListener('mouseleave', () => {
      item.style.background = colors.bgContent;
    });

    // Click to show details (future: show in inspector)
    item.addEventListener('click', () => {
      console.log('Block type selected:', type.type);
      // TODO: Show type preview in inspector
    });

    return item;
  }

  /**
   * Destroy the component and cleanup.
   */
  destroy(): void {
    this.container.innerHTML = '';
  }
}
