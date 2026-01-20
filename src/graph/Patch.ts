/**
 * Patch Graph Types
 *
 * A Patch is the user-facing graph representation.
 * It consists of Blocks connected by Edges.
 */

import type { BlockId, PortId, BlockRole, DefaultSource } from '../types';

// =============================================================================
// Port Types
// =============================================================================

/**
 * Input port - a first-class object on a block.
 * Contains per-instance properties like defaultSource overrides.
 */
export interface InputPort {
  /** Port ID (slotId from registry) */
  readonly id: string;
  /** Per-instance default source override (undefined = use registry default) */
  readonly defaultSource?: DefaultSource;
}

/**
 * Output port - a first-class object on a block.
 */
export interface OutputPort {
  /** Port ID (slotId from registry) */
  readonly id: string;
}

// =============================================================================
// Block
// =============================================================================

export interface Block {
  readonly id: BlockId;
  readonly type: BlockType;
  readonly params: Readonly<Record<string, unknown>>;
  /** Optional label for display (legacy - prefer displayName) */
  readonly label?: string;
  /** User-editable display name (REQUIRED - can be null) */
  readonly displayName: string | null;
  /** Reference to domain block ID (REQUIRED - can be null) */
  readonly domainId: string | null;
  /** Semantic role for editor behavior (REQUIRED) */
  readonly role: BlockRole;
  /** Input ports - first-class objects with per-instance properties */
  readonly inputPorts: ReadonlyMap<string, InputPort>;
  /** Output ports - first-class objects with per-instance properties */
  readonly outputPorts: ReadonlyMap<string, OutputPort>;
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

  addBlock(
    type: BlockType,
    params: Record<string, unknown> = {},
    options?: {
      label?: string;
      displayName?: string | null;
      domainId?: string | null;
      role?: BlockRole;
    }
  ): BlockId {
    const id = `b${this.nextBlockId++}` as BlockId;

    this.blocks.set(id, {
      id,
      type,
      params,
      label: options?.label,
      displayName: options?.displayName ?? null,
      domainId: options?.domainId ?? null,
      role: options?.role ?? { kind: 'user', meta: {} },
      inputPorts: new Map(),
      outputPorts: new Map(),
    });
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
