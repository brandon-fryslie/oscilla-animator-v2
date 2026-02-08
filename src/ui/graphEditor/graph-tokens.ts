/**
 * Graph Editor Visual Tokens
 *
 * Single source of truth for all graph editor visual constants.
 * Imports shared colors from theme.ts and defines graph-specific tokens.
 *
 * [LAW:one-source-of-truth] All visual constants defined here, referenced elsewhere.
 */

import { colors } from '../theme';

/**
 * Graph editor color palette.
 * Extends theme colors with graph-specific accent and diagnostic colors.
 */
export const graphColors = {
  // Core colors from theme
  accent: colors.primary, // #4ecdc4 - Teal accent
  error: colors.error, // #ff6b6b - Error/red
  warning: colors.warning, // #ffd93d - Warning/yellow
  collectPort: colors.collectPort, // #9d4edd - Purple (collect ports)

  // Graph-specific colors
  dragCompatible: '#4ade80', // Green glow for compatible ports during drag
  dragIncompatible: '#6b7280', // Gray for incompatible ports during drag

  // Indicator colors (default sources, badges)
  timeRootIndicator: '#2196F3', // Blue for TimeRoot default sources
  defaultSourceIndicator: '#4CAF50', // Green for other default sources
  adapterBadge: '#f59e0b', // Amber for adapter badges
  unresolvedBadge: '#ef4444', // Red for unresolved badges
  lensBadge: '#f59e0b', // Amber for lens badges

  // Text colors (port counts, labels)
  portCountInput: '#3b82f6', // Blue for input port count
  portCountOutput: '#22c55e', // Green for output port count
  portCountSeparator: '#334155', // Dark gray separator

  // Edge colors
  edgeDefault: colors.primary, // #4ecdc4 - Default edge color
  edgeError: '#ef4444', // Red for error edges
  edgeWarning: '#f59e0b', // Orange for warning edges
  edgeHover: '#6ee7de', // Lighter teal for hover
  edgeSelected: '#7dd3fc', // Light blue for selected
} as const;

/**
 * Port visual dimensions.
 */
export const portSize = {
  diameter: 14,
  borderWidth: 2,
} as const;

/**
 * Port animation reference data.
 * These values match CSS keyframes in ReactFlowEditor.css.
 * When updating, sync both files.
 */
export const portAnimations = {
  selected: {
    name: 'port-breathe-selected',
    duration: '2.5s',
    keyframes: {
      start: { brightness: 1.4, saturate: 1.5, hueRotate: -3 },
      peak: { brightness: 1.7, saturate: 1.8, hueRotate: 3 },
    },
  },
  warning: {
    name: 'port-breathe-warning',
    duration: '2s',
    keyframes: {
      start: { brightness: 1.0, saturate: 1.1, boxShadow: '0 0 12px 3px rgba(255, 217, 61, 0.5)' },
      peak: { brightness: 1.15, saturate: 1.2, boxShadow: '0 0 16px 5px rgba(255, 217, 61, 0.7)' },
    },
  },
  error: {
    name: 'port-breathe-error',
    duration: '1.5s',
    keyframes: {
      start: { brightness: 1.0, saturate: 1.1, boxShadow: '0 0 12px 3px rgba(255, 107, 107, 0.5)' },
      peak: { brightness: 1.15, saturate: 1.2, boxShadow: '0 0 16px 5px rgba(255, 107, 107, 0.7)' },
    },
  },
} as const;

/**
 * Edge visual properties.
 */
export const edgeVisuals = {
  strokeWidth: {
    default: 2,
    diagnostic: 2.5,
    hover: 3,
    selected: 3,
  },
} as const;
