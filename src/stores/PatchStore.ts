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
import type {
  Block,
  Edge,
  Endpoint,
  Patch,
  BlockType,
  InputPort,
  OutputPort,
  LensAttachment,
  AuthoredControlSource,
  AuthoredInputControl,
} from '../graph/Patch';
import type { BlockId, BlockRole, CombineMode, DefaultSource, EdgeRole, PortId } from '../types';
import { canonicalizeCombineMode } from '../types';
import { emptyPatchData, type PatchData } from './internal';
import type { EventHub } from '../events/EventHub';
import { requireAnyBlockDef } from '../blocks/registry';
import { getBlockDefinition } from '../blocks/registry';
import { getPreferredInlineSourceParam } from '../blocks/editable-config';
import { normalizeCanonicalName, detectCanonicalNameCollisions } from '../core/canonical-name';
import { exportPatchAsHCL, importPatchFromHCL, savePatchToStorage } from '../services/PatchPersistence';
import { deriveEdgeAlias } from '../graph/edge-alias';
import { nextLensAttachmentId } from '../graph/lens-id';
import type { PatchDslError } from '../patch-dsl';
import type { ControlMutationTarget } from '../types/control-target';

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

function samePortEndpoints(a: Endpoint, b: Endpoint): boolean {
  return a.kind === 'port' &&
    b.kind === 'port' &&
    a.blockId === b.blockId &&
    a.slotId === b.slotId;
}

// [LAW:one-type-per-behavior] Time-source identity is one predicate shared by
// materialize and dematerialize paths.
function isTimeSourceBlockType(blockType: string): boolean {
  // [LAW:one-source-of-truth] Time-source identity is declared by BlockDef capability.
  return getBlockDefinition(blockType)?.capability === 'time';
}

function cloneLensAttachment(lens: LensAttachment): LensAttachment {
  return Object.freeze({
    ...lens,
    ...(lens.params ? { params: Object.freeze({ ...lens.params }) } : {}),
  });
}

function cloneDefaultSource(defaultSource: DefaultSource | undefined): DefaultSource | undefined {
  if (!defaultSource) return undefined;
  return Object.freeze({
    ...defaultSource,
    ...(defaultSource.params ? { params: Object.freeze({ ...defaultSource.params }) } : {}),
  });
}

function cloneAuthoredControlSource(source: AuthoredControlSource | null | undefined): AuthoredControlSource | null | undefined {
  if (source === undefined || source === null) return source;
  return Object.freeze({
    ...source,
    params: Object.freeze({ ...source.params }),
  });
}

function cloneAuthoredInputControl(control: AuthoredInputControl | undefined): AuthoredInputControl | undefined {
  if (!control) return undefined;
  return Object.freeze({
    ...control,
    source: cloneAuthoredControlSource(control.source) ?? null,
  });
}

function constSource(value: unknown): AuthoredControlSource {
  return Object.freeze({
    id: 'source',
    blockType: 'Const',
    outputPortId: 'out',
    params: Object.freeze({ value }),
  });
}

function sourceToDefaultSource(source: AuthoredControlSource | null | undefined): DefaultSource | undefined {
  if (!source) return undefined;
  return Object.freeze({
    blockType: source.blockType,
    output: source.outputPortId,
    ...(Object.keys(source.params).length > 0 ? { params: Object.freeze({ ...source.params }) } : {}),
  });
}

function defaultSourceToAuthoredSource(defaultSource: DefaultSource | undefined): AuthoredControlSource | null {
  if (!defaultSource) return null;
  return Object.freeze({
    id: 'source',
    blockType: defaultSource.blockType,
    outputPortId: defaultSource.output,
    params: Object.freeze({ ...(defaultSource.params ?? {}) }),
  });
}

function readInlineSourceValue(source: AuthoredControlSource | null | undefined): unknown {
  if (!source) return undefined;
  return getPreferredInlineSourceParam(source.blockType, source.params)?.value;
}

function buildAuthoredInputControl(blockId: BlockId, portId: string, source: AuthoredControlSource | null): AuthoredInputControl | undefined {
  return source
    ? Object.freeze({
        ownerId: `${blockId}:${portId}` as `${BlockId}:${PortId}`,
        source,
      })
    : undefined;
}

