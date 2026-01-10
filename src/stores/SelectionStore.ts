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
