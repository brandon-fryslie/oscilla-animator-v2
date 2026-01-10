/**
 * SelectionStore - UI Selection State
 *
 * Stores selection state as IDs only, never duplicates block/edge data.
 * Derives actual blocks/edges from PatchStore via computed getters.
 *
 * Architectural invariants:
 * - Only stores IDs (not block/edge objects)
 * - Derives block/edge data via computed from PatchStore
 * - No data duplication
 */

import { makeObservable, observable, computed, action } from 'mobx';
import type { Block, Edge, PortRef } from '../graph/Patch';
import type { BlockId } from '../types';
import type { PatchStore } from './PatchStore';

export class SelectionStore {
  // Observable state - IDs only
  selectedBlockId: BlockId | null = null;
  selectedEdgeId: string | null = null;
  hoveredBlockId: BlockId | null = null;
  hoveredPortRef: PortRef | null = null;

  constructor(private patchStore: PatchStore) {
    makeObservable(this, {
      selectedBlockId: observable,
      selectedEdgeId: observable,
      hoveredBlockId: observable,
      hoveredPortRef: observable,
      selectedBlock: computed,
      selectedEdge: computed,
      hoveredBlock: computed,
      relatedBlockIds: computed,
      relatedEdgeIds: computed,
      highlightedBlockIds: computed,
      highlightedEdgeIds: computed,
      selectBlock: action,
      selectEdge: action,
      hoverBlock: action,
      hoverPort: action,
      clearSelection: action,
    });
  }

  // =============================================================================
  // Computed Getters - Derived from PatchStore
  // =============================================================================

  /**
   * Returns the selected block by deriving from PatchStore.
   * Returns undefined if no block is selected or block was deleted.
   */
  get selectedBlock(): Block | undefined {
    if (!this.selectedBlockId) return undefined;
    return this.patchStore.blocks.get(this.selectedBlockId);
  }

  /**
   * Returns the selected edge by deriving from PatchStore.
   * Returns undefined if no edge is selected or edge was deleted.
   */
  get selectedEdge(): Edge | undefined {
    if (!this.selectedEdgeId) return undefined;
    return this.patchStore.edges.find((e) => e.id === this.selectedEdgeId);
  }

  /**
   * Returns the hovered block by deriving from PatchStore.
   * Returns undefined if no block is hovered or block was deleted.
   */
  get hoveredBlock(): Block | undefined {
    if (!this.hoveredBlockId) return undefined;
    return this.patchStore.blocks.get(this.hoveredBlockId);
  }

  /**
   * Returns block IDs directly connected to the selected block.
   * Includes both upstream (blocks pointing to selected) and downstream (blocks selected points to).
   * Returns empty set if no block is selected.
   */
  get relatedBlockIds(): ReadonlySet<BlockId> {
    if (!this.selectedBlockId) return new Set();

    const related = new Set<BlockId>();
    const edges = this.patchStore.edges;

    for (const edge of edges) {
      // Upstream: edges pointing TO the selected block
      if (edge.to.blockId === this.selectedBlockId && edge.from.blockId !== this.selectedBlockId) {
        related.add(edge.from.blockId as BlockId);
      }

      // Downstream: edges pointing FROM the selected block
      if (edge.from.blockId === this.selectedBlockId && edge.to.blockId !== this.selectedBlockId) {
        related.add(edge.to.blockId as BlockId);
      }
    }

    return related;
  }

  /**
   * Returns edge IDs involving the selected block.
   * Includes edges where the selected block is either the source or target.
   * Returns empty set if no block is selected.
   */
  get relatedEdgeIds(): ReadonlySet<string> {
    if (!this.selectedBlockId) return new Set();

    const related = new Set<string>();
    const edges = this.patchStore.edges;

    for (const edge of edges) {
      if (edge.from.blockId === this.selectedBlockId || edge.to.blockId === this.selectedBlockId) {
        related.add(edge.id);
      }
    }

    return related;
  }

  /**
   * Returns all block IDs that should be highlighted.
   * Includes selected block + all directly connected blocks.
   */
  get highlightedBlockIds(): ReadonlySet<BlockId> {
    const highlighted = new Set<BlockId>();

    if (this.selectedBlockId) {
      highlighted.add(this.selectedBlockId);
    }

    // Add all related blocks
    for (const id of this.relatedBlockIds) {
      highlighted.add(id);
    }

    return highlighted;
  }

  /**
   * Returns all edge IDs that should be highlighted.
   * Includes edges connected to the selected block.
   */
  get highlightedEdgeIds(): ReadonlySet<string> {
    return this.relatedEdgeIds;
  }

  // =============================================================================
  // Actions - Mutations
  // =============================================================================

  /**
   * Selects a block by ID.
   * Clears edge selection.
   */
  selectBlock(id: BlockId | null): void {
    this.selectedBlockId = id;
    this.selectedEdgeId = null;
  }

  /**
   * Selects an edge by ID.
   * Clears block selection.
   */
  selectEdge(id: string | null): void {
    this.selectedEdgeId = id;
    this.selectedBlockId = null;
  }

  /**
   * Sets the hovered block.
   */
  hoverBlock(id: BlockId | null): void {
    this.hoveredBlockId = id;
  }

  /**
   * Sets the hovered port.
   */
  hoverPort(ref: PortRef | null): void {
    this.hoveredPortRef = ref;
  }

  /**
   * Clears all selection state.
   */
  clearSelection(): void {
    this.selectedBlockId = null;
    this.selectedEdgeId = null;
    this.hoveredBlockId = null;
    this.hoveredPortRef = null;
  }
}
