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
import { detectCanonicalNameCollisions, normalizeCanonicalName, generateLensId } from '../core/canonical-name';

// =============================================================================
// Lens Attachments (Sprint 2: Lenses System Redesign - 2026-01-27)
// =============================================================================

/**
 * Lens attachment on a port.
 *
 * Describes a signal interpretation/transformation applied to a specific connection.
 * Lenses are stored on ports (not edges) because they conceptually belong to the
 * receiving or sending port - they interpret signals flowing through that port.
 *
 * Key properties:
 * - Per-port-per-connection: A port can have different lenses for each connection
 * - Addressable: `v1:blocks.{block}.inputs.{port}.lenses.{id}` (inputs)
 *              or `v1:blocks.{block}.outputs.{port}.lenses.{id}` (outputs - future)
 * - Normalized to blocks: During normalization, lenses become real blocks
 *
 * Lenses vs Type Checking (Sprint 2 Redesign):
 * - Lenses: User explicitly controls signal transformation (this system)
 * - Type Checking: Compiler validates type compatibility (separate system)
 * - These are completely independent - no fallback logic between them
 *
 * NOTE: Lenses are stored on the port, NOT as edges.
 * This is intentional - lenses belong to the port, not the connection.
 */
export interface LensAttachment {
  /**
   * Unique ID within this port's lenses.
   * Generated deterministically from source address.
   * Used in resource addressing: `my_block.inputs.count.lenses.{id}`
   */
  readonly id: string;

  /**
   * The lens block type to insert.
   * Must be a registered lens block (e.g., 'Adapter_DegreesToRadians', 'Lens_Scale').
   *
   * NOTE: Adapters are a category of lens (type conversion lenses).
   * Future lenses may include scaling, quantization, color space transforms, etc.
   */
  readonly lensType: string;

  /**
   * Canonical address of the source output this lens applies to.
   * Format: "v1:blocks.{block}.outputs.{port}"
   *
   * This identifies which incoming connection the lens transforms.
   * A port can have multiple lenses if it has multiple incoming connections.
   */
  readonly sourceAddress: string;

  /**
   * Parameters for parameterized lenses (e.g., scale factor, quantization bits).
   * Optional - only for lenses that accept parameters.
   *
   * Examples:
   * - Scaling lens: { scale: 0.5 }
   * - Quantization lens: { bits: 8 }
   * - Color space lens: { targetSpace: 'srgb' }
   */
  readonly params?: Record<string, unknown>;

  /**
   * Sort key for deterministic ordering when multiple lenses exist.
   * Lenses are processed in sortKey order during normalization.
   */
  readonly sortKey: number;
}

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
 *
 * LENSES EXTENSION (Sprint 2: 2026-01-27):
 * - Lenses are attached per-port-per-connection
 * - Each lens specifies which source connection it transforms
 * - Lenses are expanded to blocks during normalization (Pass 2)
 * - Lenses are independent of type checking (no auto-insertion)
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

  /**
   * Lens attachments for incoming connections (Sprint 2: 2026-01-27).
   *
   * Each lens specifies a signal transformation for a specific source connection.
   * Lenses are keyed by source address - one lens per (port, source) pair.
   *
   * During normalization, lenses are expanded to real lens blocks.
   * The lens ID is used for resource addressing:
   *   `v1:blocks.{block}.inputs.{port}.lenses.{id}`
   *
   * NOTE: Lenses are user-controlled transformations, independent of type checking.
   */
  readonly lenses?: readonly LensAttachment[];
}

/**
 * Output port - a first-class object on a block.
 *
 * LENSES EXTENSION (Sprint 2: 2026-01-27 - Future-proofing):
 * - Output lenses reserved for future use
 * - Will allow transforming outgoing signals (e.g., scaling, normalization)
 * - Address format: `v1:blocks.{block}.outputs.{port}.lenses.{id}`
 * - Currently unused but designed in to avoid breaking changes later
 */
export interface OutputPort {
  /** Port ID (slotId from registry) */
  readonly id: string;

  /**
   * Lens attachments for outgoing connections (FUTURE - Sprint 2 design).
   *
   * Not yet implemented, but the interface is defined to support future expansion
   * without breaking changes to the data model.
   *
   * When implemented, output lenses will transform signals before they reach
   * connected input ports.
   */
  readonly lenses?: readonly LensAttachment[];
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
  /** User-editable display name (REQUIRED - always has a value) */
  readonly displayName: string;
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

/**
 * Generate a default displayName for a new block in PatchBuilder.
 * Pattern: "<BlockDef.label> <n>" where n starts at 1 and increments until unique.
 *
 * @param blockType - Block type being added
 * @param existingBlocks - Current blocks in the builder
 * @returns A unique displayName
 */
function generateDefaultDisplayName(
  blockType: string,
  existingBlocks: ReadonlyMap<BlockId, Block>
): string {
  const blockDef = requireBlockDef(blockType);
  const baseLabel = blockDef.label;

  // Count existing blocks of the same type
  let count = 1;
  for (const block of existingBlocks.values()) {
    if (block.type === blockType) {
      count++;
    }
  }

  // Collect all existing displayNames for collision detection
  const existingNames = Array.from(existingBlocks.values())
    .map(b => b.displayName)
    .filter((n): n is string => n !== null && n !== '');

  // Generate candidate and check for collisions across ALL blocks
  let candidate = `${baseLabel} ${count}`;
  while (detectCanonicalNameCollisions([...existingNames, candidate]).collisions.length > 0) {
    count++;
    candidate = `${baseLabel} ${count}`;
  }

  return candidate;
}

export class PatchBuilder {
  private blocks = new Map<BlockId, Block>();
  private edges: Edge[] = [];
  private nextBlockId = 0;
  private nextEdgeId = 0;
  private snapshotInvalidated = false;

