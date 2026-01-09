/**
 * Layout Regions
 *
 * Defines the layout regions for the application.
 */

import type { PanelRegion } from '../panel/types';

/**
 * Layout region configuration.
 */
export interface LayoutRegion {
  /** Unique region ID */
  id: string;

  /** CSS selector for the region element */
  selector: string;

  /** Default width (CSS value) */
  defaultWidth?: string;

  /** Default height (CSS value) */
  defaultHeight?: string;

  /** Minimum width in pixels */
  minWidth?: number;

  /** Maximum width in pixels */
  maxWidth?: number;

  /** Minimum height in pixels */
  minHeight?: number;

  /** Maximum height in pixels */
  maxHeight?: number;
}

/**
 * All layout regions.
 */
export const REGIONS: Record<PanelRegion, LayoutRegion> = {
  left: {
    id: 'region-left',
    selector: '#region-left',
    defaultWidth: '280px',
    minWidth: 200,
    maxWidth: 500,
  },
  center: {
    id: 'region-center',
    selector: '#region-center',
    minWidth: 400,
  },
  right: {
    id: 'region-right',
    selector: '#region-right',
    defaultWidth: '300px',
    minWidth: 200,
    maxWidth: 500,
  },
  bottom: {
    id: 'region-bottom',
    selector: '#region-bottom',
    defaultHeight: '150px',
    minHeight: 80,
    maxHeight: 400,
  },
};

/**
 * Get a region configuration by ID.
 */
export function getRegion(region: PanelRegion): LayoutRegion {
  return REGIONS[region];
}

/**
 * Get the DOM element for a region.
 */
export function getRegionElement(region: PanelRegion): HTMLElement | null {
  const config = REGIONS[region];
  return document.querySelector(config.selector);
}

/**
 * Verify all regions exist in the DOM.
 * Throws if any region is missing.
 */
export function verifyRegions(): void {
  for (const [name, config] of Object.entries(REGIONS)) {
    const el = document.querySelector(config.selector);
    if (!el) {
      throw new Error(`Layout region "${name}" not found at ${config.selector}`);
    }
  }
}
