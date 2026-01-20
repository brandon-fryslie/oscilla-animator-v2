/**
 * PatchStore - THE Single Source of Truth
 *
 * This store is the ONLY place where blocks and edges are stored.
 * All other stores may reference IDs, but must derive block/edge data from here.
 *
 * Architectural invariants:
 * - No other store may duplicate block or edge data
 * - All mutations go through actions
 * - Derived state uses computed getters
 */

import { makeObservable, observable, computed, action } from 'mobx';
import type { Block, Edge, Endpoint, Patch, BlockType, InputPort, OutputPort } from '../graph/Patch';
import type { BlockId, BlockRole } from '../types';
import { emptyPatchData, type PatchData } from './internal';
import type { EventHub } from '../events/EventHub';
import { getBlockDefinition } from '../blocks/registry';

/**
 * Opaque type for immutable patch access.
 * External code receives this - they cannot construct or mutate it directly.
 */
declare const ImmutablePatchBrand: unique symbol;
export type ImmutablePatch = Patch & { readonly [ImmutablePatchBrand]: never };

export interface BlockOptions {
  label?: string;
  displayName?: string | null;
  domainId?: string | null;
  role?: BlockRole;
}

export interface EdgeOptions {
  enabled?: boolean;
  sortKey?: number;
}

export class PatchStore {
  // Private mutable state - THE source of truth
  private _data: PatchData;
  private _nextBlockId = 0;
  private _nextEdgeId = 0;

  // Optional EventHub for emitting ParamChanged events
  // Set via setEventHub() after construction (due to circular dependency with RootStore)
  private eventHub: EventHub | null = null;
  private patchId: string = 'patch-0';
  private getPatchRevision: (() => number) | null = null;

  constructor() {
    this._data = emptyPatchData();

    makeObservable<PatchStore, '_data'>(this, {
      _data: observable,
      patch: computed,
      blocks: computed,
      edges: computed,
      buses: computed,
      domains: computed,
      addBlock: action,
      removeBlock: action,
      updateBlockParams: action,
      updateBlockDisplayName: action,
      updateInputPort: action,
      addEdge: action,
      removeEdge: action,
      updateEdge: action,
      loadPatch: action,
      clear: action,
    });
  }

  // =============================================================================
  // Event Integration
  // =============================================================================

  /**
   * Sets the EventHub for emitting ParamChanged events.
   * Called by RootStore after construction to avoid circular dependency.
   */
  setEventHub(
    eventHub: EventHub,
    patchId: string,
    getPatchRevision: () => number
  ): void {
    this.eventHub = eventHub;
    this.patchId = patchId;
    this.getPatchRevision = getPatchRevision;
  }

  // =============================================================================
  // Computed Getters - Derived State
  // =============================================================================

  /**
   * Returns an immutable view of the patch.
   * This is the primary interface for reading patch data.
   */
  get patch(): ImmutablePatch {
    return {
      blocks: new Map(this._data.blocks),
      edges: [...this._data.edges],
    } as unknown as ImmutablePatch;
  }

  /**
   * Returns a readonly map of all blocks.
   */
  get blocks(): ReadonlyMap<BlockId, Block> {
    return this._data.blocks;
  }

  /**
   * Returns a readonly array of all edges.
   */
  get edges(): readonly Edge[] {
    return this._data.edges;
  }

  /**
   * Returns blocks with role.kind === 'bus'.
   * This is a computed derivation - no data duplication.
   */
  get buses(): readonly Block[] {
    return Array.from(this._data.blocks.values()).filter(
      (b) => b.role.kind === 'bus'
    );
  }

  /**
   * Returns blocks with role.kind === 'domain'.
   * This is a computed derivation - no data duplication.
   */
  get domains(): readonly Block[] {
    return Array.from(this._data.blocks.values()).filter(
      (b) => b.role.kind === 'domain'
    );
  }

  // =============================================================================
  // Actions - Mutations (The ONLY way to change state)
  // =============================================================================

  /**
   * Adds a new block to the patch.
   * Creates ports from registry definitions.
   * Returns the generated BlockId.
   */
  addBlock(
    type: BlockType,
    params: Record<string, unknown> = {},
    options?: BlockOptions
  ): BlockId {
    const id = `b${this._nextBlockId++}` as BlockId;
    const blockDef = getBlockDefinition(type);

    // Create input ports from registry
    const inputPorts = new Map<string, InputPort>();
    if (blockDef) {
      for (const [inputId, inputDef] of Object.entries(blockDef.inputs)) {
        inputPorts.set(inputId, { id: inputId });
      }
    }

    // Create output ports from registry
    const outputPorts = new Map<string, OutputPort>();
    if (blockDef) {
      for (const [outputId, outputDef] of Object.entries(blockDef.outputs)) {
        outputPorts.set(outputId, { id: outputId });
      }
    }

    const block: Block = {
      id,
      type,
      params,
      label: options?.label,
      displayName: options?.displayName ?? null,
      domainId: options?.domainId ?? null,
      role: options?.role ?? { kind: 'user', meta: {} },
      inputPorts,
      outputPorts,
    };

    this._data.blocks.set(id, block);
    return id;
  }

  /**
   * Removes a block from the patch.
   * Also removes all edges connected to this block.
   * Ports are automatically removed (nested in block).
   */
  removeBlock(id: BlockId): void {
    // Remove the block
    this._data.blocks.delete(id);

    // Remove all edges connected to this block
    this._data.edges = this._data.edges.filter(
      (edge) =>
        edge.from.blockId !== id && edge.to.blockId !== id
    );
  }

