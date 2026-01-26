/**
 * Patch Graph Types
 *
 * A Patch is the user-facing graph representation.
 * It consists of Blocks connected by Edges.
 */

/**
 * ============================================================================
 * CONTRACT / NON-NEGOTIABLE BEHAVIOR
 * ============================================================================
 *
 * This module defines the *user-facing* graph model (Patch/Block/Edge).
 * It is intentionally not the compiled IR.
 *
 * What this module MUST represent:
 *   - The graph exactly as the editor would serialize it:
 *       * stable BlockId/Edge IDs
 *       * ports as endpoints
 *       * per-instance port properties (e.g. defaultSource overrides)
 *       * user roles / display metadata
 *   - Data must be sufficient to reconstruct user intent.
 *
 * What this module MUST NOT represent:
 *   - NO inferred types, NO resolved payloads, NO resolved units.
 *   - NO constraint-solver artifacts.
 *   - NO compiler-only derived structure (dense indices, schedules, slots).
 *   - NO runtime caches.
 *
 * Rationale:
 *   - Patch is the authoritative, undoable user intent.
 *   - Normalization/compilation may derive additional artifacts, but they must
 *     not be written back into Patch objects.
 *
 * Allowed future changes (safe evolutions):
 *   - Add editor-only metadata fields (selection state, UI hints) as long as
 *     they do not affect compilation semantics.
 *   - Add new endpoint kinds if/when the UI introduces new first-class
 *     connection primitives, provided normalization explicitly rewrites them.
 *   - Add new per-port override fields (still treated as user intent).
 *
 * Disallowed future changes (architectural drift):
 *   - Adding fields like `resolvedUnit`, `resolvedPayload`, `slotId`, etc.
 *     onto Block/Port/Edge.
 *   - Allowing block instance params to become a dumping ground for inferred
 *     typing results.
 */

import type { BlockId, PortId, BlockRole, DefaultSource, EdgeRole, CombineMode } from '../types';
import { requireBlockDef } from '../blocks/registry';

// =============================================================================
// Varargs Support
// =============================================================================

/**
 * A single vararg connection - references an output by canonical address.
 *
 * Varargs inputs accept variable-length connections without combining them.
 * Each connection is stored explicitly with a sort key for deterministic ordering.
 *
 * NOTE: Varargs connections are stored on the port, NOT as edges.
 * This is intentional - varargs bypass the normal edge/combine system.
 */
export interface VarargConnection {
  /**
   * Canonical address of the output being referenced.
   * Format: "blocks.<blockId>.outputs.<portId>"
   *
   * This address is resolved during normalization using the AddressRegistry
   * (from Sprint 1: canonical-addressing).
   */
  readonly sourceAddress: string;

  /**
   * User-provided alias for display (optional).
   * Used in the UI for labeling vararg connections.
   */
  readonly alias?: string;

  /**
   * Sort key for deterministic ordering.
   * Connections are sorted by this key, lowest first.
   * Block lowering receives connections in this order.
   */
  readonly sortKey: number;
}

// =============================================================================
// Port Types
// =============================================================================

/**
 * Input port - a first-class object on a block.
 * Contains per-instance properties like defaultSource overrides.
 *
 * VARARGS EXTENSION (2026-01-26):
 * - Normal inputs use edges and combine system
 * - Varargs inputs use varargConnections array (bypass combine)
 * - A port is EITHER normal OR vararg, never both
 */
export interface InputPort {
  /** Port ID (slotId from registry) */
  readonly id: string;
  /** Per-instance default source override (undefined = use registry default) */
  readonly defaultSource?: DefaultSource;
  /**
   * Combine mode for multiple inputs.
   * Determines how values from multiple edges are combined.
   * IGNORED for vararg inputs (varargs bypass combine system).
   */
  readonly combineMode: CombineMode;

