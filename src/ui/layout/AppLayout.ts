/**
 * Application Layout
 *
 * Main layout orchestrator that initializes the panel system
 * and creates the core layout structure.
 */

import { PanelManager, type PanelConfig, type PanelRegion } from '../panel';
import { REGIONS, verifyRegions, getRegionElement } from './regions';

/**
 * Application layout manager.
 * Orchestrates the overall UI layout and panel system.
 */
export class AppLayout {
  private panelManager: PanelManager;
  private initialized = false;

  constructor() {
    this.panelManager = PanelManager.getInstance();
  }

  /**
   * Initialize the layout system.
   * Must be called after DOM is ready.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Initialize panel manager
    await this.panelManager.init();

    // Verify DOM structure
    verifyRegions();

    // Apply resize constraints from region config
    this.applyRegionConstraints();

    this.initialized = true;
  }

  /**
   * Check if initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Apply CSS constraints from region config.
   */
  private applyRegionConstraints(): void {
    for (const [region, config] of Object.entries(REGIONS)) {
      const el = getRegionElement(region as PanelRegion);
      if (!el) continue;

      if (config.minWidth) {
        el.style.minWidth = `${config.minWidth}px`;
      }
      if (config.maxWidth) {
        el.style.maxWidth = `${config.maxWidth}px`;
      }
      if (config.minHeight) {
        el.style.minHeight = `${config.minHeight}px`;
      }
      if (config.maxHeight) {
        el.style.maxHeight = `${config.maxHeight}px`;
      }
    }
  }

  /**
   * Create a panel in a region.
   */
  createPanel(config: PanelConfig): void {
    this.ensureInitialized();
    this.panelManager.createPanel(config);
  }

  /**
   * Get a region's container element.
   */
  getRegionElement(region: PanelRegion): HTMLElement {
    const el = getRegionElement(region);
    if (!el) {
      throw new Error(`Region element not found: ${region}`);
    }
    return el;
  }

  /**
   * Get the panel manager.
   */
  getPanelManager(): PanelManager {
    return this.panelManager;
  }

  /**
   * Get the toolbar element.
   */
  getToolbar(): HTMLElement {
    const el = document.getElementById('toolbar');
    if (!el) {
      throw new Error('Toolbar element not found');
    }
    return el;
  }

  /**
   * Get the stats overlay element.
   */
  getStatsElement(): HTMLElement {
    const el = document.getElementById('stats');
    if (!el) {
      throw new Error('Stats element not found');
    }
    return el;
  }

  /**
   * Get the controls overlay element.
   */
  getControlsElement(): HTMLElement {
    const el = document.getElementById('controls');
    if (!el) {
      throw new Error('Controls element not found');
    }
    return el;
  }

  /**
   * Destroy all panels and cleanup.
   */
  destroy(): void {
    this.panelManager.destroyAll();
    this.initialized = false;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('AppLayout not initialized. Call init() first.');
    }
  }
}

/**
 * Singleton instance.
 */
let appLayoutInstance: AppLayout | null = null;

/**
 * Get the application layout instance.
 */
export function getAppLayout(): AppLayout {
  if (!appLayoutInstance) {
    appLayoutInstance = new AppLayout();
  }
  return appLayoutInstance;
}

export default AppLayout;
