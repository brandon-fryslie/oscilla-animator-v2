/**
 * vizSelector - Declarative chart selection for field debug views.
 *
 * Evaluates type-based rules to determine which charts to show.
 * No block references — selection is purely based on payload/stride/count.
 *
 * Adding a new viz:
 * 1. Add to FieldChartId union
 * 2. Add one rule to CHART_RULES
 * 3. Create the component
 * 4. Add one case to renderFieldChart() in DebugMiniView.tsx
 */

import type { Stride } from './types';

// =============================================================================
// Types
// =============================================================================

export type FieldChartId = 'color-palette' | 'instance-sparkline' | 'raster-heatmap' | 'band-chart';

export interface FieldVizContext {
  readonly payloadKind: string;
  readonly stride: Stride;
  readonly instanceCount: number;
}

// =============================================================================
// Rules
// =============================================================================

interface ChartRule {
  readonly id: FieldChartId;
  readonly applicable: (ctx: FieldVizContext) => boolean;
  readonly order: number;
  readonly exclusive?: boolean;
  readonly supersedes?: readonly FieldChartId[];
}

/** Payload kinds that don't get numeric charts. */
const NON_NUMERIC_KINDS = new Set(['color', 'bool', 'cameraProjection']);

function isNumericField(ctx: FieldVizContext): boolean {
  return ctx.stride > 0 && !NON_NUMERIC_KINDS.has(ctx.payloadKind);
}

const CHART_RULES: readonly ChartRule[] = [
  {
    id: 'color-palette',
    applicable: (ctx) => ctx.payloadKind === 'color',
    order: 0,
    exclusive: true,
  },
  {
    id: 'instance-sparkline',
    applicable: isNumericField,
    order: 10,
    supersedes: ['band-chart'],
  },
  {
    id: 'raster-heatmap',
    applicable: (ctx) => isNumericField(ctx) && ctx.instanceCount >= 8,
    order: 20,
  },
  {
    id: 'band-chart',
    applicable: isNumericField,
    order: 30,
  },
];

// =============================================================================
// Selector
// =============================================================================

/**
 * Select which field charts to show for a given context.
 *
 * Algorithm:
 * 1. Evaluate all predicates → collect matches
 * 2. If any exclusive match → return only it
 * 3. Remove superseded charts
 * 4. Sort by order, return
 */
export function selectFieldCharts(ctx: FieldVizContext): readonly FieldChartId[] {
  const matches = CHART_RULES.filter(r => r.applicable(ctx));

  // Exclusive match → return only it
  const exclusive = matches.find(r => r.exclusive);
  if (exclusive) return [exclusive.id];

  // Collect superseded IDs
  const superseded = new Set<FieldChartId>();
  for (const rule of matches) {
    if (rule.supersedes) {
      for (const id of rule.supersedes) superseded.add(id);
    }
  }

  // Filter superseded, sort by order
  return matches
    .filter(r => !superseded.has(r.id))
    .sort((a, b) => a.order - b.order)
    .map(r => r.id);
}
