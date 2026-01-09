/**
 * Panel System Types
 *
 * Defines the configuration and instance types for the panel system.
 */

import type { JsPanel, JsPanelResizeitConfig } from 'jspanel4';

/**
 * Layout regions where panels can be placed.
 */
export type PanelRegion = 'left' | 'center' | 'right' | 'bottom';

/**
 * Direction a panel can be resized.
 */
export type ResizeDirection = 'horizontal' | 'vertical' | 'both' | 'none';

/**
 * Configuration for creating a panel.
 */
export interface PanelConfig {
  /** Unique identifier for the panel */
  id: string;

  /** Title displayed in panel header */
  title: string;

  /** Region where panel is placed */
  region: PanelRegion;

  /**
   * Factory function to populate panel content.
   * Receives the content container element.
   * Can return a cleanup function called on panel destroy.
   */
  contentFactory: (container: HTMLElement) => void | (() => void);

  /** Whether panel can be resized. Default: true */
  resizable?: boolean;

  /** Resize direction. Default: based on region */
  resizeDirection?: ResizeDirection;

  /** Minimum width in pixels */
  minWidth?: number;

  /** Minimum height in pixels */
  minHeight?: number;

  /** Maximum width in pixels */
  maxWidth?: number;

  /** Maximum height in pixels */
  maxHeight?: number;

  /** Initial width (number for px, string for CSS value) */
  initialWidth?: number | string;

  /** Initial height (number for px, string for CSS value) */
  initialHeight?: number | string;

  /** Show panel header. Default: true */
  showHeader?: boolean;

  /** Header size. Default: 'xs' */
  headerSize?: 'xs' | 'sm' | 'md';

  /** Custom CSS class to add to panel */
  className?: string;

  /** Custom theme (jsPanel theme string or object) */
  theme?: string | {
    bgPanel?: string;
    bgContent?: string;
    colorHeader?: string;
    colorContent?: string;
    border?: string;
  };

  /** Called when panel is closed */
  onClose?: () => void;

  /** Called when panel is resized */
  onResize?: (width: number, height: number) => void;
}

/**
 * Active panel instance.
 */
export interface PanelInstance {
  /** Unique identifier */
  id: string;

  /** Original configuration */
  config: PanelConfig;

  /** jsPanel DOM element */
  panel: JsPanel;

  /** Content container element inside the panel */
  contentElement: HTMLElement;

  /** Cleanup function from contentFactory (if returned) */
  cleanup?: () => void;

  /** Destroy this panel */
  destroy: () => void;

  /** Resize the panel */
  resize: (width?: number | string, height?: number | string) => void;

  /** Set panel title */
  setTitle: (title: string) => void;
}

/**
 * Get default resize direction for a region.
 */
export function getDefaultResizeDirection(region: PanelRegion): ResizeDirection {
  switch (region) {
    case 'left':
      return 'horizontal';  // Resize from right edge
    case 'right':
      return 'horizontal';  // Resize from left edge
    case 'bottom':
      return 'vertical';    // Resize from top edge
    case 'center':
      return 'none';        // Center fills remaining space
    default:
      return 'none';
  }
}

/**
 * Get jsPanel resize handles string for a region.
 */
export function getResizeHandles(region: PanelRegion, direction: ResizeDirection): string {
  if (direction === 'none') return '';

  switch (region) {
    case 'left':
      return 'e';  // East (right) edge only
    case 'right':
      return 'w';  // West (left) edge only
    case 'bottom':
      return 'n';  // North (top) edge only
    case 'center':
      return direction === 'both' ? 'e, s, se' : '';
    default:
      return '';
  }
}

/**
 * Build jsPanel resizeit config from panel config.
 */
export function buildResizeitConfig(
  config: PanelConfig
): JsPanelResizeitConfig | 'disabled' {
  const direction = config.resizeDirection ?? getDefaultResizeDirection(config.region);

  if (!config.resizable || direction === 'none') {
    return 'disabled';
  }

  const handles = getResizeHandles(config.region, direction);
  if (!handles) {
    return 'disabled';
  }

  return {
    handles,
    minWidth: config.minWidth ?? 150,
    minHeight: config.minHeight ?? 100,
    maxWidth: config.maxWidth,
    maxHeight: config.maxHeight,
  };
}
