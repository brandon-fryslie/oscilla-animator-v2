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

import { makeObservable, observable, computed, action, reaction } from 'mobx';
import type { Block, Edge, Endpoint, Patch, BlockType, InputPort, OutputPort, LensAttachment } from '../graph/Patch';
import type { BlockId, BlockRole, CombineMode, DefaultSource, EdgeRole, PortId } from '../types';
import { emptyPatchData, type PatchData } from './internal';
import type { EventHub } from '../events/EventHub';
import { requireAnyBlockDef } from '../blocks/registry';
import { normalizeCanonicalName, detectCanonicalNameCollisions } from '../core/canonical-name';
import { exportPatchAsHCL, importPatchFromHCL, savePatchToStorage } from '../services/PatchPersistence';
import { derivedLensParamKey } from '../graph/lens-block-id';
import { nextLensAttachmentId } from '../graph/lens-id';
import type { PatchDslError } from '../patch-dsl';

/**
 * Opaque type for immutable patch access.
 * External code receives this - they cannot construct or mutate it directly.
 */
declare const ImmutablePatchBrand: unique symbol;
export type ImmutablePatch = Patch & { readonly [ImmutablePatchBrand]: never };

export interface BlockOptions {
  displayName?: string;
  domainId?: string | null;
  role?: BlockRole;
}

export interface EdgeOptions {
  enabled?: boolean;
  sortKey?: number;
  role?: EdgeRole;
  alias?: string;
}

export type PatchStoreIssueLevel = 'warn' | 'error';

