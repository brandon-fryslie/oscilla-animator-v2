/**
 * Oscilla UI System
 *
 * Main exports for the UI framework.
 */

// Theme
export { darkTheme, colors } from './theme';

// Panel system
export {
  PanelManager,
  type PanelConfig,
  type PanelInstance,
  type PanelRegion,
  type ResizeDirection,
} from './panel';

// Layout system
export {
  AppLayout,
  getAppLayout,
  REGIONS,
  getRegion,
  getRegionElement,
  type LayoutRegion,
} from './layout';

// Components
export {
  TabbedContent,
  type TabConfig,
  type TabChangeCallback,
} from './components';