  /**
   * Vararg connections (only for vararg inputs).
   * If present, this is a vararg input and normal edges are ignored.
   * Connections are ordered by sortKey for deterministic indexing.
   */
  readonly varargConnections?: readonly VarargConnection[];
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

  /** Whether this edge is enabled */
  readonly enabled: boolean;

  /** Sort key for deterministic combine ordering */
  readonly sortKey: number;

  /** Semantic role for editor behavior */
  readonly role: EdgeRole;
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
    const blockDef = requireBlockDef(type);

    // Create input ports from registry (ONLY for exposed ports)
    const inputPorts = new Map<string, InputPort>();
    for (const [inputId, inputDef] of Object.entries(blockDef.inputs)) {
      // Skip config-only inputs (exposedAsPort: false)
      // These are NOT ports and should NOT have port entries
      if (inputDef.exposedAsPort === false) continue;
      // Don't set combineMode - defaults to 'last' when undefined
      inputPorts.set(inputId, { id: inputId, combineMode: 'last' });
    }

    // Create output ports from registry
    const outputPorts = new Map<string, OutputPort>();
    for (const [outputId, outputDef] of Object.entries(blockDef.outputs)) {
      outputPorts.set(outputId, { id: outputId });
    }

    this.blocks.set(id, {
      id,
      type,
      params,
      label: options?.label,
      displayName: options?.displayName ?? null,
      domainId: options?.domainId ?? null,
      role: options?.role ?? { kind: 'user', meta: {} },
      inputPorts,
      outputPorts,
    });
    return id;
  }

  addEdge(from: Endpoint, to: Endpoint, options?: { enabled?: boolean; sortKey?: number; role?: EdgeRole }): this {
    const id = `e${this.nextEdgeId++}`;
    this.edges.push({
      id,
      from,
      to,
      enabled: options?.enabled ?? true,
      sortKey: options?.sortKey ?? this.edges.length,
      role: options?.role ?? { kind: 'user', meta: {} as Record<string, never> },
    });
    return this;
  }

  wire(
    fromBlock: BlockId,
    fromPort: string,
    toBlock: BlockId,
    toPort: string,
    options?: { enabled?: boolean; sortKey?: number; role?: EdgeRole }
  ): this {
    return this.addEdge(
      { kind: 'port', blockId: fromBlock, slotId: fromPort as PortId },
      { kind: 'port', blockId: toBlock, slotId: toPort as PortId },
      options
    );
  }

  /**
   * Add a vararg connection to an input port.
   *
   * @param blockId - Block ID
   * @param portId - Input port ID (must be a vararg input)
   * @param sourceAddress - Canonical address of the output (e.g., "blocks.b1.outputs.value")
   * @param sortKey - Sort key for ordering (connections sorted by this key)
   * @param alias - Optional display alias
   */
  addVarargConnection(
    blockId: BlockId,
    portId: string,
    sourceAddress: string,
    sortKey: number,
    alias?: string
  ): this {
    const block = this.blocks.get(blockId);
    if (!block) {
      throw new Error(`Block ${blockId} not found`);
    }

    const port = block.inputPorts.get(portId);
    if (!port) {
      throw new Error(`Input port ${portId} not found on block ${blockId}`);
    }

    // Create new vararg connection
    const newConnection: VarargConnection = {
      sourceAddress,
      sortKey,
      alias,
    };

    // Append to existing connections (or create new array)
    const existingConnections = port.varargConnections ?? [];
    const updatedConnections = [...existingConnections, newConnection];

    // Update the port with new connections array
    const updatedPort: InputPort = {
      ...port,
      varargConnections: updatedConnections,
    };

    // Update block with new port
    const updatedInputPorts = new Map(block.inputPorts);
    updatedInputPorts.set(portId, updatedPort);

    const updatedBlock: Block = {
      ...block,
      inputPorts: updatedInputPorts,
    };

    this.blocks.set(blockId, updatedBlock);
    return this;
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
