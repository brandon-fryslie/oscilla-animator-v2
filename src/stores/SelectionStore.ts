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
 *
 * Event Integration:
 * - Subscribes to BlockRemoved events to clear selection if removed block was selected
 * - Subscribes to EdgeRemoved events to clear selection if removed edge was selected
 */

import { makeObservable, observable, computed, action } from 'mobx';
import type { Block, Edge, PortRef } from '../graph/Patch';
import type { BlockId, PortId } from '../types';
import type { PatchStore } from './PatchStore';
import type { EventHub } from '../events/EventHub';
import type { SelectionTarget, HoverTarget } from '../events/types';

export class SelectionStore {
  // Observable state - IDs only
  selectedBlockId: BlockId | null = null;
  selectedEdgeId: string | null = null;
  selectedPort: PortRef | null = null;
  hoveredBlockId: BlockId | null = null;
  hoveredPortRef: PortRef | null = null;

  // Block type preview mode (for library preview)
  previewType: string | null = null;

  // Event hub for emitting selection/hover events
  // Set via setEventHub() after construction (due to circular dependency with RootStore)
  private eventHub: EventHub | null = null;
  private patchId: string = 'patch-0';
  private getPatchRevision: (() => number) | null = null;

  // Event subscriptions for cleanup
  private unsubscribers: Array<() => void> = [];

  constructor(private patchStore: PatchStore) {
    makeObservable(this, {
      selectedBlockId: observable,
      selectedEdgeId: observable,
      selectedPort: observable,
      hoveredBlockId: observable,
      hoveredPortRef: observable,
      previewType: observable,
      selectedBlock: computed,
      selectedEdge: computed,
      hoveredBlock: computed,
      relatedBlockIds: computed,
      relatedEdgeIds: computed,
      highlightedBlockIds: computed,
      highlightedEdgeIds: computed,
      selectBlock: action,
      selectEdge: action,
      selectPort: action,
      clearPortSelection: action,
      hoverBlock: action,
      hoverPort: action,
      clearSelection: action,
      setPreviewType: action,
      clearPreview: action,
      handleBlockRemoved: action,
      handleEdgeRemoved: action,
    });
  }

  /**
   * Sets up event subscriptions for automatic selection cleanup and enables event emission.
   * Call this after EventHub is available (typically in RootStore setup).
   */
  setEventHub(
    eventHub: EventHub,
    patchId: string,
    getPatchRevision: () => number
  ): void {
    this.eventHub = eventHub;
    this.patchId = patchId;
    this.getPatchRevision = getPatchRevision;

    // Subscribe to BlockRemoved to clear selection if removed block was selected
    this.unsubscribers.push(
      eventHub.on('BlockRemoved', (event) => {
        this.handleBlockRemoved(event.blockId);
      })
    );

    // Subscribe to EdgeRemoved to clear selection if removed edge was selected
    this.unsubscribers.push(
      eventHub.on('EdgeRemoved', (event) => {
        this.handleEdgeRemoved(event.edgeId);
      })
    );
  }

  /**
   * Handles BlockRemoved event - clears selection if the removed block was selected.
   */
  handleBlockRemoved(blockId: string): void {
    if (this.selectedBlockId === blockId) {
      this.selectedBlockId = null;
    }
    if (this.hoveredBlockId === blockId) {
      this.hoveredBlockId = null;
    }
    if (this.selectedPort?.blockId === blockId) {
      this.selectedPort = null;
    }
    if (this.hoveredPortRef?.blockId === blockId) {
      this.hoveredPortRef = null;
    }
  }

  /**
   * Handles EdgeRemoved event - clears selection if the removed edge was selected.
   */
  handleEdgeRemoved(edgeId: string): void {
    if (this.selectedEdgeId === edgeId) {
      this.selectedEdgeId = null;
    }
  }

  /**
   * Cleanup event subscriptions.
   */
  dispose(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
  }

  // =============================================================================
  // Private Helpers - Convert state to event types
  // =============================================================================

  /**
   * Converts current selection state to SelectionTarget for events.
   */
  private getCurrentSelectionTarget(): SelectionTarget {
    if (this.selectedBlockId) {
      return { type: 'block', blockId: this.selectedBlockId };
    }
    if (this.selectedEdgeId) {
      return { type: 'edge', edgeId: this.selectedEdgeId };
    }
    if (this.selectedPort) {
      return {
        type: 'port',
        blockId: this.selectedPort.blockId,
        portKey: this.selectedPort.portId,
      };
    }
    return { type: 'none' };
  }

