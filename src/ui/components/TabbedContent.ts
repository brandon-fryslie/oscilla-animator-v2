/**
 * Tabbed Content Component
 *
 * A lightweight tabbed interface component.
 * Uses vanilla TypeScript for simplicity (no React dependency).
 */

import { colors } from '../theme';

/**
 * Tab configuration.
 */
export interface TabConfig {
  /** Unique tab identifier */
  id: string;

  /** Tab label displayed in tab bar */
  label: string;

  /**
   * Factory function to create tab content.
   * Receives the content container element.
   * Can return a cleanup function.
   */
  contentFactory: (container: HTMLElement) => void | (() => void);

  /** Optional icon HTML/text */
  icon?: string;

  /** Whether tab is disabled */
  disabled?: boolean;
}

/**
 * Tab change event callback.
 */
export type TabChangeCallback = (tabId: string, previousTabId: string | null) => void;

/**
 * Tabbed content component.
 * Manages a set of tabs with switchable content.
 */
export class TabbedContent {
  private container: HTMLElement;
  private tabs: TabConfig[];
  private activeTabId: string;
  private tabBar: HTMLElement;
  private contentArea: HTMLElement;
  private cleanupFunctions: Map<string, () => void> = new Map();
  private onTabChange?: TabChangeCallback;
  private contentCache: Map<string, HTMLElement> = new Map();
  private cacheContent: boolean;

  /**
   * Create a tabbed content component.
   *
   * @param container - Container element to render into
   * @param tabs - Tab configurations
   * @param options - Optional settings
   */
  constructor(
    container: HTMLElement,
    tabs: TabConfig[],
    options: {
      initialTab?: string;
      onTabChange?: TabChangeCallback;
      cacheContent?: boolean;
    } = {}
  ) {
    this.container = container;
    this.tabs = tabs;
    this.activeTabId = options.initialTab ?? tabs[0]?.id ?? '';
    this.onTabChange = options.onTabChange;
    this.cacheContent = options.cacheContent ?? false;

    this.tabBar = document.createElement('div');
    this.contentArea = document.createElement('div');

    this.render();
  }

  /**
   * Render the component.
   */
  private render(): void {
    // Clear container
    this.container.innerHTML = '';

    // Setup container styles
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.overflow = 'hidden';

    // Create tab bar
    this.tabBar.className = 'oscilla-tab-bar';
    this.applyTabBarStyles();

    // Create content area
    this.contentArea.className = 'oscilla-tab-content';
    this.applyContentAreaStyles();

    // Render tabs
    this.renderTabs();

    // Append to container
    this.container.appendChild(this.tabBar);
    this.container.appendChild(this.contentArea);

    // Render initial content
    this.renderContent();
  }

  /**
   * Apply styles to tab bar.
   */
  private applyTabBarStyles(): void {
    Object.assign(this.tabBar.style, {
      display: 'flex',
      gap: '2px',
      padding: '4px 4px 0 4px',
      background: colors.bgPanel,
      borderBottom: `1px solid ${colors.border}`,
      flexShrink: '0',
    });
  }

  /**
   * Apply styles to content area.
   */
  private applyContentAreaStyles(): void {
    Object.assign(this.contentArea.style, {
      flex: '1',
      overflow: 'auto',
      background: colors.bgContent,
      position: 'relative',
    });
  }

  /**
   * Render tab buttons.
   */
  private renderTabs(): void {
    this.tabBar.innerHTML = '';

    for (const tab of this.tabs) {
      const button = document.createElement('button');
      button.className = 'oscilla-tab-button';
      button.dataset.tabId = tab.id;
      button.disabled = tab.disabled ?? false;

      // Tab content
      if (tab.icon) {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'tab-icon';
        iconSpan.innerHTML = tab.icon;
        button.appendChild(iconSpan);
      }

      const labelSpan = document.createElement('span');
      labelSpan.className = 'tab-label';
      labelSpan.textContent = tab.label;
      button.appendChild(labelSpan);

      // Apply styles
      this.applyTabButtonStyles(button, tab.id === this.activeTabId, tab.disabled ?? false);

      // Click handler
      if (!tab.disabled) {
        button.addEventListener('click', () => this.setActiveTab(tab.id));
      }

      this.tabBar.appendChild(button);
    }
  }

