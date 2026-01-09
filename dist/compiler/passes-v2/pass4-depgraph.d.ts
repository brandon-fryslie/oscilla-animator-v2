/**
 * Pass 4: Dependency Graph Construction
 *
 * Transforms a TimeResolvedPatch into a DepGraph by:
 * 1. Creating BlockEval nodes for all blocks
 * 2. Adding edges (block → block) from unified Edge type
 *
 * NOTE: After Bus-Block Unification, BusBlocks are regular blocks.
 * There are no separate BusValue nodes - BusBlocks appear as BlockEval nodes.
 * Edges to/from BusBlocks are treated like any other edge.
 *
 * This graph is used for topological scheduling and cycle validation.
 *
 * References:
 * - HANDOFF.md Topic 5: Pass 4 - Dependency Graph
 * - design-docs/12-Compiler-Final/15-Canonical-Lowering-Pipeline.md § Pass 4
 */
import type { TimeResolvedPatch, DepGraph } from "../ir";
import type { TimeModelIR } from "../ir/schedule";
/**
 * Error types emitted by Pass 4.
 */
export interface DanglingConnectionError {
    kind: "DanglingConnection";
    connectionId: string;
    fromBlockId?: string;
    toBlockId?: string;
    message: string;
}
export type Pass4Error = DanglingConnectionError;
/**
 * Output of Pass 4: DepGraph with timeModel threaded through.
 */
export interface DepGraphWithTimeModel {
    readonly graph: DepGraph;
    readonly timeModel: TimeModelIR;
}
/**
 * Pass 4: Dependency Graph Construction
 *
 * Builds a unified dependency graph with BlockEval nodes
 * and edges from the unified Edge array.
 *
 * After Bus-Block Unification, BusBlocks are regular blocks.
 * All edges are port→port, including edges to/from BusBlocks.
 *
 * @param timeResolved - The time-resolved patch from Pass 3
 * @returns A dependency graph ready for cycle validation
 */
export declare function pass4DepGraph(timeResolved: TimeResolvedPatch): DepGraphWithTimeModel;
