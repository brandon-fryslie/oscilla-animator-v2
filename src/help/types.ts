/**
 * Help System Types
 *
 * Shared type definitions for the help content registry.
 */

export type HelpCategory = 'debug-viz' | 'controls';

export type HelpTopicId =
  | 'viz-sparkline'
  | 'viz-raster-heatmap'
  | 'viz-band-chart'
  | 'viz-color-palette'
  | 'viz-distribution-bar'
  | 'viz-how-selection-works'
  | 'controls-canvas'
  | 'controls-patch';

export interface HelpTopic {
  readonly id: HelpTopicId;
  readonly title: string;
  readonly category: HelpCategory;
  readonly summary: string;
  readonly body: readonly string[];
  readonly shines?: readonly string[];
  readonly duds?: readonly string[];
}
