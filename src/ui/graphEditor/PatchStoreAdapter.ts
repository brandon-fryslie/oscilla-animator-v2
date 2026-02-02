/**
 * PatchStoreAdapter - Adapter for main patch graph editing
 *
 * Wraps PatchStore + LayoutStore to implement GraphDataAdapter.
 * This is a thin wrapper that preserves all existing behavior:
 * - MobX reactivity from PatchStore
 * - Event emission (BlockAdded, EdgeRemoved, etc.)
 * - Position persistence to LayoutStore
 *
 * ARCHITECTURAL: This adapter does NOT duplicate logic.
 * It delegates all operations to the underlying stores.
 */

import { makeObservable, computed } from 'mobx';
import type { BlockId, CombineMode, DefaultSource, PortId } from '../../types';
import { portId } from '../../types';
import type { PatchStore } from '../../stores/PatchStore';
import type { LayoutStore } from '../../stores/LayoutStore';
import type { InputPort, OutputPort } from '../../graph/Patch';
import type {
  GraphDataAdapter,
  BlockLike,
  EdgeLike,
  InputPortLike,
  OutputPortLike,
} from './types';

/**
 * Adapter that exposes PatchStore + LayoutStore through GraphDataAdapter interface.
 */
export class PatchStoreAdapter implements GraphDataAdapter<BlockId> {
  constructor(
    private readonly patchStore: PatchStore,
    private readonly layoutStore: LayoutStore
  ) {
    makeObservable(this, {
      blocks: computed,
      edges: computed,
    });
  }

  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  /**
   * Returns all blocks as BlockLike.
   * PERFORMANCE: Uses MobX computed to cache the transformation.
   * The underlying patchStore.blocks is already observable.
   */
  get blocks(): ReadonlyMap<BlockId, BlockLike> {
    // Transform PatchStore blocks to BlockLike
    // We create a new Map here, but MobX computed will cache it
    const blockMap = new Map<BlockId, BlockLike>();

    for (const [id, block] of this.patchStore.blocks) {
      blockMap.set(id, {
        id,
        type: block.type,
        displayName: block.displayName,
        params: block.params as Record<string, unknown>,
        inputPorts: this.transformInputPorts(block.inputPorts),
        outputPorts: this.transformOutputPorts(block.outputPorts),
      });
    }

    return blockMap;
  }

  /**
   * Returns all edges as EdgeLike.
   * PERFORMANCE: Uses MobX computed to cache the transformation.
   */
  get edges(): readonly EdgeLike[] {
    return this.patchStore.edges.map((edge) => ({
      id: edge.id,
      sourceBlockId: edge.from.blockId,
      sourcePortId: edge.from.slotId,
      targetBlockId: edge.to.blockId,
      targetPortId: edge.to.slotId,
    }));
  }

  // ---------------------------------------------------------------------------
  // Block Operations
  // ---------------------------------------------------------------------------

  /**
   * Add a new block at the specified position.
   * Delegates to PatchStore for block creation, LayoutStore for position.
   */
  addBlock(type: string, position: { x: number; y: number }): BlockId {
    // PatchStore handles block creation and event emission
    const blockId = this.patchStore.addBlock(type, {});

    // LayoutStore handles position persistence
    this.layoutStore.setPosition(blockId, position);

    return blockId;
  }

  /**
   * Remove a block and its connected edges.
   * Delegates to PatchStore (handles edge removal) and LayoutStore.
   */
  removeBlock(id: BlockId): void {
    // PatchStore removes the block and all connected edges
    this.patchStore.removeBlock(id);

    // LayoutStore removes the position
    this.layoutStore.removePosition(id);
  }

  /**
   * Get block position from LayoutStore.
   */
  getBlockPosition(id: BlockId): { x: number; y: number } | undefined {
    return this.layoutStore.getPosition(id);
  }

  /**
   * Set block position in LayoutStore.
   */
  setBlockPosition(id: BlockId, position: { x: number; y: number }): void {
    this.layoutStore.setPosition(id, position);
  }

  // ---------------------------------------------------------------------------
  // Edge Operations
  // ---------------------------------------------------------------------------

  /**
   * Add an edge connecting two ports.
   * Delegates to PatchStore.
   */
  addEdge(
    source: BlockId,
    sourcePort: string,
    target: BlockId,
    targetPort: string
  ): string {
    return this.patchStore.addEdge(
      { kind: 'port', blockId: source, slotId: sourcePort },
      { kind: 'port', blockId: target, slotId: targetPort }
    );
  }

  /**
   * Remove an edge.
   * Delegates to PatchStore.
   */
  removeEdge(id: string): void {
    this.patchStore.removeEdge(id);
  }

  // ---------------------------------------------------------------------------
  // Optional Operations (PatchStore-specific)
  // ---------------------------------------------------------------------------

  /**
   * Update block parameters.
   * Delegates to PatchStore (emits ParamChanged events).
   */
  updateBlockParams(id: BlockId, params: Record<string, unknown>): void {
    this.patchStore.updateBlockParams(id, params);
  }

  /**
   * Update block display name.
   * Delegates to PatchStore (validates uniqueness).
   */
  updateBlockDisplayName(id: BlockId, displayName: string): { error?: string } {
    return this.patchStore.updateBlockDisplayName(id, displayName);
  }

  /**
   * Update input port properties.
   * Delegates to PatchStore.
   */
  updateInputPort(
    blockId: BlockId,
    portIdStr: string,
    updates: { defaultSource?: DefaultSource; combineMode?: CombineMode }
  ): void {
    this.patchStore.updateInputPort(blockId, portId(portIdStr), updates);
  }

  /**
   * Update input port combine mode.
   * Delegates to PatchStore.
   */
  updateInputPortCombineMode(blockId: BlockId, portIdStr: string, mode: CombineMode): void {
    this.patchStore.updateInputPortCombineMode(blockId, portId(portIdStr), mode);
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /**
   * Transform InputPort map to InputPortLike map.
   * Extracts only the properties needed for rendering.
   */
  private transformInputPorts(
    ports: ReadonlyMap<string, InputPort>
  ): ReadonlyMap<string, InputPortLike> {
    const portMap = new Map<string, InputPortLike>();

    for (const [id, port] of ports) {
      portMap.set(id, {
        id: port.id,
        combineMode: port.combineMode,
        defaultSource: port.defaultSource,
        lenses: port.lenses,
      });
    }

    return portMap;
  }

  /**
   * Transform OutputPort map to OutputPortLike map.
   * Extracts only the properties needed for rendering.
   */
  private transformOutputPorts(
    ports: ReadonlyMap<string, OutputPort>
  ): ReadonlyMap<string, OutputPortLike> {
    const portMap = new Map<string, OutputPortLike>();

    for (const [id, port] of ports) {
      portMap.set(id, {
        id: port.id,
      });
    }

    return portMap;
  }
}
