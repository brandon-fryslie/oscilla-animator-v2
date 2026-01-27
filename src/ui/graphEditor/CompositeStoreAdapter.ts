/**
 * CompositeStoreAdapter - Adapter for composite block internal graph editing
 *
 * Wraps CompositeEditorStore to implement GraphDataAdapter.
 * Key differences from PatchStoreAdapter:
 * - Positions are stored inline in InternalBlockState (not separate LayoutStore)
 * - Edge storage uses InternalEdge array format (no explicit IDs)
 * - No optional param/displayName editing (restricted capabilities)
 *
 * EDGE ID GENERATION:
 * CompositeEditorStore edges don't have IDs - they're identified by
 * (fromBlock, fromPort, toBlock, toPort) tuples. This adapter generates
 * synthetic IDs for ReactFlow compatibility and parses them back for removal.
 */

import { makeObservable, computed } from 'mobx';
import type { InternalBlockId, InternalEdge } from '../../blocks/composite-types';
import type { CompositeEditorStore } from '../../stores/CompositeEditorStore';
import { getBlockDefinition } from '../../blocks/registry';
import type { BlockDef } from '../../blocks/registry';
import type {
  GraphDataAdapter,
  BlockLike,
  EdgeLike,
  InputPortLike,
  OutputPortLike,
} from './types';

/**
 * Adapter that exposes CompositeEditorStore through GraphDataAdapter interface.
 */
export class CompositeStoreAdapter implements GraphDataAdapter<InternalBlockId> {
  constructor(private readonly store: CompositeEditorStore) {
    makeObservable(this, {
      blocks: computed,
      edges: computed,
    });
  }

  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  /**
   * Returns all internal blocks as BlockLike.
   * PERFORMANCE: Uses MobX computed to cache the transformation.
   */
  get blocks(): ReadonlyMap<InternalBlockId, BlockLike> {
    const blockMap = new Map<InternalBlockId, BlockLike>();

    for (const [id, blockState] of this.store.internalBlocks) {
      const blockDef = getBlockDefinition(blockState.type);
      if (!blockDef) {
        // Skip blocks with missing definitions (shouldn't happen in normal use)
        continue;
      }

      // Transform InternalBlockState to BlockLike
      blockMap.set(id, {
        id,
        type: blockState.type,
        displayName: blockState.displayName || blockDef.label,
        params: blockState.params || {},
        inputPorts: this.getInputPortsForBlock(blockDef),
        outputPorts: this.getOutputPortsForBlock(blockDef),
      });
    }

    return blockMap;
  }

  /**
   * Returns all internal edges as EdgeLike.
   * Generates synthetic IDs from edge tuples.
   * PERFORMANCE: Uses MobX computed to cache the transformation.
   */
  get edges(): readonly EdgeLike[] {
    return this.store.internalEdges.map((edge) => ({
      id: this.generateEdgeId(edge),
      sourceBlockId: edge.fromBlock,
      sourcePortId: edge.fromPort,
      targetBlockId: edge.toBlock,
      targetPortId: edge.toPort,
    }));
  }

  // ---------------------------------------------------------------------------
  // Block Operations
  // ---------------------------------------------------------------------------

  /**
   * Add a new internal block at the specified position.
   * Position is stored inline with the block (unlike PatchStore).
   */
  addBlock(type: string, position: { x: number; y: number }): InternalBlockId {
    return this.store.addBlock(type, position);
  }

  /**
   * Remove an internal block and its connected edges.
   * CompositeEditorStore handles edge cleanup automatically.
   */
  removeBlock(id: InternalBlockId): void {
    this.store.removeBlock(id);
  }

  /**
   * Get block position from InternalBlockState.
   * Position is stored inline (not in separate LayoutStore).
   */
  getBlockPosition(id: InternalBlockId): { x: number; y: number } | undefined {
    const blockState = this.store.internalBlocks.get(id);
    return blockState?.position;
  }

