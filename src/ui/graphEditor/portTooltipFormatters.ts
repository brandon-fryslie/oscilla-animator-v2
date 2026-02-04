/**
 * Port Tooltip Formatters
 *
 * Utilities for formatting port provenance and type information into
 * user-friendly tooltip strings.
 */

import type { PortProvenance } from '../../stores/FrontendResultStore';
import type { InferenceCanonicalType } from '../../core/inference-types';

/**
 * Format provenance for tooltip display.
 *
 * Returns a human-readable description of where this port's value comes from.
 */
export function formatProvenanceTooltip(provenance: PortProvenance | undefined): string {
  if (!provenance) {
    return 'Provenance: Unknown';
  }

  switch (provenance.kind) {
    case 'userEdge':
      return 'Source: Connected edge';

    case 'defaultSource':
      const ds = provenance.source;
      const params = ds.params ? ` (${formatParams(ds.params)})` : '';
      return `Default: ${ds.blockType}.${ds.output}${params}`;

    case 'adapter':
      return `Auto-adapter: ${provenance.adapterType}`;

    case 'unresolved':
      return '⚠ Source unresolved';

    default:
      return 'Provenance: Unknown';
  }
}

/**
 * Format canonical type for detailed tooltip display.
 *
 * Shows payload, unit, extent (cardinality, temporality, etc.)
 */
export function formatCanonicalTypeTooltip(type: InferenceCanonicalType | undefined): string {
  if (!type) {
    return 'Type: Unknown';
  }

  const parts: string[] = [];

  // Payload
  parts.push(`Payload: ${formatPayload(type.payload)}`);

  // Unit
  if (type.unit.kind !== 'none') {
    parts.push(`Unit: ${type.unit.kind}`);
  }

  // Extent axes
  const { cardinality, temporality } = type.extent;

  if (cardinality.kind === 'inst') {
    const val = cardinality.value;
    if (val.kind === 'one') {
      parts.push('Cardinality: one');
    } else if (val.kind === 'many') {
      const instanceStr = val.instance.instanceId;
      parts.push(`Cardinality: many (${instanceStr})`);
    } else if (val.kind === 'zero') {
      parts.push('Cardinality: zero');
    }
  } else {
    parts.push(`Cardinality: <var>`);
  }

  if (temporality.kind === 'inst') {
    parts.push(`Temporality: ${temporality.value.kind}`);
  } else {
    parts.push(`Temporality: <var>`);
  }

  return parts.join('\n');
}

/**
 * Format payload type (handles concrete and var types).
 */
function formatPayload(payload: InferenceCanonicalType['payload']): string {
  // InferencePayloadType is either PayloadType or { kind: 'var', id: string }
  if (payload.kind === 'var') {
    return `<var:${payload.id}>`;
  }
  // Otherwise it's a concrete payload type
  return payload.kind;
}

/**
 * Format param object for tooltip display.
 */
function formatParams(params: Record<string, unknown> | undefined): string {
  if (!params || Object.keys(params).length === 0) {
    return '';
  }

  return Object.entries(params)
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(', ');
}

/**
 * Format a param value for tooltip display.
 */
function formatValue(value: unknown): string {
  if (typeof value === 'number') {
    return value.toString();
  }
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  if (typeof value === 'boolean') {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return `[${value.map(formatValue).join(', ')}]`;
  }
  return JSON.stringify(value);
}

/**
 * Get a short badge label for adapter provenance.
 * Returns undefined if not an adapter.
 */
export function getAdapterBadgeLabel(provenance: PortProvenance | undefined): string | undefined {
  if (provenance?.kind === 'adapter') {
    return '→'; // Short arrow symbol for adapter
  }
  return undefined;
}

/**
 * Get a warning indicator for unresolved ports.
 * Returns undefined if port is resolved.
 */
export function getUnresolvedWarning(provenance: PortProvenance | undefined): string | undefined {
  if (provenance?.kind === 'unresolved') {
    return '⚠';
  }
  return undefined;
}
