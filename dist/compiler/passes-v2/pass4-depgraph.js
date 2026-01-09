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
export function pass4DepGraph(timeResolved) {
    const errors = [];
    const nodes = [];
    const depEdges = [];
    // Step 1: Create BlockEval nodes for all blocks (including BusBlocks)
    // Use Array.from() to avoid downlevelIteration issues
    for (const blockData of Array.from(timeResolved.blocks.values())) {
        const block = blockData;
        const blockIndex = timeResolved.blockIndexMap.get(block.id);
        if (blockIndex === undefined) {
            // This should never happen - blockIndexMap is created in Pass 1
            throw new Error(`Block ${block.id} not found in blockIndexMap (internal error)`);
        }
        nodes.push({
            kind: "BlockEval",
            blockIndex,
        });
    }
    // Step 2: Add edges from unified Edge array
    // All edges are now port→port (block→block) including BusBlock connections
    const patchEdges = timeResolved.edges ?? [];
    for (const edge of patchEdges) {
        if (!edge.enabled)
            continue;
        const fromBlockIndex = timeResolved.blockIndexMap.get(edge.from.blockId);
        const toBlockIndex = timeResolved.blockIndexMap.get(edge.to.blockId);
        // Validate both endpoints exist
        if (fromBlockIndex === undefined || toBlockIndex === undefined) {
            errors.push({
                kind: "DanglingConnection",
                connectionId: edge.id,
                fromBlockId: fromBlockIndex === undefined ? edge.from.blockId : undefined,
                toBlockId: toBlockIndex === undefined ? edge.to.blockId : undefined,
                message: `Edge ${edge.id} references non-existent block(s): ${fromBlockIndex === undefined ? `from=${edge.from.blockId} ` : ""}${toBlockIndex === undefined ? `to=${edge.to.blockId}` : ""}`,
            });
            continue;
        }
        depEdges.push({
            from: { kind: "BlockEval", blockIndex: fromBlockIndex },
            to: { kind: "BlockEval", blockIndex: toBlockIndex },
        });
    }
    // Throw if there are any errors
    if (errors.length > 0) {
        const errorSummary = errors
            .map((e) => `  - ${e.kind}: ${e.message}`)
            .join("\n");
        throw new Error(`Pass 4 (Dependency Graph) failed with ${errors.length} error(s):\n${errorSummary}`);
    }
    // Return dependency graph with timeModel threaded through
    return {
        graph: {
            nodes,
            edges: depEdges,
        },
        timeModel: timeResolved.timeModel,
    };
}
