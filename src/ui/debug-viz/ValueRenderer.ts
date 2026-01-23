/**
 * ValueRenderer Registry - 3-tier fallback ladder for debug value display.
 *
 * Lookup order:
 * 1. Exact match: payload + unit kind (e.g., "float:phase01")
 * 2. Payload-only: just payload (e.g., "float")
 * 3. Category fallback: payload category (e.g., "numeric")
 *
 * Renderers are registered at module load time via registerRenderer().
 */

import React from 'react';
import type { SignalType } from '../../core/canonical-types';
import type { RendererSample } from './types';

// =============================================================================
// ValueRenderer Interface
// =============================================================================

/**
 * Interface for rendering debug values.
 *
 * Each renderer provides two display modes:
 * - renderFull: Detailed view for panels/inspectors
 * - renderInline: Compact single-line view for tooltips/overlays
 */
export interface ValueRenderer {
  renderFull(sample: RendererSample): React.ReactElement;
  renderInline(sample: RendererSample): React.ReactElement;
}

// =============================================================================
// Category Mapping
// =============================================================================

/**
 * Payload type to category mapping.
 * Categories are the lowest fallback tier.
 */
type Category = 'numeric' | 'color' | 'shape';

const PAYLOAD_TO_CATEGORY: Record<string, Category> = {
  float: 'numeric',
  int: 'numeric',
  vec2: 'numeric',
  color: 'color',
  shape: 'shape',
  bool: 'numeric',
};

// =============================================================================
// Registry
// =============================================================================

/** Module-level registry: key → renderer */
const registry = new Map<string, ValueRenderer>();

/**
 * Register a renderer for a given key.
 *
 * Key formats:
 * - Exact: "float:phase01" (payload:unit)
 * - Payload: "float"
 * - Category: "category:numeric"
 */
export function registerRenderer(key: string, renderer: ValueRenderer): void {
  registry.set(key, renderer);
}

/**
 * Get the appropriate renderer for a SignalType using 3-tier fallback.
 *
 * 1. Exact match: "{payload}:{unit.kind}"
 * 2. Payload-only: "{payload}"
 * 3. Category: "category:{category}"
 *
 * Falls back to a minimal placeholder renderer if nothing matches.
 */
export function getValueRenderer(type: SignalType): ValueRenderer {
  // Tier 1: Exact match (payload + unit)
  const unitKind = type.unit.kind;
  const exactKey = `${type.payload}:${unitKind}`;
  const exact = registry.get(exactKey);
  if (exact) return exact;

  // Tier 2: Payload-only
  const payloadRenderer = registry.get(type.payload);
  if (payloadRenderer) return payloadRenderer;

  // Tier 3: Category fallback
  const category = PAYLOAD_TO_CATEGORY[type.payload];
  if (category) {
    const categoryRenderer = registry.get(`category:${category}`);
    if (categoryRenderer) return categoryRenderer;
  }

  // Last resort: placeholder
  return placeholderRenderer;
}

// =============================================================================
// Placeholder Renderer
// =============================================================================

/**
 * Minimal fallback renderer when nothing in the registry matches.
 * Should never be reached in practice if categories are registered.
 */
const placeholderRenderer: ValueRenderer = {
  renderFull(_sample: RendererSample): React.ReactElement {
    return React.createElement('span', { style: { color: '#888', fontFamily: 'monospace' } }, '[no renderer]');
  },
  renderInline(_sample: RendererSample): React.ReactElement {
    return React.createElement('span', { style: { color: '#888', fontFamily: 'monospace' } }, '?');
  },
};
