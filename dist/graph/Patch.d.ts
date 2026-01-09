/**
 * Patch Graph Types
 *
 * A Patch is the user-facing graph representation.
 * It consists of Blocks connected by Edges.
 */
import type { BlockId, PortId } from '../types';
export interface Block {
    readonly id: BlockId;
    readonly type: BlockType;
    readonly params: Readonly<Record<string, unknown>>;
    /** Optional label for display */
    readonly label?: string;
}
export type BlockType = string;
/**
 * Endpoint - a connection point on a block.
 * After Bus-Block Unification, all endpoints are ports.
 */
export interface Endpoint {
    readonly kind: 'port';
    readonly blockId: string;
    readonly slotId: string;
}
export interface Edge {
    /** Unique edge identifier */
    readonly id: string;
    /** Source endpoint */
    readonly from: Endpoint;
    /** Target endpoint */
    readonly to: Endpoint;
    /** Whether this edge is enabled (default: true) */
    readonly enabled?: boolean;
    /** Sort key for deterministic combine ordering */
    readonly sortKey?: number;
}
/**
 * Legacy PortRef - for backwards compatibility.
 * New code should use Endpoint.
 */
export interface PortRef {
    readonly blockId: BlockId;
    readonly portId: PortId;
}
export interface Patch {
    readonly blocks: ReadonlyMap<BlockId, Block>;
    readonly edges: readonly Edge[];
}
export declare class PatchBuilder {
    private blocks;
    private edges;
    private nextBlockId;
    private nextEdgeId;
    addBlock(type: BlockType, params?: Record<string, unknown>, label?: string): BlockId;
    addEdge(from: Endpoint, to: Endpoint, options?: {
        enabled?: boolean;
        sortKey?: number;
    }): this;
    wire(fromBlock: BlockId, fromPort: string, toBlock: BlockId, toPort: string, options?: {
        enabled?: boolean;
        sortKey?: number;
    }): this;
    build(): Patch;
}
export declare function buildPatch(fn: (b: PatchBuilder) => void): Patch;
