/**
 * Pass 5: Cycle Validation (SCC)
 *
 * Validates the dependency graph for cycles using Tarjan's strongly connected
 * component (SCC) algorithm. Legal cycles must have at least one state boundary
 * block (breaksCombinatorialCycle === true).
 *
 * This pass ensures feedback loops are well-formed under the memory semantics.
 *
 * References:
 * - HANDOFF.md Topic 6: Pass 5 - Cycle Validation
 * - design-docs/12-Compiler-Final/15-Canonical-Lowering-Pipeline.md § Pass 5
 * - https://en.wikipedia.org/wiki/Tarjan%27s_strongly_connected_components_algorithm
 */
/**
 * Create a unique key for a DepNode.
 *
 * NOTE: DepNode is now only BlockEval (bus nodes removed in Edge migration).
 */
function nodeKey(node) {
    return `block:${node.blockIndex}`;
}
/**
 * Check if two DepNodes are equal.
 */
function nodesEqual(a, b) {
    if (a.kind !== b.kind) {
        return false;
    }
    // Only BlockEval nodes exist now
    if (a.kind === "BlockEval" && b.kind === "BlockEval") {
        return a.blockIndex === b.blockIndex;
    }
    return false;
}
/**
 * Get successors of a node in the dependency graph.
 */
function getSuccessors(graph, node) {
    return graph.edges
        .filter((e) => nodesEqual(e.from, node))
        .map((e) => e.to);
}
/**
 * Check if a node has a self-loop.
 */
function hasSelfLoop(graph, node) {
    return graph.edges.some((e) => nodesEqual(e.from, node) && nodesEqual(e.to, node));
}
/**
 * Tarjan's strongConnect recursive function.
 */
function strongConnect(graph, node, state, blocks) {
    const key = nodeKey(node);
    // Set the depth index for this node
    state.indices.set(key, state.index);
    state.lowlinks.set(key, state.index);
    state.index++;
    state.stack.push(node);
    state.onStack.add(key);
    // Consider successors of node
    for (const successor of getSuccessors(graph, node)) {
        const successorKey = nodeKey(successor);
        if (!state.indices.has(successorKey)) {
            // Successor has not yet been visited; recurse on it
            strongConnect(graph, successor, state, blocks);
            state.lowlinks.set(key, Math.min(state.lowlinks.get(key), state.lowlinks.get(successorKey)));
        }
        else if (state.onStack.has(successorKey)) {
            // Successor is in stack and hence in the current SCC
            state.lowlinks.set(key, Math.min(state.lowlinks.get(key), state.indices.get(successorKey)));
        }
    }
    // If node is a root node, pop the stack and generate an SCC
    if (state.lowlinks.get(key) === state.indices.get(key)) {
        const sccNodes = [];
        let w;
        do {
            w = state.stack.pop();
            state.onStack.delete(nodeKey(w));
            sccNodes.push(w);
        } while (!nodesEqual(w, node));
        // Check if this SCC has a state boundary
        const hasStateBoundary = checkStateBoundary(sccNodes, blocks, graph);
        state.sccs.push({
            nodes: sccNodes,
            hasStateBoundary,
        });
    }
}
/**
 * Check if an SCC has a state boundary.
 *
 * A state boundary is a BlockEval node where the corresponding block
 * has a "state" capability and breaksCombinatorialCycle === true.
 *
 * For now, we'll use a simple heuristic: blocks with "state" in their type name.
 * TODO: Add proper capability checking via block registry.
 */
function checkStateBoundary(sccNodes, blocks, graph) {
    // Trivial SCCs (size 1, no self-loop) don't need state boundaries
    if (sccNodes.length === 1 && !hasSelfLoop(graph, sccNodes[0])) {
        return true; // Trivial SCC is always valid
    }
    // Check if any node in the SCC is a state boundary
    for (const node of sccNodes) {
        if (node.kind === "BlockEval") {
            const block = blocks[node.blockIndex];
            if (isStateBoundaryBlock(block)) {
                return true;
            }
        }
    }
    return false;
}
/**
 * Check if a block is a state boundary.
 *
 * State boundary blocks have:
 * - Type containing "Delay", "Integrator", "Feedback", or "State"
 * - Or explicit subcategory "State"
 *
 * TODO: Replace with proper capability checking via block registry.
 */
function isStateBoundaryBlock(block) {
    // Check block type for state-related names
    const stateTypePatterns = [
        /delay/i,
        /integrator/i,
        /feedback/i,
        /state/i,
        /sample/i,
        /hold/i,
    ];
    return stateTypePatterns.some((pattern) => pattern.test(block.type));
}
/**
 * Run Tarjan's SCC algorithm on the dependency graph.
 */
function tarjanSCC(graph, blocks) {
    const state = {
        index: 0,
        stack: [],
        indices: new Map(),
        lowlinks: new Map(),
        onStack: new Set(),
        sccs: [],
    };
    // Visit all nodes
    for (const node of graph.nodes) {
        const key = nodeKey(node);
        if (!state.indices.has(key)) {
            strongConnect(graph, node, state, blocks);
        }
    }
    return state.sccs;
}
/**
 * Pass 5: Cycle Validation (SCC)
 *
 * Detects strongly connected components and validates that non-trivial
 * cycles have state boundaries.
 *
 * @param depGraph - The dependency graph from Pass 4
 * @param blocks - The blocks from the patch (for state boundary checking)
 * @returns A validated graph with SCC information
 */
export function pass5CycleValidation(depGraphWithTime, blocks) {
    const errors = [];
    // Step 1: Run Tarjan's SCC algorithm
    const sccs = tarjanSCC(depGraphWithTime.graph, blocks);
    // Step 2: Validate non-trivial SCCs have state boundaries
    for (const scc of sccs) {
        // Skip trivial SCCs (size 1, no self-loop)
        if (scc.nodes.length === 1 && !hasSelfLoop(depGraphWithTime.graph, scc.nodes[0])) {
            continue;
        }
        // Check if SCC has a state boundary
        if (!scc.hasStateBoundary) {
            // Extract block indices from SCC for error reporting
            const blockIndices = scc.nodes
                .filter((n) => n.kind === "BlockEval")
                .map((n) => n.blockIndex);
            errors.push({
                kind: "IllegalCycle",
                nodes: blockIndices,
            });
        }
    }
    // Return validated graph with SCC information
    return {
        graph: depGraphWithTime.graph,
        timeModel: depGraphWithTime.timeModel,
        sccs,
        errors,
    };
}