  /**
   * Set block position via CompositeEditorStore.
   * Updates InternalBlockState.position.
   */
  setBlockPosition(id: InternalBlockId, position: { x: number; y: number }): void {
    this.store.updateBlockPosition(id, position);
  }

  // ---------------------------------------------------------------------------
  // Edge Operations
  // ---------------------------------------------------------------------------

  /**
   * Add an edge connecting two internal blocks.
   * Converts to InternalEdge format for CompositeEditorStore.
   */
  addEdge(
    source: InternalBlockId,
    sourcePort: string,
    target: InternalBlockId,
    targetPort: string
  ): string {
    const edge: InternalEdge = {
      fromBlock: source,
      fromPort: sourcePort,
      toBlock: target,
      toPort: targetPort,
    };

    this.store.addEdge(edge);

    // Return the synthetic ID that would be generated for this edge
    return this.generateEdgeId(edge);
  }

  /**
   * Remove an edge by parsing its synthetic ID back to the 4-tuple.
   * Edge ID format: "edge-{fromBlock}-{fromPort}-{toBlock}-{toPort}"
   */
  removeEdge(id: string): void {
    const parsed = this.parseEdgeId(id);
    if (parsed) {
      this.store.removeEdge(parsed.fromBlock, parsed.fromPort, parsed.toBlock, parsed.toPort);
    }
  }

  // ---------------------------------------------------------------------------
  // Optional Operations (Not Supported)
  // ---------------------------------------------------------------------------

  // Composite editor does not support runtime param editing
  // These methods are intentionally omitted (optional in interface)

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /**
   * Generate a deterministic synthetic edge ID from the 4-tuple.
   * This matches the pattern used in CompositeInternalGraph.tsx.
   *
   * Format: "edge-{fromBlock}-{fromPort}-{toBlock}-{toPort}"
   */
  private generateEdgeId(edge: InternalEdge): string {
    return `edge-${edge.fromBlock}-${edge.fromPort}-${edge.toBlock}-${edge.toPort}`;
  }

  /**
   * Parse a synthetic edge ID back to the 4-tuple.
   * Returns null if the ID format is invalid.
   */
  private parseEdgeId(
    id: string
  ): { fromBlock: InternalBlockId; fromPort: string; toBlock: InternalBlockId; toPort: string } | null {
    // Format: "edge-{fromBlock}-{fromPort}-{toBlock}-{toPort}"
    const parts = id.split('-');

    if (parts.length < 5 || parts[0] !== 'edge') {
      return null;
    }

    // Reconstruct the parts (handles IDs/ports with dashes)
    // Find indices: edge-{fromBlock}-{fromPort}-{toBlock}-{toPort}
    // This is a simplified parser - assumes no dashes in IDs/ports
    // If IDs/ports can contain dashes, a more robust parser is needed

    // For now, assume simple structure (no dashes in parts)
    const fromBlock = parts[1] as InternalBlockId;
    const fromPort = parts[2];
    const toBlock = parts[3] as InternalBlockId;
    const toPort = parts[4];

    return { fromBlock, fromPort, toBlock, toPort };
  }

  /**
   * Get input ports for a block from its definition.
   * CompositeEditorStore doesn't store per-instance port overrides,
   * so we derive ports from the registry definition with default combineMode.
   */
  private getInputPortsForBlock(blockDef: BlockDef): ReadonlyMap<string, InputPortLike> {
    const portMap = new Map<string, InputPortLike>();

    for (const [id, inputDef] of Object.entries(blockDef.inputs)) {
      portMap.set(id, {
        id,
        // Default combineMode to 'last' (matches PatchStore behavior for new blocks)
        combineMode: 'last' as const,
        defaultSource: inputDef.defaultSource,
      });
    }

    return portMap;
  }

  /**
   * Get output ports for a block from its definition.
   */
  private getOutputPortsForBlock(blockDef: BlockDef): ReadonlyMap<string, OutputPortLike> {
    const portMap = new Map<string, OutputPortLike>();

    for (const portId of Object.keys(blockDef.outputs)) {
      portMap.set(portId, {
        id: portId,
      });
    }

    return portMap;
  }
}
