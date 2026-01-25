/**
 * Pass 4: Dependency Graph Construction
 *
 * Transforms a TimeResolvedPatch into a DepGraph by:
 * 1. Creating BlockEval nodes for all blocks
 * 2. Adding edges (block → block) from NormalizedEdge array
 *
 * This graph is used for topological scheduling and cycle validation.
 *
 * References:
 * - HANDOFF.md Topic 5: Pass 4 - Dependency Graph
 * - design-docs/12-Compiler-Final/15-Canonical-Lowering-Pipeline.md § Pass 4
 */

import type {
  TimeResolvedPatch,
  DepGraph,
  DepNode,
  DepEdge,
  DepGraphWithTimeModel,
} from "../ir/patches";
import type { BlockIndex } from "../../graph/passes/pass3-indexing";

/**
 * Error types emitted by Pass 4.
 */
export interface DanglingConnectionError {
  kind: "DanglingConnection";
  connectionId: string;
  fromBlockIndex?: number;
  toBlockIndex?: number;
  message: string;
}

export type Pass4Error =
  | DanglingConnectionError;

/**
 * Pass 4: Dependency Graph Construction
 *
 * Builds a unified dependency graph with BlockEval nodes
 * and edges from the NormalizedEdge array.
 *
 * @param timeResolved - The time-resolved patch from Pass 3
 * @returns A dependency graph ready for cycle validation
 */
export function pass4DepGraph(
  timeResolved: TimeResolvedPatch
): DepGraphWithTimeModel {
  const errors: Pass4Error[] = [];
  const nodes: DepNode[] = [];
  const depEdges: DepEdge[] = [];

  // Step 1: Create BlockEval nodes for all blocks
  // Blocks are already in index order, so we can just iterate
  for (let i = 0; i < timeResolved.blocks.length; i++) {
    // Import BlockIndex type to make this safe
    nodes.push({
      kind: "BlockEval",
      blockIndex: i as BlockIndex,
    });
  }

  // Step 2: Add edges from NormalizedEdge array
  // NormalizedEdge already has block indices, no lookup needed
  for (const edge of timeResolved.edges) {
    // Validate that block indices are within bounds
    if (edge.fromBlock < 0 || edge.fromBlock >= timeResolved.blocks.length) {
      errors.push({
        kind: "DanglingConnection",
        connectionId: `${edge.fromBlock}:${edge.fromPort}->${edge.toBlock}:${edge.toPort}`,
        fromBlockIndex: edge.fromBlock,
        message: `Edge references invalid fromBlock index ${edge.fromBlock} (valid range: 0-${timeResolved.blocks.length - 1})`,
      });
      continue;
    }

    if (edge.toBlock < 0 || edge.toBlock >= timeResolved.blocks.length) {
      errors.push({
        kind: "DanglingConnection",
        connectionId: `${edge.fromBlock}:${edge.fromPort}->${edge.toBlock}:${edge.toPort}`,
        toBlockIndex: edge.toBlock,
        message: `Edge references invalid toBlock index ${edge.toBlock} (valid range: 0-${timeResolved.blocks.length - 1})`,
      });
      continue;
    }

    // Add dependency edge: source block (fromBlock) must be evaluated before target block (toBlock)
    // IMPORTANT: Reference existing nodes from the nodes array, not new objects
    depEdges.push({
      from: nodes[edge.fromBlock],
      to: nodes[edge.toBlock],
    });
  }

  // Throw if there are any errors
  if (errors.length > 0) {
    const errorSummary = errors
      .map((e) => `  - ${e.kind}: ${e.message}`)
      .join("\n");
    throw new Error(
      `Pass 4 (Dependency Graph) failed with ${errors.length} error(s):\n${errorSummary}`
    );
  }

  // Return dependency graph with timeModel, portTypes and blocks/edges threaded through
  return {
    graph: {
      nodes,
      edges: depEdges,
    },
    timeModel: timeResolved.timeModel,
    portTypes: timeResolved.portTypes,
    blocks: timeResolved.blocks,
    edges: timeResolved.edges,
  };
}
