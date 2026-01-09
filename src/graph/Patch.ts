/**
 * Patch Graph Types
 *
 * A Patch is the user-facing graph representation.
 * It consists of Blocks connected by Edges.
 */

import type { BlockId, PortId } from '../types';

// =============================================================================
// Block
// =============================================================================

export interface Block {
  readonly id: BlockId;
  readonly type: BlockType;
  readonly params: Readonly<Record<string, unknown>>;
  /** Optional label for display */
  readonly label?: string;
}

export type BlockType = string;

// =============================================================================
// Edge
// =============================================================================

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

// =============================================================================
// Patch
// =============================================================================

export interface Patch {
  readonly blocks: ReadonlyMap<BlockId, Block>;
  readonly edges: readonly Edge[];
}

// =============================================================================
// Builders (for tests and programmatic construction)
// =============================================================================

export class PatchBuilder {
  private blocks = new Map<BlockId, Block>();
  private edges: Edge[] = [];
  private nextBlockId = 0;
  private nextEdgeId = 0;

  addBlock(type: BlockType, params: Record<string, unknown> = {}, label?: string): BlockId {
    const id = `b${this.nextBlockId++}` as BlockId;
    this.blocks.set(id, { id, type, params, label });
    return id;
  }

  addEdge(from: Endpoint, to: Endpoint, options?: { enabled?: boolean; sortKey?: number }): this {
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

  wire(
    fromBlock: BlockId,
    fromPort: string,
    toBlock: BlockId,
    toPort: string,
    options?: { enabled?: boolean; sortKey?: number }
  ): this {
    return this.addEdge(
      { kind: 'port', blockId: fromBlock, slotId: fromPort as PortId },
      { kind: 'port', blockId: toBlock, slotId: toPort as PortId },
      options
    );
  }

  build(): Patch {
    return {
      blocks: new Map(this.blocks),
      edges: [...this.edges],
    };
  }
}

export function buildPatch(fn: (b: PatchBuilder) => void): Patch {
  const builder = new PatchBuilder();
  fn(builder);
  return builder.build();
}