  /**
   * Add a block to the patch.
   *
   * SINGLE SOURCE OF TRUTH (2026-02-01):
   * - Block.params contains ONLY config values (exposedAsPort: false)
   * - Config defaults are loaded from InputDef.value automatically
   * - Port default values must be set via setPortDefault() after creation
   *
   * @param type - Block type (from registry)
   * @param options - Optional block metadata
   * @returns BlockId of the created block
   */
  addBlock(
    type: BlockType,
    options?: {
      label?: string;
      displayName?: string;
      domainId?: string | null;
      role?: BlockRole;
    }
  ): BlockId {
    const id = `b${this.nextBlockId++}` as BlockId;
    const blockDef = requireBlockDef(type);

    // Create input ports from registry (ONLY for exposed ports)
    // Also collect default values for config params (exposedAsPort: false)
    const inputPorts = new Map<string, InputPort>();
    const configDefaults: Record<string, unknown> = {};
    for (const [inputId, inputDef] of Object.entries(blockDef.inputs)) {
      if (inputDef.exposedAsPort === false) {
        // Config param - collect default value if present
        if (inputDef.value !== undefined) {
          configDefaults[inputId] = inputDef.value;
        }
        continue;
      }
      // Don't set combineMode - defaults to 'last' when undefined
      inputPorts.set(inputId, { id: inputId, combineMode: 'last' });
    }

    // Create output ports from registry
    const outputPorts = new Map<string, OutputPort>();
    for (const outputId of Object.keys(blockDef.outputs)) {
      outputPorts.set(outputId, { id: outputId });
    }

    // Auto-generate displayName if not provided or empty
    const displayName = options?.displayName && options.displayName.trim()
      ? options.displayName
      : generateDefaultDisplayName(type, this.blocks);

    // Validate no collision with existing displayNames
    const existingNames = Array.from(this.blocks.values())
      .map(b => b.displayName);
    const { collisions } = detectCanonicalNameCollisions([...existingNames, displayName]);
    if (collisions.length > 0) {
      throw new Error(`Display name "${displayName}" conflicts with existing block (canonical: "${normalizeCanonicalName(displayName)}")`);
    }

    this.blocks.set(id, {
      id,
      type,
      params: configDefaults,
      label: options?.label,
      displayName,
      domainId: options?.domainId ?? null,
      role: options?.role ?? { kind: 'user', meta: {} },
      inputPorts,
      outputPorts,
    });
    this.invalidateSnapshot();
    return id;
  }

  /**
   * Set a default value for an exposed port.
   * Creates a Const defaultSource with the given value.
   *
   * @param blockId - Block ID
   * @param portId - Input port ID (must be an exposed port)
   * @param value - Constant value
   * @returns this (for chaining)
   */
  setPortDefault(blockId: BlockId, portId: string, value: unknown): this {
    const block = this.blocks.get(blockId);
    if (!block) throw new Error(`Block ${blockId} not found`);
    const port = block.inputPorts.get(portId);
    if (!port) throw new Error(`Port ${portId} not found on block ${blockId}`);

    const newPort = {
      ...port,
      defaultSource: {
        blockType: 'Const' as const,
        output: 'out',
        params: { value }
      }
    };
    const newPorts = new Map(block.inputPorts);
    newPorts.set(portId, newPort);
    this.blocks.set(blockId, { ...block, inputPorts: newPorts });
    this.invalidateSnapshot();
    return this;
  }

  /**
   * Set a config parameter value (for exposedAsPort: false inputs).
   *
   * @param blockId - Block ID
   * @param key - Config parameter key
   * @param value - Config value
   * @returns this (for chaining)
   */
  setConfig(blockId: BlockId, key: string, value: unknown): this {
    const block = this.blocks.get(blockId);
    if (!block) throw new Error(`Block ${blockId} not found`);
    this.blocks.set(blockId, { ...block, params: { ...block.params, [key]: value } });
    this.invalidateSnapshot();
    return this;
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
    this.invalidateSnapshot();
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
    this.invalidateSnapshot();
    return this;
  }

  /**
   * Add a lens to an input port.
   *
   * @param blockId - Block ID
   * @param portId - Input port ID
   * @param lensType - Lens block type
   * @param sourceAddress - Canonical address of the source output
   * @param params - Optional lens parameters
   */
  addLens(
    blockId: BlockId,
    portId: string,
    lensType: string,
    sourceAddress: string,
    params?: Record<string, unknown>
  ): this {
    const block = this.blocks.get(blockId);
    if (!block) {
      throw new Error(`Block ${blockId} not found`);
    }

    const port = block.inputPorts.get(portId);
    if (!port) {
      throw new Error(`Input port ${portId} not found on block ${blockId}`);
    }

    const lensId = generateLensId(sourceAddress);
    const existingLenses = port.lenses ?? [];

    const lens: LensAttachment = {
      id: lensId,
      lensType,
      sourceAddress,
      params,
      sortKey: existingLenses.length,
    };

    const updatedPort: InputPort = {
      ...port,
      lenses: [...existingLenses, lens],
    };

    const updatedInputPorts = new Map(block.inputPorts);
    updatedInputPorts.set(portId, updatedPort);

    this.blocks.set(blockId, { ...block, inputPorts: updatedInputPorts });
    this.invalidateSnapshot();
    return this;
  }

  private invalidateSnapshot(): void {
    this.snapshotInvalidated = true;
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
