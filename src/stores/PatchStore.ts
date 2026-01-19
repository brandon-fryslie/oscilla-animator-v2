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
import type { Block, Edge, Endpoint, Patch, BlockType } from '../graph/Patch';
import type { BlockId, BlockRole, DefaultSource } from '../types';
import { emptyPatchData, type PatchData } from './internal';

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

export class PatchStore {
  // Private mutable state - THE source of truth
  private _data: PatchData;
  private _nextBlockId = 0;
  private _nextEdgeId = 0;

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
      updateBlockInputDefault: action,
      addEdge: action,
      removeEdge: action,
      updateEdge: action,
      loadPatch: action,
      clear: action,
    });
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
   * Returns the generated BlockId.
   */
  addBlock(
    type: BlockType,
    params: Record<string, unknown> = {},
    options?: BlockOptions
  ): BlockId {
    const id = `b${this._nextBlockId++}` as BlockId;

    const block: Block = {
      id,
      type,
      params,
      label: options?.label,
      displayName: options?.displayName ?? null,
      domainId: options?.domainId ?? null,
      role: options?.role ?? { kind: 'user', meta: {} },
    };

    this._data.blocks.set(id, block);
    return id;
  }

  /**
   * Removes a block from the patch.
   * Also removes all edges connected to this block.
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
   */
  updateBlockParams(
    id: BlockId,
    params: Partial<Record<string, unknown>>
  ): void {
    const block = this._data.blocks.get(id);
    if (!block) {
      throw new Error(`Block not found: ${id}`);
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
   * Updates or clears a per-instance input default.
   *
   * Set defaultSource to override the registry default for this input.
   * Set undefined to clear the override and use registry default.
   */
  updateBlockInputDefault(
    id: BlockId,
    inputId: string,
    defaultSource: DefaultSource | undefined
  ): void {
    const block = this._data.blocks.get(id);
    if (!block) {
      throw new Error(`Block not found: ${id}`);
    }

    // Create new defaults map
    const newDefaults = { ...block.inputDefaults };
    if (defaultSource) {
      newDefaults[inputId] = defaultSource;
    } else {
      delete newDefaults[inputId];
    }

    // Update block with new defaults (or undefined if empty)
    this._data.blocks.set(id, {
      ...block,
      inputDefaults: Object.keys(newDefaults).length > 0 ? newDefaults : undefined,
    });
  }

  /**
   * Adds an edge to the patch.
   * Returns the generated edge ID.
   */
  addEdge(from: Endpoint, to: Endpoint, options?: { enabled?: boolean; sortKey?: number }): string {
    const id = `e${this._nextEdgeId++}`;

    const edge: Edge = {
      id,
      from,
      to,
      enabled: options?.enabled ?? true,
      sortKey: options?.sortKey,
    };

    this._data.edges.push(edge);
    return id;
  }

  /**
   * Removes an edge from the patch.
   */
  removeEdge(id: string): void {
    this._data.edges = this._data.edges.filter((e) => e.id !== id);
  }

  /**
   * Updates edge properties.
   */
  updateEdge(
    id: string,
    updates: Partial<Pick<Edge, 'enabled' | 'sortKey'>>
  ): void {
    const edgeIndex = this._data.edges.findIndex((e) => e.id === id);
    if (edgeIndex === -1) {
      throw new Error(`Edge not found: ${id}`);
    }

    this._data.edges[edgeIndex] = {
      ...this._data.edges[edgeIndex],
      ...updates,
    };
  }

  /**
   * Replaces entire patch (for loading from file).
   */
  loadPatch(patch: Patch): void {
    this._data.blocks = new Map(patch.blocks);
    this._data.edges = [...patch.edges];

    // Update ID generators to avoid conflicts
    let maxBlockId = -1;
    let maxEdgeId = -1;

    for (const blockId of this._data.blocks.keys()) {
      const match = blockId.match(/^b(\d+)$/);
      if (match) {
        maxBlockId = Math.max(maxBlockId, parseInt(match[1], 10));
      }
    }

    for (const edge of this._data.edges) {
      const match = edge.id.match(/^e(\d+)$/);
      if (match) {
        maxEdgeId = Math.max(maxEdgeId, parseInt(match[1], 10));
      }
    }

    this._nextBlockId = maxBlockId + 1;
    this._nextEdgeId = maxEdgeId + 1;
  }

  /**
   * Clears all blocks and edges.
   */
  clear(): void {
    this._data = emptyPatchData();
    this._nextBlockId = 0;
    this._nextEdgeId = 0;
  }
}