  /**
   * Apply styles to a tab button.
   */
  private applyTabButtonStyles(button: HTMLElement, isActive: boolean, isDisabled: boolean): void {
    Object.assign(button.style, {
      padding: '6px 12px',
      background: isActive ? colors.bgContent : 'transparent',
      border: 'none',
      borderRadius: '4px 4px 0 0',
      color: isDisabled ? colors.textMuted : (isActive ? colors.primary : colors.textSecondary),
      fontSize: '0.875rem',
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      transition: 'background 0.15s, color 0.15s',
      opacity: isDisabled ? '0.5' : '1',
    });

    // Hover effect (only for non-active, non-disabled)
    if (!isActive && !isDisabled) {
      button.addEventListener('mouseenter', () => {
        button.style.background = 'rgba(255, 255, 255, 0.05)';
        button.style.color = colors.textPrimary;
      });
      button.addEventListener('mouseleave', () => {
        button.style.background = 'transparent';
        button.style.color = colors.textSecondary;
      });
    }
  }

  /**
   * Set the active tab.
   */
  setActiveTab(tabId: string): void {
    if (tabId === this.activeTabId) return;

    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab || tab.disabled) return;

    const previousTabId = this.activeTabId;
    this.activeTabId = tabId;

    // Update tab bar
    this.renderTabs();

    // Render new content
    this.renderContent();

    // Notify callback
    if (this.onTabChange) {
      this.onTabChange(tabId, previousTabId);
    }
  }

  /**
   * Get the active tab ID.
   */
  getActiveTabId(): string {
    return this.activeTabId;
  }

  /**
   * Render content for the active tab.
   */
  private renderContent(): void {
    // Check cache first
    if (this.cacheContent && this.contentCache.has(this.activeTabId)) {
      const cached = this.contentCache.get(this.activeTabId)!;
      this.contentArea.innerHTML = '';
      this.contentArea.appendChild(cached);
      return;
    }

    // Clear content area
    this.contentArea.innerHTML = '';

    // Find active tab
    const tab = this.tabs.find(t => t.id === this.activeTabId);
    if (!tab) return;

    // Create content container
    const contentContainer = document.createElement('div');
    contentContainer.style.height = '100%';
    contentContainer.style.overflow = 'auto';

    // Call content factory
    const cleanup = tab.contentFactory(contentContainer);
    if (typeof cleanup === 'function') {
      this.cleanupFunctions.set(tab.id, cleanup);
    }

    // Cache if enabled
    if (this.cacheContent) {
      this.contentCache.set(tab.id, contentContainer);
    }

    this.contentArea.appendChild(contentContainer);
  }

  /**
   * Add a new tab.
   */
  addTab(tab: TabConfig, position?: number): void {
    if (position !== undefined) {
      this.tabs.splice(position, 0, tab);
    } else {
      this.tabs.push(tab);
    }
    this.renderTabs();
  }

  /**
   * Remove a tab.
   */
  removeTab(tabId: string): boolean {
    const index = this.tabs.findIndex(t => t.id === tabId);
    if (index === -1) return false;

    // Cleanup if this tab has content
    const cleanup = this.cleanupFunctions.get(tabId);
    if (cleanup) {
      cleanup();
      this.cleanupFunctions.delete(tabId);
    }

    // Remove from cache
    this.contentCache.delete(tabId);

    // Remove tab
    this.tabs.splice(index, 1);

    // If removed tab was active, switch to first tab
    if (tabId === this.activeTabId && this.tabs.length > 0) {
      this.setActiveTab(this.tabs[0].id);
    }

    this.renderTabs();
    return true;
  }

  /**
   * Update a tab's configuration.
   */
  updateTab(tabId: string, updates: Partial<Omit<TabConfig, 'id'>>): boolean {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return false;

    Object.assign(tab, updates);
    this.renderTabs();

    // If content factory changed and this is active tab, re-render
    if (updates.contentFactory && tabId === this.activeTabId) {
      // Cleanup old content
      const cleanup = this.cleanupFunctions.get(tabId);
      if (cleanup) {
        cleanup();
        this.cleanupFunctions.delete(tabId);
      }
      this.contentCache.delete(tabId);
      this.renderContent();
    }

    return true;
  }

  /**
   * Destroy the component and cleanup.
   */
  destroy(): void {
    // Call all cleanup functions
    for (const cleanup of this.cleanupFunctions.values()) {
      try {
        cleanup();
      } catch (e) {
        console.error('Error during tab cleanup:', e);
      }
    }
    this.cleanupFunctions.clear();
    this.contentCache.clear();

    // Clear container
    this.container.innerHTML = '';
  }
}

export default TabbedContent;
