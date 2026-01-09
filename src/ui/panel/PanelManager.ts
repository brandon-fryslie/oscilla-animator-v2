/**
 * Panel Manager
 *
 * Singleton that creates and manages jsPanel instances.
 */

import type { JsPanel, JsPanelStatic, JsPanelOptions } from 'jspanel4';
import type { PanelConfig, PanelInstance, PanelRegion } from './types';
import { buildResizeitConfig } from './types';
import { colors } from '../theme';

/**
 * Panel manager singleton.
 * Manages all panel instances and provides factory methods.
 */
export class PanelManager {
  private static instance: PanelManager;
  private panels: Map<string, PanelInstance> = new Map();
  private jsPanel: JsPanelStatic | null = null;
  private initialized = false;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get the singleton instance.
   */
  static getInstance(): PanelManager {
    if (!PanelManager.instance) {
      PanelManager.instance = new PanelManager();
    }
    return PanelManager.instance;
  }

  /**
   * Initialize the panel manager.
   * Must be called before creating panels.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Dynamic import of jsPanel4
    // Using the es6module export from the local fork
    const jsPanelModule = await import('jspanel4/es6module/jspanel.js');
    this.jsPanel = jsPanelModule.default || jsPanelModule.jsPanel;

    if (!this.jsPanel) {
      throw new Error('Failed to load jsPanel4');
    }

    // Import CSS
    await import('jspanel4/dist/jspanel.css');

    // Configure jsPanel defaults for our dark theme
    this.jsPanel.defaults = {
      ...this.jsPanel.defaults,
      theme: {
        bgPanel: colors.bgPanel,
        bgContent: colors.bgContent,
        colorHeader: colors.textPrimary,
        colorContent: colors.textPrimary,
        border: `1px solid ${colors.border}`,
      },
      boxShadow: 0,
      borderRadius: 8,
      headerControls: { size: 'xs' },
    };

    this.initialized = true;
  }

  /**
   * Check if initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Create a new panel.
   */
  createPanel(config: PanelConfig): PanelInstance {
    if (!this.initialized || !this.jsPanel) {
      throw new Error('PanelManager not initialized. Call init() first.');
    }

    if (this.panels.has(config.id)) {
      throw new Error(`Panel with id "${config.id}" already exists`);
    }

    // Get the container element for this region
    const containerSelector = `#region-${config.region}`;
    const container = document.querySelector(containerSelector);
    if (!container) {
      throw new Error(`Region container not found: ${containerSelector}`);
    }

    // Build jsPanel options
    const options: JsPanelOptions = {
      id: config.id,
      headerTitle: config.title,
      header: config.showHeader !== false,
      container: containerSelector,
      position: {
        my: 'left-top',
        at: 'left-top',
        of: containerSelector,
      },
      panelSize: {
        width: config.initialWidth ?? '100%',
        height: config.initialHeight ?? '100%',
      },
      dragit: 'disabled', // No dragging - fixed layout
      resizeit: buildResizeitConfig(config),
      headerControls: {
        size: config.headerSize ?? 'xs',
        close: 'remove',
        maximize: 'remove',
        minimize: 'remove',
        normalize: 'remove',
        smallify: 'remove',
      },
      theme: config.theme ?? {
        bgPanel: colors.bgPanel,
        bgContent: colors.bgContent,
        colorHeader: colors.textPrimary,
        colorContent: colors.textPrimary,
        border: `1px solid ${colors.border}`,
      },
      borderRadius: 8,
      boxShadow: 0,
      onclosed: [],
      onstatuschange: [],
    };

    // Create the panel
    const panel = this.jsPanel.create(options);

    // Add custom class if specified
    if (config.className) {
      panel.classList.add(config.className);
    }

    // Create the instance object
    const instance: PanelInstance = {
      id: config.id,
      config,
      panel,
      contentElement: panel.content,
      cleanup: undefined,
      destroy: () => this.destroyPanel(config.id),
      resize: (width, height) => {
        panel.resize({ width, height });
      },
      setTitle: (title) => {
        panel.setHeaderTitle(title);
      },
    };

    // Call content factory
    const cleanup = config.contentFactory(panel.content);
    if (typeof cleanup === 'function') {
      instance.cleanup = cleanup;
    }

    // Set up close handler
    if (config.onClose) {
      panel.options.onclosed = panel.options.onclosed || [];
      panel.options.onclosed.push(() => {
        config.onClose!();
        return true;
      });
    }

    // Set up resize handler
    if (config.onResize && panel.options.resizeit !== 'disabled') {
      const resizeitConfig = panel.options.resizeit as { resize?: Function[] };
      if (resizeitConfig) {
        resizeitConfig.resize = resizeitConfig.resize || [];
        resizeitConfig.resize.push((_panel: JsPanel, size: { width: number; height: number }) => {
          config.onResize!(size.width, size.height);
        });
      }
    }

    // Store the instance
    this.panels.set(config.id, instance);

    return instance;
  }

  /**
   * Get a panel by ID.
   */
  getPanel(id: string): PanelInstance | undefined {
    return this.panels.get(id);
  }

  /**
   * Get all panels.
   */
  getAllPanels(): PanelInstance[] {
    return Array.from(this.panels.values());
  }

  /**
   * Get panels in a specific region.
   */
  getPanelsInRegion(region: PanelRegion): PanelInstance[] {
    return this.getAllPanels().filter(p => p.config.region === region);
  }

  /**
   * Destroy a panel by ID.
   */
  destroyPanel(id: string): boolean {
    const instance = this.panels.get(id);
    if (!instance) {
      return false;
    }

    // Call cleanup if provided
    if (instance.cleanup) {
      try {
        instance.cleanup();
      } catch (e) {
        console.error(`Error cleaning up panel ${id}:`, e);
      }
    }

    // Close the panel
    try {
      instance.panel.close();
    } catch (e) {
      // Panel might already be closed
    }

    // Remove from map
    this.panels.delete(id);

    return true;
  }

  /**
   * Destroy all panels.
   */
  destroyAll(): void {
    for (const [id] of this.panels) {
      this.destroyPanel(id);
    }
  }

  /**
   * Check if a panel exists.
   */
  hasPanel(id: string): boolean {
    return this.panels.has(id);
  }

  /**
   * Get the jsPanel static object (for advanced usage).
   */
  getJsPanel(): JsPanelStatic | null {
    return this.jsPanel;
  }
}

export default PanelManager;