function migrateInputPortControl(
  blockId: BlockId,
  blockType: string,
  portId: string,
  port: InputPort,
  legacyParams: Readonly<Record<string, unknown>>,
): { port: InputPort; consumedParam: boolean } {
  const blockDef = getBlockDefinition(blockType);
  const inputDef = blockDef?.inputs[portId];
  if (!inputDef || inputDef.exposedAsPort === false) {
    return { port, consumedParam: false };
  }

  const legacyParamValue = legacyParams[portId];
  const existingSource = port.authoredControl?.source ?? null;
  const legacyDefaultSource = port.defaultSource;
  const seededSource = legacyDefaultSource
    ? defaultSourceToAuthoredSource(legacyDefaultSource)
    : inputDef.defaultSource
      ? defaultSourceToAuthoredSource(inputDef.defaultSource)
      : inputDef.defaultValue !== undefined
        ? constSource(inputDef.defaultValue)
        : null;
  const nextSource = legacyParamValue !== undefined
    ? constSource(legacyParamValue)
    : existingSource ?? seededSource;

  return {
    port: {
      ...port,
      authoredControl: buildAuthoredInputControl(blockId, portId, nextSource),
      defaultSource: undefined,
    },
    consumedParam: legacyParamValue !== undefined,
  };
}

function migrateBlockControlState(block: Block): Block {
  const blockDef = getBlockDefinition(block.type);
  if (!blockDef) return block;

  const migratedParams: Record<string, unknown> = {};
  const migratedInputPorts = new Map<string, InputPort>();
  const consumedPortParams = new Set<string>();

  for (const [portId, port] of block.inputPorts) {
    const migrated = migrateInputPortControl(block.id, block.type, portId, port, block.params);
    migratedInputPorts.set(portId, migrated.port);
    if (migrated.consumedParam) {
      consumedPortParams.add(portId);
    }
  }

  for (const [key, value] of Object.entries(block.params)) {
    const inputDef = blockDef.inputs[key];
    if (inputDef?.exposedAsPort !== false && consumedPortParams.has(key)) {
      continue;
    }
    migratedParams[key] = value;
  }

  return {
    ...block,
    params: migratedParams,
    inputPorts: migratedInputPorts.size > 0 ? migratedInputPorts : block.inputPorts,
  };
}

function cloneInputPort(inputPort: InputPort): InputPort {
  return Object.freeze({
    ...inputPort,
    authoredControl: cloneAuthoredInputControl(inputPort.authoredControl),
    defaultSource: cloneDefaultSource(inputPort.defaultSource),
    ...(inputPort.lenses ? { lenses: Object.freeze(inputPort.lenses.map(cloneLensAttachment)) } : {}),
  });
}

function cloneOutputPort(outputPort: OutputPort): OutputPort {
  return Object.freeze({
    ...outputPort,
    ...(outputPort.lenses ? { lenses: Object.freeze(outputPort.lenses.map(cloneLensAttachment)) } : {}),
  });
}

function cloneBlockRole(role: BlockRole): BlockRole {
  return Object.freeze({
    ...role,
    meta: Object.freeze({ ...role.meta }),
  }) as BlockRole;
}

function cloneBlockSnapshot(block: Block): Block {
  return Object.freeze({
    ...block,
    role: cloneBlockRole(block.role),
    params: Object.freeze({ ...block.params }),
    inputPorts: new Map(Array.from(block.inputPorts.entries(), ([portId, port]) => [portId, cloneInputPort(port)])),
    outputPorts: new Map(Array.from(block.outputPorts.entries(), ([portId, port]) => [portId, cloneOutputPort(port)])),
  });
}

function cloneEndpoint(endpoint: Endpoint): Endpoint {
  return Object.freeze({
    ...endpoint,
  });
}

function cloneEdgeRole(role: EdgeRole): EdgeRole {
  return Object.freeze({
    ...role,
    meta: Object.freeze({ ...role.meta }),
  }) as EdgeRole;
}

function cloneEdgeSnapshot(edge: Edge): Edge {
  return Object.freeze({
    ...edge,
    from: cloneEndpoint(edge.from),
    to: cloneEndpoint(edge.to),
    role: cloneEdgeRole(edge.role),
  });
}

