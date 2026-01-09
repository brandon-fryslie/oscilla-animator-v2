/**
 * Panel System
 *
 * Exports for the panel management system.
 */

export { PanelManager } from './PanelManager';
export type {
  PanelConfig,
  PanelInstance,
  PanelRegion,
  ResizeDirection,
} from './types';
export {
  getDefaultResizeDirection,
  getResizeHandles,
  buildResizeitConfig,
} from './types';