  /**
   * Updates block parameters (shallow merge).
   * Emits ParamChanged event for each parameter changed.
   */
  updateBlockParams(
    id: BlockId,
    params: Partial<Record<string, unknown>>
  ): void {
    const block = this._data.blocks.get(id);
    if (!block) {
      throw new Error(`Block not found: ${id}`);
    }

    // Emit ParamChanged events before updating (capture old values)
    if (this.eventHub && this.getPatchRevision) {
      for (const [key, newValue] of Object.entries(params)) {
        const oldValue = block.params[key];
        // Only emit if value actually changed
        if (oldValue !== newValue) {
          this.eventHub.emit({
            type: 'ParamChanged',
            patchId: this.patchId,
            patchRevision: this.getPatchRevision(),
            blockId: id,
            blockType: block.type,
            paramKey: key,
            oldValue,
            newValue,
          });
        }
      }
    }

    this._data.blocks.set(id, {
      ...block,
      params: { ...block.params, ...params },
    });
  }

  /**
   * Updates block display name.
   */
  updateBlockDisplayName(id: BlockId, displayName: string | null): void {
    const block = this._data.blocks.get(id);
    if (!block) {
      throw new Error(`Block not found: ${id}`);
    }

    this._data.blocks.set(id, {
      ...block,
      displayName,
    });
  }

  /**
   * Updates an input port's properties.
   * This is the API for editing port.defaultSource and other per-instance port properties.
   * Emits GraphCommitted event to trigger recompilation.
   */
  updateInputPort(blockId: BlockId, portId: string, updates: Partial<InputPort>): void {
    const block = this._data.blocks.get(blockId);
    if (!block) {
      throw new Error(`Block ${blockId} not found`);
    }

    // Get existing port or create from registry definition
    let port = block.inputPorts.get(portId);
    if (!port) {
      // Port not in block's map - check if it exists in registry
      const blockDef = getBlockDefinition(block.type);
      const inputDef = blockDef?.inputs[portId];
      if (!inputDef) {
        throw new Error(`Port ${portId} not found on block ${blockId}`);
      }
      // Create the port entry
      port = { id: portId };
    }

    // Update port
    const updatedPort: InputPort = { ...port, ...updates };
    const updatedInputPorts = new Map(block.inputPorts);
    updatedInputPorts.set(portId, updatedPort);

    // Update block with new ports map
    this._data.blocks.set(blockId, {
      ...block,
      inputPorts: updatedInputPorts,
    });

    // Emit GraphCommitted event to trigger recompilation
    // Port defaultSource changes affect the compiled graph
    if (this.eventHub && this.getPatchRevision) {
      this.eventHub.emit({
        type: 'GraphCommitted',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision() + 1, // Increment revision
        reason: 'userEdit',
        diffSummary: {
          blocksAdded: 0,
          blocksRemoved: 0,
          edgesChanged: 0,
        },
      });
    }
  }

  /**
   * Adds a new edge to the patch.
   * Returns the generated edge ID.
   */
  addEdge(from: Endpoint, to: Endpoint, options?: EdgeOptions): string {
    const id = `e${this._nextEdgeId++}`;
    const edge: Edge = {
      id,
      from,
      to,
      enabled: options?.enabled ?? true,
      ...(options?.sortKey !== undefined && { sortKey: options.sortKey }),
    };
    this._data.edges.push(edge);
    return id;
  }

  /**
   * Removes an edge from the patch.
   */
  removeEdge(id: string): void {
    this._data.edges = this._data.edges.filter((edge) => edge.id !== id);
  }

  /**
   * Updates edge properties.
   */
  updateEdge(id: string, updates: Partial<Edge>): void {
    const index = this._data.edges.findIndex((edge) => edge.id === id);
    if (index === -1) {
      throw new Error(`Edge not found: ${id}`);
    }

    this._data.edges[index] = {
      ...this._data.edges[index],
      ...updates,
    };
  }

  /**
   * Loads a complete patch, replacing the current one.
   * This is used for file load, undo/redo, etc.
   */
  loadPatch(patch: Patch): void {
    this._data = {
      blocks: new Map(patch.blocks),
      edges: [...patch.edges],
    };

    // Update ID generators to avoid conflicts with loaded IDs
    // Find max block ID
    let maxBlockId = -1;
    for (const blockId of patch.blocks.keys()) {
      const match = blockId.match(/^b(\d+)$/);
      if (match) {
        const id = parseInt(match[1], 10);
        if (id > maxBlockId) {
          maxBlockId = id;
        }
      }
    }
    if (maxBlockId >= 0) {
      this._nextBlockId = maxBlockId + 1;
    }

    // Find max edge ID
    let maxEdgeId = -1;
    for (const edge of patch.edges) {
      const match = edge.id.match(/^e(\d+)$/);
      if (match) {
        const id = parseInt(match[1], 10);
        if (id > maxEdgeId) {
          maxEdgeId = id;
        }
      }
    }
    if (maxEdgeId >= 0) {
      this._nextEdgeId = maxEdgeId + 1;
    }
  }

  /**
   * Clears all blocks and edges.
   */
  clear(): void {
    this._data = emptyPatchData();
  }
}
