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
import type { Block, Edge, Endpoint, Patch, BlockType, InputPort, OutputPort, LensAttachment } from '../graph/Patch';
import type { BlockId, BlockRole, CombineMode, EdgeRole, PortId } from '../types';
import { emptyPatchData, type PatchData } from './internal';
import type { EventHub } from '../events/EventHub';
import { requireAnyBlockDef } from '../blocks/registry';
import { normalizeCanonicalName, detectCanonicalNameCollisions, generateLensId } from '../core/canonical-name';
import { exportPatchAsHCL, importPatchFromHCL } from '../services/PatchPersistence';

/**
 * Opaque type for immutable patch access.
 * External code receives this - they cannot construct or mutate it directly.
 */
declare const ImmutablePatchBrand: unique symbol;
export type ImmutablePatch = Patch & { readonly [ImmutablePatchBrand]: never };

export interface BlockOptions {
  label?: string;
  displayName?: string;
  domainId?: string | null;
  role?: BlockRole;
}

export interface EdgeOptions {
  enabled?: boolean;
  sortKey?: number;
  role?: EdgeRole;
}

/**
 * Generate a default displayName for a new block.
 * Pattern: "<BlockDef.label> <n>" where n starts at 1 and increments until unique.
 *
 * @param blockType - Block type being added
 * @param existingBlocks - Current blocks in the patch
 * @returns A unique displayName
 */
