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
import type { CanonicalType } from '../../core/canonical-types';
import { isPayloadVar } from '../../core/inference-types';
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
 * Convert a UnitType to its registry key string.
 * Simple kinds (none, scalar, norm01, count) use just the kind.
 * Structured kinds (angle, time, space, color) use the sub-unit for specificity.
 */
function unitToRegistryKey(unit: CanonicalType['unit']): string {
  if ('unit' in unit) return unit.unit; // angle, time, space, color
  return unit.kind; // none, scalar, count
}

/**
 * Get the appropriate renderer for a CanonicalType using 3-tier fallback.
 *
 * 1. Exact match: "{payload}:{unit.kind}"
 * 2. Payload-only: "{payload}"
 * 3. Category: "category:{category}"
 *
 * Falls back to a minimal placeholder renderer if nothing matches.
 */
export function getValueRenderer(type: CanonicalType): ValueRenderer {
  // Handle payload variables (unresolved) - use placeholder
  if (isPayloadVar(type.payload)) {
    return placeholderRenderer;
  }

  const payloadKey = type.payload.kind;

  // Tier 1: Exact match (payload + unit)
  // For structured units (angle, time, space, color), use the sub-unit for specificity
  const unitKey = unitToRegistryKey(type.unit);
  const exactKey = `${payloadKey}:${unitKey}`;
  const exact = registry.get(exactKey);
  if (exact) return exact;

  // Tier 2: Payload-only
  const payloadRenderer = registry.get(payloadKey);
  if (payloadRenderer) return payloadRenderer;

  // Tier 3: Category fallback
  const category = PAYLOAD_TO_CATEGORY[payloadKey];
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
