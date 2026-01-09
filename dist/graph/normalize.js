/**
 * Graph Normalization
 *
 * Transforms a Patch into a NormalizedPatch with:
 * - Dense block indices for efficient iteration
 * - Canonical edge ordering
 * - Validated structure
 */
export function normalize(patch) {
    const errors = [];
    // Build block index map
    const blockIndex = new Map();
    const blocks = [];
    // Sort blocks by ID for deterministic ordering
    const sortedBlockIds = [...patch.blocks.keys()].sort();
    for (const id of sortedBlockIds) {
        if (blockIndex.has(id)) {
            errors.push({ kind: 'DuplicateBlockId', id });
            continue;
        }
        const index = blocks.length;
        blockIndex.set(id, index);
        blocks.push(patch.blocks.get(id));
    }
    // Normalize edges
    const normalizedEdges = [];
    for (const edge of patch.edges) {
        // Skip disabled edges
        if (edge.enabled === false)
            continue;
        const fromIdx = blockIndex.get(edge.from.blockId);
        const toIdx = blockIndex.get(edge.to.blockId);
        if (fromIdx === undefined) {
            errors.push({ kind: 'DanglingEdge', edge, missing: 'from' });
            continue;
        }
        if (toIdx === undefined) {
            errors.push({ kind: 'DanglingEdge', edge, missing: 'to' });
            continue;
        }
        normalizedEdges.push({
            fromBlock: fromIdx,
            fromPort: edge.from.slotId,
            toBlock: toIdx,
            toPort: edge.to.slotId,
        });
    }
    // Sort edges for deterministic ordering (by target, then source)
    normalizedEdges.sort((a, b) => {
        if (a.toBlock !== b.toBlock)
            return a.toBlock - b.toBlock;
        if (a.toPort !== b.toPort)
            return a.toPort.localeCompare(b.toPort);
        if (a.fromBlock !== b.fromBlock)
            return a.fromBlock - b.fromBlock;
        return a.fromPort.localeCompare(b.fromPort);
    });
    if (errors.length > 0) {
        return { kind: 'error', errors };
    }
    return {
        kind: 'ok',
        patch: {
            patch,
            blockIndex,
            blocks,
            edges: normalizedEdges,
        },
    };
}
// =============================================================================
// Query Helpers
// =============================================================================
/** Get all edges targeting a specific block/port */
export function getInputEdges(patch, blockIdx, portId) {
    return patch.edges.filter((e) => e.toBlock === blockIdx && e.toPort === portId);
}
/** Get all edges from a specific block/port */
export function getOutputEdges(patch, blockIdx, portId) {
    return patch.edges.filter((e) => e.fromBlock === blockIdx && e.fromPort === portId);
}