function clonePatchData(patch: Patch): PatchData {
  return {
    // [LAW:one-source-of-truth] PatchStore owns canonical block objects; load/read
    // boundaries must clone external patch values instead of sharing mutable references.
    blocks: new Map(Array.from(patch.blocks.entries(), ([blockId, block]) => [blockId, cloneBlockSnapshot(migrateBlockControlState(block))])),
    edges: patch.edges.map(cloneEdgeSnapshot),
  };
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
      updateControlValue: action,
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
    const snapshot = clonePatchData({
      blocks: this._data.blocks,
      edges: this._data.edges,
    });

    // Freeze the snapshot shell to prevent accidental top-level mutations.
    // clonePatchData already clones/freeze block objects, params, and port entries;
    // the Maps remain mutable containers, so snapshot consumers must still treat
    // them as readonly by contract.
    Object.freeze(snapshot);
    Object.freeze(snapshot.edges);

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
      const providedControlValue = params[inputId];
      const seededSource = providedControlValue !== undefined
        ? constSource(providedControlValue)
        : inputDef.defaultSource
          ? defaultSourceToAuthoredSource(inputDef.defaultSource)
          : inputDef.defaultValue !== undefined
            ? constSource(inputDef.defaultValue)
            : null;
      inputPorts.set(inputId, {
        id: inputId,
        combineMode: 'last',
        ...(seededSource
          ? {
              authoredControl: buildAuthoredInputControl(id, inputId, seededSource),
            }
          : {}),
      });
    }

    // [LAW:one-source-of-truth] Exposed-input authored values are partitioned
    // onto the owning input port at creation instead of remaining in block.params.
    const mergedParams = { ...configDefaults };
    for (const [key, value] of Object.entries(params)) {
      const inputDef = blockDef.inputs[key];
      if (inputDef && inputDef.exposedAsPort !== false) continue;
      mergedParams[key] = value;
    }

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

    const blockDef = requireAnyBlockDef(block.type);
    const changedEntries = Object.entries(params).filter(([key, newValue]) => {
      const inputDef = blockDef.inputs[key];
      if (inputDef && inputDef.exposedAsPort !== false) {
        const currentSourceValue = readInlineSourceValue(block.inputPorts.get(key)?.authoredControl?.source);
        return currentSourceValue !== newValue;
      }
      return block.params[key] !== newValue;
    });
    if (changedEntries.length === 0) {
      return;
    }

    const mergedParams = { ...block.params };
    const updatedInputPorts: Map<string, InputPort> = new Map(block.inputPorts);
    let portsChanged = false;
    for (const [key, newValue] of changedEntries) {
      const inputDef = blockDef.inputs[key];
      if (inputDef && inputDef.exposedAsPort !== false) {
        const existingPort = updatedInputPorts.get(key) ?? { id: key, combineMode: 'last' as const };
        const nextSource = newValue === undefined ? null : constSource(newValue);
        portsChanged = true;
        updatedInputPorts.set(key, {
          ...existingPort,
          authoredControl: buildAuthoredInputControl(id, key, nextSource),
        });
        continue;
      }
      if (newValue === undefined) {
        delete mergedParams[key];
      } else {
        mergedParams[key] = newValue;
      }
    }

    // Remove any legacy exposed-port shadow params that may still be present.
    for (const [key, inputDef] of Object.entries(blockDef.inputs)) {
      if (inputDef.exposedAsPort !== false) {
        delete mergedParams[key];
      }
    }

    // Emit ParamChanged events before updating (capture old values)
    if (this.eventHub && this.getPatchRevision) {
      for (const [key, newValue] of changedEntries) {
        const inputDef = blockDef.inputs[key];
        const oldValue = inputDef && inputDef.exposedAsPort !== false
          ? readInlineSourceValue(block.inputPorts.get(key)?.authoredControl?.source)
          : block.params[key];
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
   * Update a semantic control target through the PatchStore mutation boundary.
   *
   * // [LAW:one-source-of-truth] Control edits route through one semantic API
   * // instead of each UI surface guessing the storage shape it happens to hit.
   */
  updateControlValue(target: ControlMutationTarget, value: unknown): void {
    switch (target.kind) {
      case 'blockParam': {
        this.updateBlockParams(target.blockId, { [target.paramId]: value });
        return;
      }
      case 'bindingLensParam': {
        this.updateLensParams(target.blockId, target.portId, target.lensId, { [target.paramId]: value });
        return;
      }
      case 'bindingSourceParam': {
        const block = this._data.blocks.get(target.blockId);
        if (!block) {
          throw new Error(`Block ${target.blockId} not found`);
        }
        const blockDef = requireAnyBlockDef(block.type);
        const inputDef = blockDef.inputs[target.portId];
        const effectiveDefault = sourceToDefaultSource(block.inputPorts.get(target.portId)?.authoredControl?.source)
          ?? block.inputPorts.get(target.portId)?.defaultSource
          ?? inputDef?.defaultSource
          ?? {
            blockType: target.sourceBlockType,
            output: target.sourceOutputPortId,
          };
        const nextDefault: DefaultSource = {
          blockType: target.sourceBlockType,
          output: target.sourceOutputPortId,
          params: {
            ...(effectiveDefault.params ?? {}),
            [target.paramId]: value,
          },
        };
        this.updateInputPort(target.blockId, target.portId, { defaultSource: nextDefault });
        return;
      }
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

    const normalizedUpdates: Partial<InputPort> = Object.prototype.hasOwnProperty.call(updates, 'combineMode')
      ? { ...updates, combineMode: canonicalizeCombineMode(updates.combineMode as CombineMode) }
      : updates;

    const blockDef = requireAnyBlockDef(block.type);
    const inputDef = blockDef.inputs[portId];
    const nextParams = { ...block.params };
    let updatedPort: InputPort = { ...port, ...normalizedUpdates };
    if (Object.prototype.hasOwnProperty.call(updates, 'defaultSource') && inputDef && inputDef.exposedAsPort !== false) {
      const nextDefault = updates.defaultSource;
      const nextAuthoredSource = nextDefault
        ? defaultSourceToAuthoredSource(nextDefault)
        : null;
      // [LAW:one-source-of-truth] Exposed-input source overrides live on the
      // canonical authored binding source regardless of which block type emits
      // the value; PatchStore does not split them across two fields.
      updatedPort = {
        ...updatedPort,
        authoredControl: buildAuthoredInputControl(blockId, portId, nextAuthoredSource),
        defaultSource: undefined,
      };
      delete nextParams[portId];
    }
    const updatedInputPorts = new Map(block.inputPorts);
    updatedInputPorts.set(portId, updatedPort);

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
    this.updateInputPort(blockId, portId, { combineMode: canonicalizeCombineMode(combineMode) });
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
    const effectiveDefault = sourceToDefaultSource(instancePort?.authoredControl?.source)
      ?? instancePort?.defaultSource
      ?? inputDef.defaultSource;
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
    const hasAnyValueChange = Object.entries(params).some(
      ([paramId, nextValue]) => previousLens.params?.[paramId] !== nextValue,
    );
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
    if (this._data.edges.some((edge) => samePortEndpoints(edge.from, from) && samePortEndpoints(edge.to, to))) {
      throw new Error(`Duplicate edge rejected: ${from.blockId}.${from.slotId} -> ${to.blockId}.${to.slotId}`);
    }
    const alias = deriveEdgeAlias(from, this._data.blocks, options?.alias);

    const id = `e${this._nextEdgeId++}`;
    const edge: Edge = {
      id,
      from,
      to,
      enabled: options?.enabled ?? true,
      sortKey: options?.sortKey ?? this._data.edges.length,
      role: options?.role ?? { kind: 'user', meta: {} as Record<string, never> },
      alias,
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
    const collectAlias = deriveEdgeAlias(from, this._data.blocks, alias);
    return this.addEdge(from, to, {
      role: { kind: 'collect', meta: { alias: collectAlias } },
      alias: collectAlias,
    });
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
    const current = this._data.edges[index];
    const nextFrom = updates.from ?? current.from;
    const nextTo = updates.to ?? current.to;

    if (this._data.edges.some((edge) => edge.id !== id && samePortEndpoints(edge.from, nextFrom) && samePortEndpoints(edge.to, nextTo))) {
      throw new Error(`Duplicate edge rejected: ${nextFrom.blockId}.${nextFrom.slotId} -> ${nextTo.blockId}.${nextTo.slotId}`);
    }
    const nextAlias = deriveEdgeAlias(nextFrom, this._data.blocks, updates.alias ?? current.alias);

    this._data.edges[index] = {
      ...current,
      ...updates,
      from: nextFrom,
      to: nextTo,
      alias: nextAlias,
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

    this._data = clonePatchData(patch);

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

}