export interface PatchStoreIssue {
  readonly level: PatchStoreIssueLevel;
  readonly message: string;
  readonly detail?: unknown;
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

// [LAW:one-source-of-truth] Default-source derived block identity is canonical.
function derivedDefaultSourceBlockId(targetBlockId: BlockId, targetPortId: string): BlockId {
  return `_ds_${targetBlockId}_${targetPortId}` as BlockId;
}

function sourceAddress(blockId: BlockId, outputPortId: string): string {
  return `v1:blocks.${blockId}.outputs.${outputPortId}`;
}

// [LAW:one-type-per-behavior] Time-source identity is one predicate shared by
// materialize and dematerialize paths.
function isTimeSourceBlockType(blockType: string): boolean {
  return blockType === 'TimeRoot' || blockType === 'InfiniteTimeRoot';
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

  // Fast-path change tracking: classify mutations as value-only vs structural
  private _pendingValueChanges: Map<string, unknown> = new Map();
  private _hasStructuralChange: boolean = false;

  // Optional EventHub for emitting ParamChanged events
  // Set via setEventHub() after construction (due to circular dependency with RootStore)
  private eventHub: EventHub | null = null;
  private patchId: string = 'patch-0';
  private getPatchRevision: (() => number) | null = null;
  private issueReporter?: (issue: PatchStoreIssue) => void;
  lastIssue: PatchStoreIssue | null = null;

  constructor() {
    this._data = emptyPatchData();

    makeObservable<PatchStore, '_data' | '_dataVersion'>(this, {
      _data: observable,
      _dataVersion: observable,
      patch: computed,
      // [LAW:one-source-of-truth] blocks/edges expose canonical patch data;
      // they are direct state accessors, not derived computations.
      buses: computed,
      domains: computed,
      addBlock: action,
      removeBlock: action,
      updateBlockParams: action,
      updateBlockDisplayName: action,
      updateInputPort: action,
      updateInputPortCombineMode: action,
      materializeInputDefaultSource: action,
      dematerializeInputDefaultSource: action,

      addLens: action,
      removeLens: action,
      updateLensParams: action,
      addEdge: action,
      addCollectEdge: action,
      removeEdge: action,
      updateEdge: action,
      loadPatch: action,
      clear: action,
      loadFromHCL: action,
      consumePendingChanges: action,
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

  /**
   * Sets issue reporting sink for non-fatal operational warnings/errors.
   */
  setIssueReporter(issueReporter: (issue: PatchStoreIssue) => void): void {
    this.issueReporter = issueReporter;
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
    this._hasStructuralChange = true;
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
    const block = this._data.blocks.get(id);
    if (!block) {
      this.reportIssue('warn', `Attempted to remove missing block '${id}'`);
      return;
    }
    // [LAW:no-silent-fallbacks] Protected blocks reject user mutation with an
    // explicit issue instead of a silent no-op.
    if (block.type === 'InfiniteTimeRoot') {
      this.reportIssue('warn', `Cannot remove protected block '${id}' of type InfiniteTimeRoot`);
      return;
    }
    this._hasStructuralChange = true;

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

    const changedEntries = Object.entries(params).filter(([key, newValue]) => block.params[key] !== newValue);
    if (changedEntries.length === 0) {
      return;
    }

    // [LAW:one-source-of-truth] Track fast-path candidates from canonical block.params
    // keys regardless of whether the key originated from config or exposed-port UI.
    for (const [key, newValue] of changedEntries) {
      this._pendingValueChanges.set(`${id}:${key}`, newValue);
    }

    const mergedParams = { ...block.params };
    for (const [key, newValue] of changedEntries) {
      if (newValue === undefined) {
        delete mergedParams[key];
      } else {
        mergedParams[key] = newValue;
      }
    }
    const blockDef = requireAnyBlockDef(block.type);
    let updatedInputPorts: Map<string, InputPort> = new Map(block.inputPorts);
    let portsChanged = false;

    // [LAW:single-enforcer] Keep per-port defaultSource metadata synchronized from
    // canonical params at the PatchStore mutation boundary.
    for (const [key, newValue] of changedEntries) {
      const inputDef = blockDef.inputs[key];
      if (!inputDef || inputDef.exposedAsPort === false) continue;
      const existingPort = updatedInputPorts.get(key) ?? { id: key, combineMode: 'last' as const };
      const syncedDefaultSource = newValue === undefined
        ? undefined
        : { blockType: 'Const', output: 'out', params: { value: newValue } };
      if (existingPort.defaultSource === syncedDefaultSource) continue;
      portsChanged = true;
      updatedInputPorts.set(key, {
        ...existingPort,
        defaultSource: syncedDefaultSource,
      });
    }

    // Emit ParamChanged events before updating (capture old values)
    if (this.eventHub && this.getPatchRevision) {
      for (const [key, newValue] of changedEntries) {
        const oldValue = block.params[key];
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

    this._data.blocks.set(id, {
      ...block,
      params: mergedParams,
      inputPorts: portsChanged ? updatedInputPorts : block.inputPorts,
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

    // Classify: value-only if only defaultSource.params changed.
    // First-time defaultSource setting is also value-only because provenance
    // keys are target-port based ("blockId:portId"), independent of source topology.
    const isValueOnly = (() => {
      if (!updates.defaultSource) return false;
      const updateKeys = Object.keys(updates);
      if (updateKeys.length !== 1 || updateKeys[0] !== 'defaultSource') return false;
      // If port already has a defaultSource, check same blockType/output (value-only change)
      if (port.defaultSource) {
        return (
          port.defaultSource.blockType === updates.defaultSource.blockType &&
          port.defaultSource.output === updates.defaultSource.output
        );
      }
      // First-time: check registry default matches the update's blockType
      const blockDef = requireAnyBlockDef(block.type);
      const inputDef = blockDef.inputs[portId];
      if (!inputDef?.defaultSource) return false;
      return inputDef.defaultSource.blockType === updates.defaultSource.blockType;
    })();

    if (isValueOnly) {
      const rawValue = updates.defaultSource!.params?.value;
      if (rawValue !== undefined) {
        this._pendingValueChanges.set(`${blockId}:${portId}`, rawValue);
      }
    } else {
      this._hasStructuralChange = true;
    }

    // Update port
    const updatedPort: InputPort = { ...port, ...updates };
    const updatedInputPorts = new Map(block.inputPorts);
    updatedInputPorts.set(portId, updatedPort);

    const blockDef = requireAnyBlockDef(block.type);
    const inputDef = blockDef.inputs[portId];
    const nextParams = { ...block.params };
    if (Object.prototype.hasOwnProperty.call(updates, 'defaultSource') && inputDef?.exposedAsPort !== false) {
      const nextDefault = updates.defaultSource;
      if (nextDefault && nextDefault.blockType === 'Const' && nextDefault.output === 'out' && nextDefault.params?.value !== undefined) {
        // [LAW:one-source-of-truth] Canonical source for user-editable values is block.params.
        nextParams[portId] = nextDefault.params.value;
      } else {
        delete nextParams[portId];
      }
    }

    // Update block with new ports map
    this._data.blocks.set(blockId, {
      ...block,
      params: nextParams,
      inputPorts: updatedInputPorts,
    });

    this.invalidateSnapshot();

    // Emit BlockUpdated event for connection/defaultSource change
    if (this.eventHub && this.getPatchRevision) {
      // [LAW:single-enforcer] RootStore emits GraphCommitted from patch snapshot
      // identity; PatchStore emits only fine-grained mutation events.
      this.eventHub.emit({
        type: 'BlockUpdated',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision(),
        blockId,
        changeType: 'defaultSource',
        property: portId,
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
   * Materialize an input port default source into an explicit graph edge.
   *
   * Creates a concrete source block (or reuses TimeRoot), wires it to the input,
   * and rewrites any lens sourceAddress that previously targeted the derived
   * default-source address for this input.
   */
  materializeInputDefaultSource(
    targetBlockId: BlockId,
    targetPortId: PortId,
  ): { materializedBlockId?: BlockId; createdNewBlock: boolean; error?: string } {
    const targetBlock = this._data.blocks.get(targetBlockId);
    if (!targetBlock) {
      throw new Error(`Block not found: ${targetBlockId}`);
    }

    const targetDef = requireAnyBlockDef(targetBlock.type);
    const inputDef = targetDef.inputs[targetPortId];
    if (!inputDef || inputDef.exposedAsPort === false) {
      const message = `Input port ${targetBlockId}.${targetPortId} not found or not exposable`;
      this.reportIssue('warn', message);
      return { createdNewBlock: false, error: message };
    }

    const connected = this._data.edges.some(
      (edge) => edge.to.blockId === targetBlockId && edge.to.slotId === targetPortId,
    );
    if (connected) {
      const message = `Cannot materialize ${targetBlockId}.${targetPortId}: port is already connected`;
      this.reportIssue('warn', message);
      return { createdNewBlock: false, error: message };
    }

    const instancePort = targetBlock.inputPorts.get(targetPortId);
    const effectiveDefault = instancePort?.defaultSource ?? inputDef.defaultSource;
    if (!effectiveDefault) {
      const message = `Cannot materialize ${targetBlockId}.${targetPortId}: no default source is configured`;
      this.reportIssue('warn', message);
      return { createdNewBlock: false, error: message };
    }

    const materializeAddressFrom = sourceAddress(
      derivedDefaultSourceBlockId(targetBlockId, targetPortId),
      effectiveDefault.output,
    );

    if (isTimeSourceBlockType(effectiveDefault.blockType)) {
      // [LAW:one-source-of-truth] Time defaults always point at the canonical
      // time source block rather than creating duplicate time roots.
      const timeSource = Array.from(this._data.blocks.values()).find((block) =>
        isTimeSourceBlockType(block.type),
      );
      if (!timeSource) {
        const message = `Cannot materialize ${targetBlockId}.${targetPortId}: no TimeRoot block exists`;
        this.reportIssue('warn', message);
        return { createdNewBlock: false, error: message };
      }

      this.addEdge(
        { kind: 'port', blockId: timeSource.id, slotId: effectiveDefault.output },
        { kind: 'port', blockId: targetBlockId, slotId: targetPortId },
      );

      const portAfterConnect = this._data.blocks.get(targetBlockId)?.inputPorts.get(targetPortId);
      const existingLenses = portAfterConnect?.lenses ?? [];
      const materializedAddressTo = sourceAddress(timeSource.id, effectiveDefault.output);
      const rewrittenLenses = existingLenses.map((lens) =>
        lens.sourceAddress === materializeAddressFrom
          ? { ...lens, sourceAddress: materializedAddressTo }
          : lens,
      );
      const changed = rewrittenLenses.some((lens, idx) => lens.sourceAddress !== existingLenses[idx].sourceAddress);
      if (changed) {
        this.updateInputPort(targetBlockId, targetPortId, { lenses: rewrittenLenses });
      }

      return {
        materializedBlockId: timeSource.id,
        createdNewBlock: false,
      };
    }

    requireAnyBlockDef(effectiveDefault.blockType);

    // [LAW:single-enforcer] PatchStore is the only boundary that mutates graph
    // state for default-source materialization.
    const materializedBlockId = this.addBlock(effectiveDefault.blockType, { ...(effectiveDefault.params ?? {}) }, {
      domainId: targetBlock.domainId,
      role: { kind: 'user', meta: {} },
    });
    this.addEdge(
      { kind: 'port', blockId: materializedBlockId, slotId: effectiveDefault.output },
      { kind: 'port', blockId: targetBlockId, slotId: targetPortId },
    );

    const portAfterConnect = this._data.blocks.get(targetBlockId)?.inputPorts.get(targetPortId);
    const existingLenses = portAfterConnect?.lenses ?? [];
    const materializedAddressTo = sourceAddress(materializedBlockId, effectiveDefault.output);
    const rewrittenLenses = existingLenses.map((lens) =>
      lens.sourceAddress === materializeAddressFrom
        ? { ...lens, sourceAddress: materializedAddressTo }
        : lens,
    );
    const changed = rewrittenLenses.some((lens, idx) => lens.sourceAddress !== existingLenses[idx].sourceAddress);
    if (changed) {
      this.updateInputPort(targetBlockId, targetPortId, { lenses: rewrittenLenses });
    }

    return {
      materializedBlockId,
      createdNewBlock: true,
    };
  }

  /**
   * Dematerialize a connected source block back into an input default source.
   *
   * Captures source block type/output/params into InputPort.defaultSource,
   * rewrites target-port lens sourceAddress back to the derived default-source
   * address, then removes the explicit edge and the materialized source block
   * (except TimeRoot sources, which are reused and retained).
   */
  dematerializeInputDefaultSource(
    targetBlockId: BlockId,
    targetPortId: PortId,
  ): { removedBlockId?: BlockId; error?: string } {
    const targetBlock = this._data.blocks.get(targetBlockId);
    if (!targetBlock) {
      throw new Error(`Block not found: ${targetBlockId}`);
    }

    const targetDef = requireAnyBlockDef(targetBlock.type);
    const inputDef = targetDef.inputs[targetPortId];
    if (!inputDef || inputDef.exposedAsPort === false) {
      const message = `Input port ${targetBlockId}.${targetPortId} not found or not exposable`;
      this.reportIssue('warn', message);
      return { error: message };
    }

    const incomingEdges = this._data.edges.filter(
      (edge) => edge.to.blockId === targetBlockId && edge.to.slotId === targetPortId,
    );
    if (incomingEdges.length !== 1) {
      const message = `Cannot dematerialize ${targetBlockId}.${targetPortId}: requires exactly one incoming edge`;
      this.reportIssue('warn', message);
      return { error: message };
    }
    const incomingEdge = incomingEdges[0];
    const sourceBlock = this._data.blocks.get(incomingEdge.from.blockId as BlockId);
    if (!sourceBlock) {
      const message = `Cannot dematerialize ${targetBlockId}.${targetPortId}: source block missing`;
      this.reportIssue('warn', message);
      return { error: message };
    }

    const sourceOutgoingEdges = this._data.edges.filter((edge) => edge.from.blockId === sourceBlock.id);
    const sourceIncomingEdges = this._data.edges.filter((edge) => edge.to.blockId === sourceBlock.id);
    const removeSourceBlock = !isTimeSourceBlockType(sourceBlock.type);
    if (removeSourceBlock) {
      const onlyFeedsTarget =
        sourceOutgoingEdges.length === 1
        && sourceOutgoingEdges[0].id === incomingEdge.id
        && sourceIncomingEdges.length === 0;
      if (!onlyFeedsTarget) {
        const message = `Cannot dematerialize ${targetBlockId}.${targetPortId}: source block ${sourceBlock.id} is shared or has upstream inputs`;
        this.reportIssue('warn', message);
        return { error: message };
      }
    }

    const newDefaultSource: DefaultSource = {
      blockType: sourceBlock.type,
      output: incomingEdge.from.slotId,
      ...(Object.keys(sourceBlock.params).length > 0 ? { params: { ...sourceBlock.params } } : {}),
    };

    const materializedAddressFrom = sourceAddress(sourceBlock.id, incomingEdge.from.slotId);
    const dematerializedAddressTo = sourceAddress(
      derivedDefaultSourceBlockId(targetBlockId, targetPortId),
      incomingEdge.from.slotId,
    );
    const existingLenses = targetBlock.inputPorts.get(targetPortId)?.lenses ?? [];
    const rewrittenLenses = existingLenses.map((lens) =>
      lens.sourceAddress === materializedAddressFrom
        ? { ...lens, sourceAddress: dematerializedAddressTo }
        : lens,
    );
    const changed = rewrittenLenses.some((lens, idx) => lens.sourceAddress !== existingLenses[idx].sourceAddress);

    // [LAW:single-enforcer] Dematerialization writes both defaultSource and
    // lens-source rewrite through the InputPort mutation boundary.
    this.updateInputPort(targetBlockId, targetPortId, {
      defaultSource: newDefaultSource,
      ...(changed ? { lenses: rewrittenLenses } : {}),
    });

    this.removeEdge(incomingEdge.id);
    if (removeSourceBlock) {
      this.removeBlock(sourceBlock.id);
      return { removedBlockId: sourceBlock.id };
    }

    return {};
  }
  // =============================================================================
  // Lens Management
  // =============================================================================

  /**
   * Add a lens to an input port.
   *
   * Creates a LensAttachment and appends it to the port's lenses array.
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
    this._hasStructuralChange = true;
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

    const existingLenses = port.lenses ?? [];
    const lensId = nextLensAttachmentId(existingLenses, sourceAddress, lensType);

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
    this._hasStructuralChange = true;
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

    const previousLens = existingLenses[lensIndex];
    let hasAnyValueChange = false;
    for (const [paramId, nextValue] of Object.entries(params)) {
      const prevValue = previousLens.params?.[paramId];
      if (prevValue !== nextValue) {
        hasAnyValueChange = true;
        // [LAW:one-source-of-truth] Fast-path key matches derived lens block + exposed param port.
        this._pendingValueChanges.set(derivedLensParamKey(portId, lensId, paramId), nextValue);
      }
    }
    if (!hasAnyValueChange) {
      return;
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
        type: 'BlockUpdated',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision(),
        blockId,
        changeType: 'other',
        property: portId,
      });
    }
  }

  /**
   * Adds a new edge to the patch.
   * Returns the generated edge ID.
   * Emits EdgeAdded event.
   */
  addEdge(from: Endpoint, to: Endpoint, options?: EdgeOptions): string {
    this._hasStructuralChange = true;
    const id = `e${this._nextEdgeId++}`;
    const edge: Edge = {
      id,
      from,
      to,
      enabled: options?.enabled ?? true,
      sortKey: options?.sortKey ?? this._data.edges.length,
      role: options?.role ?? { kind: 'user', meta: {} as Record<string, never> },
      ...(options?.alias !== undefined ? { alias: options.alias } : {}),
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
   * Add a collect edge to a collect port.
   * Creates a normal edge with collect role.
   * [LAW:one-type-per-behavior] Collect edges are standard edges.
   */
  addCollectEdge(from: Endpoint, to: Endpoint, alias?: string): string {
    return this.addEdge(from, to, {
      role: { kind: 'collect', meta: { alias } },
      alias,
    });
  }

  /**
   * Removes an edge from the patch.
   * Emits EdgeRemoved event.
   */
  removeEdge(id: string): void {
    this._hasStructuralChange = true;
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
    this._hasStructuralChange = true;
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
    this._hasStructuralChange = true;
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
   * Clears all blocks and edges, then auto-inserts InfiniteTimeRoot.
   * Every patch must have exactly one TimeRoot (system-managed).
   * Emits PatchReset event.
   */
  clear(): void {
    this._hasStructuralChange = true;
    this._data = emptyPatchData();
    this.invalidateSnapshot();

    // Auto-insert TimeRoot (required for all patches, system-managed)
    this.addBlock('InfiniteTimeRoot');

    // Emit events
    if (this.eventHub && this.getPatchRevision) {
      const rev = this.getPatchRevision();

      // Emit PatchReset
      this.eventHub.emit({
        type: 'PatchReset',
        patchId: this.patchId,
        patchRevision: rev,
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
  loadFromHCL(hcl: string): { errors: readonly PatchDslError[] } {
    this._hasStructuralChange = true;
    const result = importPatchFromHCL(hcl);
    if (!result) {
      throw new Error('Failed to import HCL: total parse failure');
    }

    if (result.errors.length > 0) {
      this.reportIssue('warn', 'HCL import had recoverable errors', result.errors);
    }

    this.loadPatch(result.patch);
    return { errors: result.errors };
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

  // =============================================================================
  // Persistence Lifecycle
  // =============================================================================

  private persistDisposer: (() => void) | null = null;

  /**
   * Start auto-persisting patch to localStorage on changes (debounced 500ms).
   * [LAW:single-enforcer] Only PatchStore manages its own persistence.
   */
  startPersistence(): void {
    this.stopPersistence();
    this.persistDisposer = reaction(
      () => this.patch,
      (patch) => savePatchToStorage(patch, 0),
      { delay: 500 }
    );
  }

  /**
   * Stop auto-persistence. Call on dispose/HMR cleanup.
   */
  stopPersistence(): void {
    this.persistDisposer?.();
    this.persistDisposer = null;
  }

  private reportIssue(level: PatchStoreIssueLevel, message: string, detail?: unknown): void {
    const issue: PatchStoreIssue = { level, message, detail };
    this.lastIssue = issue;
    this.issueReporter?.(issue);
  }

  // =============================================================================
  // Fast-Path Change Tracking
  // =============================================================================

  /**
   * Consume pending change classification for the fast-path recompile decision.
   *
   * Returns `{ kind: 'valueOnly', changes }` if only canonical value entries
   * changed since the last consumption. Returns `{ kind: 'structural' }` if any
   * structural mutation occurred (or no changes at all).
   *
   * Resets tracking state after consumption.
   */
  consumePendingChanges(): { kind: 'valueOnly'; changes: ReadonlyMap<string, unknown> } | { kind: 'structural' } {
    if (this._hasStructuralChange || this._pendingValueChanges.size === 0) {
      this._hasStructuralChange = false;
      this._pendingValueChanges.clear();
      return { kind: 'structural' };
    }
    const changes = new Map(this._pendingValueChanges);
    this._pendingValueChanges.clear();
    this._hasStructuralChange = false;
    return { kind: 'valueOnly', changes };
  }
}
