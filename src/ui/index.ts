/**
 * Oscilla UI System
 *
 * Main exports for the UI framework.
 */

// Theme
export { darkTheme, colors } from './theme';

// Components (React root and feature components)
export * from './components';

// Legacy exports (for gradual migration if needed)
export {
  PanelManager,
  type PanelConfig,
  type PanelInstance,
  type PanelRegion,
  type ResizeDirection,
} from './panel';

export {
  AppLayout,
  getAppLayout,
  REGIONS,
  getRegion,
  getRegionElement,
  type LayoutRegion,
} from './layout';
