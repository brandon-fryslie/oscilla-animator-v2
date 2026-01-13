/**
 * Graph Normalization Types
 *
 * Defines the separation between RawGraph (user intent) and NormalizedGraph (compiler input).
 *
 * Sprint: Graph Normalization Layer (2026-01-03)
 * References:
 * - .agent_planning/graph-normalization/PLAN-2026-01-03-121815.md
 * - .agent_planning/graph-normalization/USER-RESPONSE-2026-01-03.md
 */

import type { Block, Edge, PortRef, BlockId } from '../types';

// =============================================================================
// RawGraph - User Intent
// =============================================================================

/**
 * RawGraph: User intent (what transactions operate on).
 * Contains only user-created blocks and edges.
 *
 * This is the source of truth for undo/redo and persistence.
 * Structural artifacts (default source providers, etc.) are NOT stored here.
 */
export interface RawGraph {
  /** User-created blocks only (no structural providers) */
  blocks: Block[];

  /** User-created edges only (no structural edges) */
  edges: Edge[];
}

// =============================================================================
// NormalizedGraph - Compiler Input
// =============================================================================

/**
 * NormalizedGraph: Compiler input (fully explicit).
 * Contains user blocks + structural artifacts (providers, etc.).
 *
 * This is derived from RawGraph via normalization.
 * All implicit connections are made explicit.
 *
 * NOTE: No separate mapping field - role metadata IS the mapping.
 * To find what a structural block targets, read `block.role.meta.target`.
 */
export interface NormalizedGraph {
  /** User + structural blocks */
  blocks: Block[];

  /** User + structural edges */
  edges: Edge[];
}

// =============================================================================
// Compiler Boundary Types
// =============================================================================

/**
 * CompilerBlock: Block without role field.
 * TypeScript enforces that compiler cannot access role metadata.
 */
export type CompilerBlock = Omit<Block, 'role'>;

/**
 * CompilerEdge: Edge without role field.
 * TypeScript enforces that compiler cannot access role metadata.
 */
export type CompilerEdge = Omit<Edge, 'role'>;

/**
 * CompilerGraph: Graph representation for compiler.
 * Compiler passes work with this type, which lacks role fields.
 *
 * Diagnostics system correlates compiler results back to NormalizedGraph
 * for UI selection and error reporting.
 */
export interface CompilerGraph {
  blocks: CompilerBlock[];
  edges: CompilerEdge[];
}

// =============================================================================
// Anchor Types (for structural artifact identity)
// =============================================================================

/**
 * Anchor: Identifies a structural artifact deterministically.
 * Anchors are derived from graph structure, not creation order.
 *
 * Used for generating stable IDs for structural blocks/edges.
 */
export type Anchor = {
  kind: "defaultSource";
  blockId: BlockId;      // The user block this provider serves
  port: PortRef;         // The input port
  direction: "in" | "out";
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Serialize an anchor to a stable string key for Map lookups.
 *
 * @param anchor - The anchor to serialize
 * @returns A stable string key
 */
export function serializeAnchor(anchor: Anchor): string {
  return JSON.stringify(anchor);
}

/**
 * Strip role fields from NormalizedGraph to produce CompilerGraph.
 * This enforces the compiler boundary - compiler cannot access role metadata.
 *
 * @param normalized - The normalized graph with role metadata
 * @returns A compiler graph without role metadata
 */
export function toCompilerGraph(normalized: NormalizedGraph): CompilerGraph {
  const blocks: CompilerBlock[] = normalized.blocks.map(block => {
    const { role, ...rest } = block;
    return rest as CompilerBlock;
  });

  const edges: CompilerEdge[] = normalized.edges.map(edge => {
    const { role, ...rest } = edge;
    return rest as CompilerEdge;
  });

  return { blocks, edges };
}
