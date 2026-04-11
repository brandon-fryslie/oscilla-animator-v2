/**
 * Compact text format for design-mockup graphs.
 *
 * Designed to be human-readable and easy to paste into chat.
 *
 * Example:
 *   gen A "Particle Pool" domain=dotsA
 *   gen B "Time" domain=clock
 *   expr W "warp"
 *   sink S "draw"
 *   A --primary--> W
 *   B --secondary--> W
 *   W --primary--> S
 *
 * Grammar (line-based, '#' starts a comment):
 *   <kind> <id> "<label>" [domain=<name>]
 *   <id> --<role>--> <id>
 *
 * - kind: gen | expr | sink
 * - role: primary | secondary
 * - id: any non-whitespace identifier (typically short like A, B, W)
 * - label: required, in double quotes
 * - domain=NAME: only on 'gen' lines, optional but recommended
 *
 * Blank lines and lines starting with '#' are ignored.
 */

import type { MockNode, MockEdge, BlockKind } from './analyze';

export interface SerializedGraph {
  readonly nodes: readonly MockNode[];
  readonly edges: readonly MockEdge[];
  /** Optional positions per node (preserved for round-trip when available). */
  readonly positions?: ReadonlyMap<string, { x: number; y: number }>;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function serializeToText(
  nodes: readonly MockNode[],
  edges: readonly MockEdge[]
): string {
  const lines: string[] = [];
  for (const n of nodes) {
    const kindToken = KIND_TOKENS[n.kind];
    const labelEscaped = escapeQuotes(n.label);
    const domainPart = n.domain ? ` domain=${n.domain}` : '';
    lines.push(`${kindToken} ${n.id} "${labelEscaped}"${domainPart}`);
  }
  if (nodes.length > 0 && edges.length > 0) lines.push('');
  for (const e of edges) {
    lines.push(`${e.source} --${e.role}--> ${e.target}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ParseResult {
  readonly graph: SerializedGraph;
  readonly errors: readonly string[];
}

export function parseText(input: string): ParseResult {
  const nodes: MockNode[] = [];
  const edges: MockEdge[] = [];
  const errors: string[] = [];
  const seenNodeIds = new Set<string>();
  let edgeCounter = 1;

  const lines = input.split('\n');
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const raw = lines[lineNum];
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;

    // Try edge: <id> --<role>--> <id>
    const edgeMatch = line.match(/^(\S+)\s+--(\w+)-->\s+(\S+)\s*$/);
    if (edgeMatch) {
      const [, source, role, target] = edgeMatch;
      if (role !== 'primary' && role !== 'secondary') {
        errors.push(`Line ${lineNum + 1}: invalid edge role '${role}' (expected primary or secondary)`);
        continue;
      }
      edges.push({ id: `e${edgeCounter++}`, source, target, role });
      continue;
    }

    // Try node: <kind> <id> "<label>" [domain=<name>]
    const nodeMatch = line.match(/^(gen|expr|sink)\s+(\S+)\s+"([^"]*)"(?:\s+domain=(\S+))?\s*$/);
    if (nodeMatch) {
      const [, token, id, label, domain] = nodeMatch;
      const kind = KIND_FROM_TOKEN[token];
      if (!kind) {
        errors.push(`Line ${lineNum + 1}: unknown kind '${token}'`);
        continue;
      }
      if (seenNodeIds.has(id)) {
        errors.push(`Line ${lineNum + 1}: duplicate node id '${id}'`);
        continue;
      }
      seenNodeIds.add(id);
      nodes.push({ id, kind, label, domain });
      continue;
    }

    errors.push(`Line ${lineNum + 1}: unparseable: '${line}'`);
  }

  // Validate edge endpoints exist
  for (const e of edges) {
    if (!seenNodeIds.has(e.source)) errors.push(`Edge references unknown source '${e.source}'`);
    if (!seenNodeIds.has(e.target)) errors.push(`Edge references unknown target '${e.target}'`);
  }

  return { graph: { nodes, edges }, errors };
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

const KIND_TOKENS: Record<BlockKind, string> = {
  generator: 'gen',
  expression: 'expr',
  sink: 'sink',
};

const KIND_FROM_TOKEN: Record<string, BlockKind | undefined> = {
  gen: 'generator',
  expr: 'expression',
  sink: 'sink',
};

function escapeQuotes(s: string): string {
  return s.replace(/"/g, '\\"');
}
