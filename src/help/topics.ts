/**
 * Help Content Registry
 *
 * Single source of truth for all help topics.
 * Content distilled from DEBUG-VIZ-2026-WHEN-TO-USE.md and existing HelpPanel.
 *
 * [LAW:one-source-of-truth] All help content lives here.
 */

import type { HelpCategory, HelpTopic, HelpTopicId } from './types';

// =============================================================================
// Topics
// =============================================================================

export const HELP_TOPICS: readonly HelpTopic[] = [
  // --- Debug Viz ---
  {
    id: 'viz-sparkline',
    title: 'Sparkline',
    category: 'debug-viz',
    summary: 'Temporal waveform of a single value over recent frames.',
    body: [
      'The sparkline shows how a value changes over time. For one-cardinality values, it plots the full recent history. For many-cardinality values, it plots instance 0 only (a representative sample).',
      'The horizontal axis is time (recent frames). The vertical axis auto-scales to the observed range. A unit-aware overlay shows the current value.',
    ],
    shines: [
      'Phasor.out — sawtooth ramp is immediately recognizable',
      'Oscillator.out — see sine/saw/square shape',
      'Lag.out, Slew.out — smoothing character visible as rounded edges',
      'Accumulator.value — integration ramp or runaway drift',
      'Noise.out — random walk character',
      'SampleHold.out — staircase pattern',
      'ExternalInput.out — user input shape in real time',
    ],
    duds: [
      'Layout.position — constant per instance, flat line',
      'Broadcast.field — every instance identical, sparkline equals the input one value',
      'DomainIndex.out — constant integer per instance, flat line',
      'Any adapter output where the input was already constant',
    ],
  },
  {
    id: 'viz-raster-heatmap',
    title: 'Raster Heatmap',
    category: 'debug-viz',
    summary: '2D grid: time x instance x brightness. Reveals spatial patterns in fields.',
    body: [
      'The raster heatmap maps field values to brightness across all instances (vertical axis) over time (horizontal axis). It only appears when the instance count is 8 or more.',
      'Each row is one instance. Bright pixels indicate high values, dark pixels indicate low values. Traveling waves appear as diagonal stripes; phase gradients appear as brightness gradients across rows.',
    ],
    shines: [
      'Oscillator.out field — traveling wave stripes when instances have different phases',
      'Lag.out / Slew.out field — see smoothing propagate across instances',
      'Add.out field (periodic + offset) — phase offset patterns',
      'Noise.out field — spatial correlation visible',
      'Any field downstream of a layout block that varies over time',
    ],
    duds: [
      'Instance count < 8 — too few rows, sparkline overlay is better',
      'Broadcast.field of one value — all rows identical, solid horizontal bands',
      'Color payload — single-channel heatmap loses color information',
      'Static fields (e.g. layout.position alone) — solid stripes, no temporal info',
    ],
  },
  {
    id: 'viz-band-chart',
    title: 'Band Chart',
    category: 'debug-viz',
    summary: 'Distribution envelope over time: min, max, IQR, and mean across instances.',
    body: [
      'The band chart shows statistical summary bands (min/max outer, p25/p75 inner, mean line) across all instances over time. It appears when instance-sparkline does not supersede it.',
      'Good for spotting convergence (bands narrowing), divergence (bands widening), and steady-state spreads. The width of the band at any moment indicates how much the field values vary across instances.',
    ],
    shines: [
      'Lag.out field during transition — band narrows as instances converge',
      'Slew.out field after step change — settling time visible as band width',
      'Accumulator.value field — diverging envelope reveals runaway accumulation',
      'Construct.out (vec3) — see xyz ranges of constructed positions',
      'Add.out where one operand is growing — drift visible in band migration',
    ],
    duds: [
      'Phasor.out field — min near 0, max near 1, mean near 0.5 forever',
      'Oscillator.out field — same: stats are constants for uniform phase spreads',
      'Hash.out / StableIdHash.out — statistics of hashes are meaningless',
      'DomainIndex.out — mean of indices is just the center index',
      'Broadcast.field — min=max=mean, zero-width band',
    ],
  },
  {
    id: 'viz-color-palette',
    title: 'Color Palette',
    category: 'debug-viz',
    summary: 'Sorted luminance strip showing actual colors from the field buffer.',
    body: [
      'The color palette is exclusive — it replaces all other charts when the payload type is color. It renders a horizontal strip of the actual N colors from the current field buffer, sorted by luminance.',
      'This is the only meaningful visualization for color data. Numeric charts (sparkline, band chart, heatmap) cannot represent multi-channel color information correctly.',
    ],
    shines: [
      'HueRainbow.out — see the full color spectrum',
      'Any color field — the palette is always the right choice',
    ],
    duds: [
      'Never a dud for color data — it is the only correct visualization',
    ],
  },
  {
    id: 'viz-distribution-bar',
    title: 'Distribution Bar',
    category: 'debug-viz',
    summary: 'Horizontal min/max/mean range indicator for the current frame.',
    body: [
      'The distribution bar is a compact horizontal bar showing the min, max, and mean of a field in the current frame. It gives a quick snapshot of the value spread without temporal history.',
      'Think of it as a single vertical slice of the band chart — the spread right now.',
    ],
    shines: [
      'Quick check: are values clustered or spread out?',
      'Clamp.out — see if values are hitting the boundaries',
      'NormalizeRange.out — verify the output fills [0,1]',
    ],
    duds: [
      'No temporal context — use band chart to see how spread changes over time',
    ],
  },
  {
    id: 'viz-how-selection-works',
    title: 'How Chart Selection Works',
    category: 'debug-viz',
    summary: 'Explains why specific charts appear for each edge.',
    body: [
      'Chart selection is based entirely on the edge type (payload kind + stride + instance count), not on which block produced the value. The vizSelector evaluates declarative rules to pick charts.',
      'Color payload → color palette (exclusive, replaces everything). Numeric payload with many instances → instance sparkline supersedes band chart. 8+ instances → raster heatmap also shown.',
      'Adapters (auto-inserted by the compiler) do not change which viz is useful — they change the type annotation, which the selector already dispatches on. When you hover an edge after an adapter, you see the chart appropriate for the output type.',
    ],
  },

  // --- Controls ---
  {
    id: 'controls-canvas',
    title: 'Canvas Controls',
    category: 'controls',
    summary: 'Mouse controls for the animation preview canvas.',
    body: [
      'Scroll to zoom in and out. Click and drag to pan the view. Double-click to reset the view to its default position and zoom level.',
    ],
  },
  {
    id: 'controls-patch',
    title: 'Patch Editor Controls',
    category: 'controls',
    summary: 'Interaction patterns for the patch editor and block library.',
    body: [
      'Click blocks in the table to inspect them. Expand rows to see ports and connections. Click connections to navigate to the connected block.',
      'In the block library, click a block type to preview its definition. Double-click a block type to add it to the current patch.',
    ],
  },
];

// =============================================================================
// Lookup
// =============================================================================

const topicById = new Map<HelpTopicId, HelpTopic>(
  HELP_TOPICS.map(t => [t.id, t])
);

/** O(1) lookup by topic ID. */
export function getHelpTopic(id: HelpTopicId): HelpTopic {
  const topic = topicById.get(id);
  if (!topic) throw new Error(`Unknown help topic: ${id}`);
  return topic;
}

/** All topics in a given category, in registry order. */
export function getTopicsByCategory(cat: HelpCategory): readonly HelpTopic[] {
  return HELP_TOPICS.filter(t => t.category === cat);
}

/** Ordered list of categories (stable, matches HELP_TOPICS insertion order). */
export function getCategories(): readonly HelpCategory[] {
  const seen = new Set<HelpCategory>();
  const result: HelpCategory[] = [];
  for (const t of HELP_TOPICS) {
    if (!seen.has(t.category)) {
      seen.add(t.category);
      result.push(t.category);
    }
  }
  return result;
}