  /**
   * Converts current hover state to HoverTarget for events.
   */
  private getCurrentHoverTarget(): HoverTarget {
    if (this.hoveredPortRef) {
      // Port takes precedence over block
      // Determine if port is input by checking if it exists in inputPorts
      const portKey = this.hoveredPortRef.portId;
      const block = this.patchStore.blocks.get(this.hoveredPortRef.blockId);
      const isInput = block ? block.inputPorts.has(portKey) : false;
      return {
        type: 'port',
        blockId: this.hoveredPortRef.blockId,
        portKey,
        isInput,
      };
    }
    if (this.hoveredBlockId) {
      return { type: 'block', blockId: this.hoveredBlockId };
    }
    return null;
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
   * Clears edge, port selection, and preview mode.
   */
  selectBlock(id: BlockId | null): void {
    // Capture previous selection before mutation
    const previousSelection = this.getCurrentSelectionTarget();

    this.selectedBlockId = id;
    this.selectedEdgeId = null;
    this.selectedPort = null;
    this.previewType = null;

    // Emit SelectionChanged event
    if (this.eventHub && this.getPatchRevision) {
      const currentSelection = this.getCurrentSelectionTarget();
      this.eventHub.emit({
        type: 'SelectionChanged',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision(),
        selection: currentSelection,
        previousSelection,
      });
    }
  }

  /**
   * Selects an edge by ID.
   * Clears block, port selection, and preview mode.
   */
  selectEdge(id: string | null): void {
    // Capture previous selection before mutation
    const previousSelection = this.getCurrentSelectionTarget();

    this.selectedEdgeId = id;
    this.selectedBlockId = null;
    this.selectedPort = null;
    this.previewType = null;

    // Emit SelectionChanged event
    if (this.eventHub && this.getPatchRevision) {
      const currentSelection = this.getCurrentSelectionTarget();
      this.eventHub.emit({
        type: 'SelectionChanged',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision(),
        selection: currentSelection,
        previousSelection,
      });
    }
  }

  /**
   * Selects a port by reference.
   * Clears block, edge selection, and preview mode.
   */
  selectPort(blockId: BlockId, portId: PortId): void {
    // Capture previous selection before mutation
    const previousSelection = this.getCurrentSelectionTarget();

    this.selectedPort = { blockId, portId };
    this.selectedBlockId = null;
    this.selectedEdgeId = null;
    this.previewType = null;

    // Emit SelectionChanged event
    if (this.eventHub && this.getPatchRevision) {
      const currentSelection = this.getCurrentSelectionTarget();
      this.eventHub.emit({
        type: 'SelectionChanged',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision(),
        selection: currentSelection,
        previousSelection,
      });
    }
  }

  /**
   * Clears port selection only.
   */
  clearPortSelection(): void {
    this.selectedPort = null;
  }

  /**
   * Sets the hovered block.
   */
  hoverBlock(id: BlockId | null): void {
    this.hoveredBlockId = id;

    // Emit HoverChanged event
    if (this.eventHub && this.getPatchRevision) {
      this.eventHub.emit({
        type: 'HoverChanged',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision(),
        hovered: this.getCurrentHoverTarget(),
      });
    }
  }

  /**
   * Sets the hovered port.
   */
  hoverPort(ref: PortRef | null): void {
    this.hoveredPortRef = ref;

    // Emit HoverChanged event
    if (this.eventHub && this.getPatchRevision) {
      this.eventHub.emit({
        type: 'HoverChanged',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision(),
        hovered: this.getCurrentHoverTarget(),
      });
    }
  }

  /**
   * Clears all selection state including preview.
   */
  clearSelection(): void {
    // Capture previous selection before mutation
    const previousSelection = this.getCurrentSelectionTarget();

    this.selectedBlockId = null;
    this.selectedEdgeId = null;
    this.selectedPort = null;
    this.hoveredBlockId = null;
    this.hoveredPortRef = null;
    this.previewType = null;

    // Emit SelectionChanged event
    if (this.eventHub && this.getPatchRevision) {
      this.eventHub.emit({
        type: 'SelectionChanged',
        patchId: this.patchId,
        patchRevision: this.getPatchRevision(),
        selection: { type: 'none' },
        previousSelection,
      });
    }
  }

  /**
   * Sets preview mode for a block type.
   * Clears block, edge, and port selection.
   */
  setPreviewType(type: string | null): void {
    this.previewType = type;
    this.selectedBlockId = null;
    this.selectedEdgeId = null;
    this.selectedPort = null;
  }

  /**
   * Clears preview mode without affecting selection.
   */
  clearPreview(): void {
    this.previewType = null;
  }
}
