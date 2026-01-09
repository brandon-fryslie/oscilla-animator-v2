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
 * Format a block's information as a compact label.
 * Just show type and short ID.
 */
function formatBlockLabel(block: Block): string {
  // Extract short ID (last part after underscore, or full ID if no underscore)
  const shortId = block.id.includes('_') ? block.id.split('_').pop() : block.id;

  // Just type name and short ID
  return `<b>${escapeLabel(block.type)}</b><br/>${escapeLabel(shortId!)}`;
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
    // Use rectangular nodes with compact HTML labels
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

    // Compact edge label - just the port names
    const fromPort = escapeLabel(edge.from.slotId);
    const toPort = escapeLabel(edge.to.slotId);
    const edgeLabel = `${fromPort}→${toPort}`;

    // Draw edge with label
    lines.push(`  ${fromId} -->|"${edgeLabel}"| ${toId}`);
  }

  // Style nodes with dark theme
  lines.push('');
  lines.push('  classDef default fill:#16213e,stroke:#0f3460,color:#eee,stroke-width:2px;');

  return lines.join('\n');
}
