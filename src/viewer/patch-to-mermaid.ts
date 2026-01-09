/**
 * Patch to Mermaid Converter
 *
 * Converts a Patch graph to Mermaid flowchart syntax.
 */

import type { Patch, Block, Edge } from '../graph/Patch';

/**
 * Escape special characters in Mermaid node labels.
 * Mermaid uses quotes for labels, so we need to escape internal quotes.
 */
function escapeLabel(text: string): string {
  return text
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/"/g, '\\"')    // Escape quotes
    .replace(/\n/g, '<br/>') // Convert newlines to HTML breaks
    .replace(/#/g, '&#35;'); // Escape hash symbols
}

/**
 * Format a block's information as a multi-line label.
 */
function formatBlockLabel(block: Block): string {
  const lines: string[] = [];

  // Type (prominent)
  lines.push(`<b>${escapeLabel(block.type)}</b>`);

  // Label if present
  if (block.label) {
    lines.push(`<i>${escapeLabel(block.label)}</i>`);
  }

  // Params (show key: value)
  const params = Object.entries(block.params);
  if (params.length > 0) {
    lines.push('---');
    for (const [key, value] of params) {
      // Format value based on type
      let valueStr: string;
      if (typeof value === 'string') {
        valueStr = `"${escapeLabel(value)}"`;
      } else if (typeof value === 'number') {
        // Format numbers nicely
        valueStr = Number.isInteger(value) ? value.toString() : value.toFixed(2);
      } else if (typeof value === 'boolean') {
        valueStr = value.toString();
      } else if (value === null || value === undefined) {
        valueStr = 'null';
      } else {
        valueStr = JSON.stringify(value);
      }
      lines.push(`${escapeLabel(key)}: ${valueStr}`);
    }
  }

  return lines.join('<br/>');
}

/**
 * Generate a valid Mermaid node ID from a block ID.
 * Replace any characters that might cause issues.
 */
function sanitizeNodeId(blockId: string): string {
  return blockId.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Convert a Patch to Mermaid flowchart syntax.
 * Uses left-to-right layout to match data flow direction.
 */
export function patchToMermaid(patch: Patch): string {
  const lines: string[] = [];

  // Header: use left-to-right layout
  lines.push('flowchart LR');

  // Add a blank line for readability
  lines.push('');

  // Define all nodes with their labels
  for (const block of patch.blocks.values()) {
    const nodeId = sanitizeNodeId(block.id);
    const label = formatBlockLabel(block);
    // Use rectangular nodes with rich HTML labels
    lines.push(`  ${nodeId}["${label}"]`);
  }

  // Add a blank line before edges
  if (patch.edges.length > 0) {
    lines.push('');
  }

  // Define all edges
  for (const edge of patch.edges) {
    // Only show enabled edges
    if (edge.enabled === false) {
      continue;
    }

    const fromId = sanitizeNodeId(edge.from.blockId);
    const toId = sanitizeNodeId(edge.to.blockId);

    // Format edge label showing port connection
    const fromPort = escapeLabel(edge.from.slotId);
    const toPort = escapeLabel(edge.to.slotId);
    const edgeLabel = `${fromPort} → ${toPort}`;

    // Draw edge with label
    lines.push(`  ${fromId} -->|"${edgeLabel}"| ${toId}`);
  }

  // Style nodes with dark theme
  lines.push('');
  lines.push('  classDef default fill:#16213e,stroke:#0f3460,color:#eee,stroke-width:2px;');

  return lines.join('\n');
}
