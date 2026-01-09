/**
 * Patch Graph Types
 *
 * A Patch is the user-facing graph representation.
 * It consists of Blocks connected by Edges.
 */
// =============================================================================
// Builders (for tests and programmatic construction)
// =============================================================================
export class PatchBuilder {
    blocks = new Map();
    edges = [];
    nextBlockId = 0;
    nextEdgeId = 0;
    addBlock(type, params = {}, label) {
        const id = `b${this.nextBlockId++}`;
        this.blocks.set(id, { id, type, params, label });
        return id;
    }
    addEdge(from, to, options) {
        const id = `e${this.nextEdgeId++}`;
        this.edges.push({
            id,
            from,
            to,
            enabled: options?.enabled ?? true,
            sortKey: options?.sortKey,
        });
        return this;
    }
    wire(fromBlock, fromPort, toBlock, toPort, options) {
        return this.addEdge({ kind: 'port', blockId: fromBlock, slotId: fromPort }, { kind: 'port', blockId: toBlock, slotId: toPort }, options);
    }
    build() {
        return {
            blocks: new Map(this.blocks),
            edges: [...this.edges],
        };
    }
}
export function buildPatch(fn) {
    const builder = new PatchBuilder();
    fn(builder);
    return builder.build();
}