function generateDefaultDisplayName(
  blockType: string,
  existingBlocks: ReadonlyMap<BlockId, Block>
): string {
  const blockDef = requireAnyBlockDef(blockType);
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

export class PatchStore {
  // Private mutable state - THE source of truth
  private _data: PatchData;
  private _nextBlockId = 0;
  private _nextEdgeId = 0;

  // Snapshot cache - prevents creating new objects on every .patch access
  // The snapshot is invalidated (set to null) when _data changes
  // This is a MAJOR performance optimization - without it, every .patch access
  // creates new Map and Array objects, causing massive GC pressure
  private _snapshotCache: ImmutablePatch | null = null;
  private _snapshotVersion = 0;
  private _dataVersion = 0;

  // Optional EventHub for emitting ParamChanged events
  // Set via setEventHub() after construction (due to circular dependency with RootStore)
  private eventHub: EventHub | null = null;
  private patchId: string = 'patch-0';
  private getPatchRevision: (() => number) | null = null;

  constructor() {
    this._data = emptyPatchData();

    makeObservable<PatchStore, '_data' | '_dataVersion'>(this, {
      _data: observable,
      _dataVersion: observable,
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
      updateInputPortCombineMode: action,
      addVarargConnection: action,
      addLens: action,
      removeLens: action,
      updateLensParams: action,
      addEdge: action,
      removeEdge: action,
      updateEdge: action,
      loadPatch: action,
      clear: action,
      loadFromHCL: action,
    });
  }

  /**
   * Invalidates the snapshot cache. Must be called after any mutation to _data.
   * This is critical for correctness - forgetting to call this will cause stale data.
   */
  private invalidateSnapshot(): void {
    this._dataVersion++;
    this._snapshotCache = null;
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
   *
   * PERFORMANCE: This getter uses a cached snapshot to avoid creating new
   * Map/Array objects on every access. Without caching, each access created
   * new objects, causing massive memory churn (739K objects, 630MB in profiler).
   *
   * The snapshot is frozen with Object.freeze to prevent accidental mutations.
   * Any attempt to mutate will throw in strict mode or silently fail.
   *
   * SAFETY: The snapshot is invalidated whenever _data is mutated via actions.
   * MobX tracks _dataVersion to ensure computed invalidation works correctly.
   */
  get patch(): ImmutablePatch {
    // Track _dataVersion for MobX reactivity - this ensures the computed
    // is invalidated when data changes
    const currentVersion = this._dataVersion;

    // Return cached snapshot if still valid
    if (this._snapshotCache !== null && this._snapshotVersion === currentVersion) {
      return this._snapshotCache;
    }

    // Create new snapshot with defensive copies
    // We still create copies here, but only when data actually changes,
    // not on every access (which was the bug)
    const snapshot = {
      blocks: new Map(this._data.blocks),
      edges: [...this._data.edges],
    };

    // Freeze the snapshot to prevent accidental mutations
    // This provides runtime safety - any mutation attempt will fail
    Object.freeze(snapshot);
    Object.freeze(snapshot.edges);
    // Note: We don't deep-freeze blocks Map values because:
    // 1. Block objects are already typed as readonly
    // 2. Deep freezing would be expensive
    // 3. TypeScript enforcement is sufficient for our codebase

    this._snapshotCache = snapshot as unknown as ImmutablePatch;
    this._snapshotVersion = currentVersion;

    return this._snapshotCache;
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
   * Auto-generates displayName if not provided.
   * Returns the generated BlockId.
   */
  addBlock(
    type: BlockType,
    params: Record<string, unknown> = {},
    options?: BlockOptions
  ): BlockId {
    const id = `b${this._nextBlockId++}` as BlockId;
    const blockDef = requireAnyBlockDef(type);

    // Create input ports from registry
    // Also collect default values for config params (exposedAsPort: false)
    const inputPorts = new Map<string, InputPort>();
    const configDefaults: Record<string, unknown> = {};
    for (const [inputId, inputDef] of Object.entries(blockDef.inputs)) {
      if (inputDef.exposedAsPort === false) {
        // Config param - collect default value if present
        if (inputDef.defaultValue !== undefined) {
          configDefaults[inputId] = inputDef.defaultValue;
        }
        continue;
      }
      inputPorts.set(inputId, { id: inputId, combineMode: 'last' });
    }

    // Merge config defaults with provided params (provided params take precedence)
    const mergedParams = { ...configDefaults, ...params };

    // Create output ports from registry
    const outputPorts = new Map<string, OutputPort>();
    for (const outputId of Object.keys(blockDef.outputs)) {
      outputPorts.set(outputId, { id: outputId });
    }

    // Always auto-generate a unique displayName from the block's label
    const displayName = generateDefaultDisplayName(type, this._data.blocks);

    const block: Block = {
      id,
      type,
      params: mergedParams,
      label: options?.label,
      displayName,
      domainId: options?.domainId ?? null,
      role: options?.role ?? { kind: 'user', meta: {} },
      inputPorts,
      outputPorts,
    };

    this._data.blocks.set(id, block);
    this.invalidateSnapshot();

    // Emit BlockAdded event
    if (this.eventHub && this.getPatchRevision) {
      this.eventHub.emit({
        type: 'BlockAdded',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision(),
        blockId: id,
        blockType: type,
      });
    }

    return id;
  }

  /**
   * Removes a block from the patch.
   * Also removes all edges connected to this block.
   * Ports are automatically removed (nested in block).
   * Emits EdgeRemoved for each edge, then BlockRemoved.
   */
  removeBlock(id: BlockId): void {
    // Protect TimeRoot blocks from deletion (silently ignore)
    const block = this._data.blocks.get(id);
    if (block?.type === 'InfiniteTimeRoot') {
      return;
    }

    // Find edges to remove (for event emission)
    const edgesToRemove = this._data.edges.filter(
      (edge) => edge.from.blockId === id || edge.to.blockId === id
    );

    // Remove the block
    this._data.blocks.delete(id);

    // Remove all edges connected to this block
    this._data.edges = this._data.edges.filter(
      (edge) =>
        edge.from.blockId !== id && edge.to.blockId !== id
    );

    this.invalidateSnapshot();

    // Emit events: EdgeRemoved for each edge, then BlockRemoved
    if (this.eventHub && this.getPatchRevision) {
      const rev = this.getPatchRevision();

      // Emit EdgeRemoved for each cascaded edge
      for (const edge of edgesToRemove) {
        this.eventHub.emit({
          type: 'EdgeRemoved',
          patchId: this.patchId,
          patchRevision: rev,
          edgeId: edge.id,
        });
      }

      // Emit BlockRemoved
      this.eventHub.emit({
        type: 'BlockRemoved',
        patchId: this.patchId,
        patchRevision: rev,
        blockId: id,
      });
    }
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

    this.invalidateSnapshot();

    // Emit BlockUpdated event (in addition to ParamChanged events above)
    if (this.eventHub && this.getPatchRevision) {
      this.eventHub.emit({
        type: 'BlockUpdated',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision(),
        blockId: id,
        changeType: 'param',
      });
    }
  }

  /**
   * Updates block display name.
   * Validates uniqueness before applying.
   *
   * @param id - Block ID
   * @param displayName - New display name (must be non-empty string)
   * @returns Error message if collision detected or name invalid
   */
  updateBlockDisplayName(id: BlockId, displayName: string): { error?: string } {
    const block = this._data.blocks.get(id);
    if (!block) {
      throw new Error(`Block not found: ${id}`);
    }

    // Validate non-empty
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      return { error: 'Display name cannot be empty' };
    }

    // Validate uniqueness (check against all OTHER blocks, not this one)
    const otherBlockNames = Array.from(this._data.blocks.values())
      .filter(b => b.id !== id)
      .map(b => b.displayName);

    const { collisions } = detectCanonicalNameCollisions([...otherBlockNames, trimmedName]);
    if (collisions.length > 0) {
      // Collision detected - return error
      const canonical = normalizeCanonicalName(trimmedName);
      return { error: `Name "${trimmedName}" conflicts with another block (canonical: "${canonical}")` };
    }

    // No collision - update the name
    this._data.blocks.set(id, {
      ...block,
      displayName: trimmedName,
    });

    this.invalidateSnapshot();

    // Emit BlockUpdated event for displayName change
    if (this.eventHub && this.getPatchRevision) {
      this.eventHub.emit({
        type: 'BlockUpdated',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision(),
        blockId: id,
        changeType: 'displayName',
        property: 'displayName',
      });
    }

    return {};
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
      const blockDef = requireAnyBlockDef(block.type);
      const inputDef = blockDef.inputs[portId];
      if (!inputDef) {
        throw new Error(`Port ${portId} not found on block ${blockId}`);
      }
      // Verify it's actually a port (not config-only)
      if (inputDef.exposedAsPort === false) {
        throw new Error(`Cannot update port ${portId} on block ${blockId}: it is a config-only input, not a port`);
      }
      // Create the port entry
      port = { id: portId, combineMode: 'last' };
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

    this.invalidateSnapshot();

    // Emit BlockUpdated event for connection/defaultSource change
    if (this.eventHub && this.getPatchRevision) {
      this.eventHub.emit({
        type: 'BlockUpdated',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision(),
        blockId,
        changeType: 'defaultSource',
        property: portId,
      });

      // Also emit GraphCommitted for backward compatibility (triggers recompilation)
      this.eventHub.emit({
        type: 'GraphCommitted',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision() + 1,
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
   * Updates the combine mode for an input port.
   * Convenience method that wraps updateInputPort.
   */
  updateInputPortCombineMode(blockId: BlockId, portId: PortId, combineMode: CombineMode): void {
    this.updateInputPort(blockId, portId, { combineMode });
  }
  /**
   * Add a vararg connection to an input port.
   *
   * @param blockId - Block ID
   * @param portId - Input port ID (must be a vararg input)
   * @param sourceAddress - Canonical address of the output (e.g., "blocks.b1.outputs.value")
   * @param sortKey - Sort key for ordering
   * @param alias - Optional display alias
   */
  addVarargConnection(
    blockId: BlockId,
    portId: string,
    sourceAddress: string,
    sortKey: number,
    alias?: string
  ): void {
    const block = this._data.blocks.get(blockId);
    if (!block) {
      throw new Error(`Block ${blockId} not found`);
    }

    // Get existing port or create from registry definition
    let port = block.inputPorts.get(portId);
    if (!port) {
      // Port not in block's map - check if it exists in registry
      const blockDef = requireAnyBlockDef(block.type);
      const inputDef = blockDef.inputs[portId];
      if (!inputDef) {
        throw new Error(`Port ${portId} not found on block ${blockId}`);
      }
      // Create the port entry
      port = { id: portId, combineMode: 'last' };
    }

    // Create new vararg connection
    const newConnection = {
      sourceAddress,
      sortKey,
      alias,
    };

    // Append to existing connections (or create new array)
    const existingConnections = port.varargConnections ?? [];
    const updatedConnections = [...existingConnections, newConnection];

    // Update port with new connections array
    const updatedPort = {
      ...port,
      varargConnections: updatedConnections,
    };

    // Update block with new port
    const updatedInputPorts = new Map(block.inputPorts);
    updatedInputPorts.set(portId, updatedPort);

    // Update block in store
    this._data.blocks.set(blockId, {
      ...block,
      inputPorts: updatedInputPorts,
    });

    this.invalidateSnapshot();

    // Emit BlockUpdated event for vararg connection change
    if (this.eventHub && this.getPatchRevision) {
      this.eventHub.emit({
        type: 'BlockUpdated',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision(),
        blockId,
        changeType: 'connection',
        property: portId,
      });

      // Also emit GraphCommitted for backward compatibility (triggers recompilation)
      this.eventHub.emit({
        type: 'GraphCommitted',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision() + 1,
        reason: 'userEdit',
        diffSummary: {
          blocksAdded: 0,
          blocksRemoved: 0,
          edgesChanged: 1,
        },
      });
    }
  }

  // =============================================================================
  // Lens Management
  // =============================================================================

  /**
   * Add a lens to an input port.
   *
   * Creates a LensAttachment and appends it to the port's lenses array.
   * Triggers recompilation via GraphCommitted event.
   *
   * @param blockId - Block containing the input port
   * @param portId - Input port ID
   * @param lensType - Block type for the lens (e.g., 'Adapter_DegreesToRadians')
   * @param sourceAddress - Canonical address of the source output
   * @param params - Optional parameters for parameterized lenses
   * @returns Generated lens ID
   */
  addLens(
    blockId: BlockId,
    portId: string,
    lensType: string,
    sourceAddress: string,
    params?: Record<string, unknown>
  ): string {
    const block = this._data.blocks.get(blockId);
    if (!block) {
      throw new Error(`Block ${blockId} not found`);
    }

    // Validate port exists (either in inputPorts or registry)
    let port = block.inputPorts.get(portId);
    if (!port) {
      const blockDef = requireAnyBlockDef(block.type);
      const inputDef = blockDef.inputs[portId];
      if (!inputDef) {
        throw new Error(`Port ${portId} not found on block ${blockId}`);
      }
      if (inputDef.exposedAsPort === false) {
        throw new Error(`Cannot add lens to config-only input ${portId}`);
      }
      // Create port entry if it doesn't exist
      port = { id: portId, combineMode: 'last' };
    }

    // Validate lens type is registered
    requireAnyBlockDef(lensType);

    // Generate deterministic lens ID
    const lensId = generateLensId(sourceAddress);

    // Check for duplicate
    const existingLenses = port.lenses ?? [];
    if (existingLenses.some(l => l.sourceAddress === sourceAddress)) {
      throw new Error(`Lens already exists for source ${sourceAddress} on port ${portId}`);
    }

    // Create lens attachment
    const lens: LensAttachment = {
      id: lensId,
      lensType,
      sourceAddress,
      params,
      sortKey: existingLenses.length,
    };

    // Update port with new lens
    const updatedPort = {
      ...port,
      lenses: [...existingLenses, lens],
    };

    // Update block with new port
    const updatedInputPorts = new Map(block.inputPorts);
    updatedInputPorts.set(portId, updatedPort);

    this._data.blocks.set(blockId, {
      ...block,
      inputPorts: updatedInputPorts,
    });

    this.invalidateSnapshot();

    // Emit events for recompilation
    if (this.eventHub && this.getPatchRevision) {
      this.eventHub.emit({
        type: 'BlockUpdated',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision(),
        blockId,
        changeType: 'other',
        property: portId,
      });

      this.eventHub.emit({
        type: 'GraphCommitted',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision() + 1,
        reason: 'userEdit',
        diffSummary: {
          blocksAdded: 0,
          blocksRemoved: 0,
          edgesChanged: 0,
        },
      });
    }

    return lensId;
  }

  /**
   * Remove a lens from an input port.
   *
   * @param blockId - Block containing the input port
   * @param portId - Input port ID
   * @param lensId - Lens ID to remove
   */
  removeLens(blockId: BlockId, portId: string, lensId: string): void {
    const block = this._data.blocks.get(blockId);
    if (!block) {
      throw new Error(`Block ${blockId} not found`);
    }

    const port = block.inputPorts.get(portId);
    const existingLenses = port?.lenses ?? [];
    const newLenses = existingLenses.filter(l => l.id !== lensId);

    if (newLenses.length === existingLenses.length) {
      throw new Error(`Lens ${lensId} not found on port ${portId}`);
    }

    // Update port - clear lenses if empty
    const updatedPort = {
      ...port!,
      lenses: newLenses.length > 0 ? newLenses : undefined,
    };

    // Update block
    const updatedInputPorts = new Map(block.inputPorts);
    updatedInputPorts.set(portId, updatedPort);

    this._data.blocks.set(blockId, {
      ...block,
      inputPorts: updatedInputPorts,
    });

    this.invalidateSnapshot();

    // Emit events
    if (this.eventHub && this.getPatchRevision) {
      this.eventHub.emit({
        type: 'BlockUpdated',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision(),
        blockId,
        changeType: 'other',
        property: portId,
      });

      this.eventHub.emit({
        type: 'GraphCommitted',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision() + 1,
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
   * Get all lenses attached to an input port.
   *
   * @param blockId - Block containing the input port
   * @param portId - Input port ID
   * @returns Array of lens attachments (empty if none)
   */
  getLensesForPort(blockId: BlockId, portId: string): readonly LensAttachment[] {
    const block = this._data.blocks.get(blockId);
    if (!block) return [];
    const port = block.inputPorts.get(portId);
    return port?.lenses ? [...port.lenses] : [];
  }

  /**
   * Update parameters for an existing lens.
   *
   * @param blockId - Block containing the input port
   * @param portId - Input port ID
   * @param lensId - Lens ID to update
   * @param params - New parameters (shallow merged with existing)
   */
  updateLensParams(
    blockId: BlockId,
    portId: string,
    lensId: string,
    params: Record<string, unknown>
  ): void {
    const block = this._data.blocks.get(blockId);
    if (!block) {
      throw new Error(`Block ${blockId} not found`);
    }

    const port = block.inputPorts.get(portId);
    const existingLenses = port?.lenses ?? [];
    const lensIndex = existingLenses.findIndex(l => l.id === lensId);

    if (lensIndex === -1) {
      throw new Error(`Lens ${lensId} not found on port ${portId}`);
    }

    // Update the lens with merged params
    const newLenses = existingLenses.map((l, i) =>
      i === lensIndex ? { ...l, params: { ...l.params, ...params } } : l
    );

    // Update port
    const updatedPort = {
      ...port!,
      lenses: newLenses,
    };

    // Update block
    const updatedInputPorts = new Map(block.inputPorts);
    updatedInputPorts.set(portId, updatedPort);

    this._data.blocks.set(blockId, {
      ...block,
      inputPorts: updatedInputPorts,
    });

    this.invalidateSnapshot();

    // Emit events
    if (this.eventHub && this.getPatchRevision) {
      this.eventHub.emit({
        type: 'GraphCommitted',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision() + 1,
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
   * Emits EdgeAdded event.
   */
  addEdge(from: Endpoint, to: Endpoint, options?: EdgeOptions): string {
    const id = `e${this._nextEdgeId++}`;
    const edge: Edge = {
      id,
      from,
      to,
      enabled: options?.enabled ?? true,
      sortKey: options?.sortKey ?? this._data.edges.length,
      role: options?.role ?? { kind: 'user', meta: {} as Record<string, never> },
    };
    this._data.edges.push(edge);
    this.invalidateSnapshot();

    // Emit EdgeAdded event
    if (this.eventHub && this.getPatchRevision) {
      this.eventHub.emit({
        type: 'EdgeAdded',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision(),
        edgeId: id,
        sourceBlockId: from.blockId,
        targetBlockId: to.blockId,
      });
    }

    return id;
  }

  /**
   * Removes an edge from the patch.
   * Emits EdgeRemoved event.
   */
  removeEdge(id: string): void {
    this._data.edges = this._data.edges.filter((edge) => edge.id !== id);
    this.invalidateSnapshot();

    // Emit EdgeRemoved event
    if (this.eventHub && this.getPatchRevision) {
      this.eventHub.emit({
        type: 'EdgeRemoved',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision(),
        edgeId: id,
      });
    }
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

    this.invalidateSnapshot();
  }

  /**
   * Loads a complete patch, replacing the current one.
   * This is used for file load, undo/redo, etc.
   * Auto-migrates null displayNames to auto-generated names.
   * Emits PatchReset event.
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

    this.invalidateSnapshot();

    // Emit PatchReset event
    if (this.eventHub && this.getPatchRevision) {
      this.eventHub.emit({
        type: 'PatchReset',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision(),
      });
    }
  }

  /**
   * Clears all blocks and edges.
   * Emits PatchReset event.
   */
  clear(): void {
    this._data = emptyPatchData();
    this.invalidateSnapshot();

    // Emit PatchReset event
    if (this.eventHub && this.getPatchRevision) {
      this.eventHub.emit({
        type: 'PatchReset',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision(),
      });
    }
  }

  // =============================================================================
  // HCL Import/Export
  // =============================================================================

  /**
   * Load patch from HCL text.
   * Updates current patch state.
   *
   * @param hcl - HCL text to deserialize
   * @throws Error if total parse failure
   */
  loadFromHCL(hcl: string): void {
    const result = importPatchFromHCL(hcl);
    if (!result) {
      throw new Error('Failed to import HCL: total parse failure');
    }

    if (result.errors.length > 0) {
      console.warn('HCL import had errors:', result.errors);
      // TODO: Optionally add errors to DiagnosticHub
    }

    this.loadPatch(result.patch);
  }

  /**
   * Export current patch as HCL text.
   *
   * @param name - Optional patch name (defaults to "Untitled")
   * @returns HCL text representation
   */
  exportToHCL(name?: string): string {
    return exportPatchAsHCL(this.patch, name);
  }
}
