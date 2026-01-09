/**
 * Graph Normalization
 *
 * Transforms a Patch into a NormalizedPatch with:
 * - Dense block indices for efficient iteration
 * - Canonical edge ordering
 * - Validated structure
 */
import type { BlockId, PortId } from '../types';
import type { Block, Edge, Patch } from './Patch';
/** Dense block index for array-based access */
export type BlockIndex = number & {
    readonly __brand: 'BlockIndex';
};
export interface NormalizedPatch {
    /** Original patch (for reference) */
    readonly patch: Patch;
    /** Map from BlockId to dense BlockIndex */
    readonly blockIndex: ReadonlyMap<BlockId, BlockIndex>;
    /** Blocks in index order */
    readonly blocks: readonly Block[];
    /** Edges with block indices instead of IDs */
    readonly edges: readonly NormalizedEdge[];
}
export interface NormalizedEdge {
    readonly fromBlock: BlockIndex;
    readonly fromPort: PortId;
    readonly toBlock: BlockIndex;
    readonly toPort: PortId;
}
export interface NormalizeResult {
    readonly kind: 'ok';
    readonly patch: NormalizedPatch;
}
export interface NormalizeError {
    readonly kind: 'error';
    readonly errors: readonly NormError[];
}
export type NormError = {
    kind: 'DanglingEdge';
    edge: Edge;
    missing: 'from' | 'to';
} | {
    kind: 'DuplicateBlockId';
    id: BlockId;
};
export declare function normalize(patch: Patch): NormalizeResult | NormalizeError;
/** Get all edges targeting a specific block/port */
export declare function getInputEdges(patch: NormalizedPatch, blockIdx: BlockIndex, portId: PortId): readonly NormalizedEdge[];
/** Get all edges from a specific block/port */
export declare function getOutputEdges(patch: NormalizedPatch, blockIdx: BlockIndex, portId: PortId): readonly NormalizedEdge[];
