/**
 * GraphDataAdapter - Unified interface for graph data sources
 *
 * Enables the GraphEditorCore to work with different data stores
 * (PatchStore for main graph, CompositeEditorStore for composite editor)
 * through a single unified interface.
 *
 * ARCHITECTURAL CONSTRAINT: ONE TYPE PER BEHAVIOR
 * Both stores provide graph CRUD - they are instances of one type,
 * not distinct types. This adapter is that unified type.
 */

import type { CombineMode, DefaultSource } from '../../types';

// =============================================================================
// Common Shape Types
// =============================================================================

/**
 * Minimal port information needed for rendering.
 */
export interface InputPortLike {
  readonly id: string;
  readonly combineMode: CombineMode;
  readonly defaultSource?: DefaultSource;
}

/**
 * Minimal output port information needed for rendering.
 */
export interface OutputPortLike {
  readonly id: string;
}

/**
 * Minimal block information needed for rendering.
 * Store-agnostic - can be produced from either PatchStore or CompositeEditorStore data.
 */
export interface BlockLike {
  readonly id: string;
  readonly type: string;
  readonly displayName: string;
  readonly params: Record<string, unknown>;
  readonly inputPorts: ReadonlyMap<string, InputPortLike>;
  readonly outputPorts: ReadonlyMap<string, OutputPortLike>;
}

/**
 * Minimal edge information needed for rendering.
 * Store-agnostic - can be produced from either store's edge format.
 */
export interface EdgeLike {
  readonly id: string;
  readonly sourceBlockId: string;
  readonly sourcePortId: string;
  readonly targetBlockId: string;
  readonly targetPortId: string;
}

// =============================================================================
// GraphDataAdapter Interface
// =============================================================================

/**
 * Unified interface for graph data operations.
 *
 * Generic over BlockIdT to preserve type safety across different stores:
 * - PatchStore uses BlockId (branded string)
 * - CompositeEditorStore uses InternalBlockId (branded string)
 *
 * REACTIVITY: All getters must preserve MobX observability from underlying stores.
 * ReactFlow depends on observability to update when data changes.
 *
 * OPTIONAL METHODS: Methods marked with ? are only available for PatchStore
 * (main graph editing). Composite editor has restricted capabilities.
 */
export interface GraphDataAdapter<BlockIdT = string> {
  // -------------------------------------------------------------------------
  // Read Operations
  // -------------------------------------------------------------------------

  /**
   * All blocks in the graph.
   * MUST be MobX-observable so ReactFlow can react to changes.
   */
  readonly blocks: ReadonlyMap<BlockIdT, BlockLike>;

  /**
   * All edges in the graph.
   * MUST be MobX-observable so ReactFlow can react to changes.
   */
  readonly edges: readonly EdgeLike[];

  // -------------------------------------------------------------------------
  // Block Operations
  // -------------------------------------------------------------------------

  /**
   * Add a new block to the graph.
   *
   * @param type - Block type (must be registered in registry)
   * @param position - Initial position in graph editor
   * @returns Generated block ID
   */
  addBlock(type: string, position: { x: number; y: number }): BlockIdT;

  /**
   * Remove a block from the graph.
   * Connected edges are also removed automatically.
   *
   * @param id - Block ID to remove
   */
  removeBlock(id: BlockIdT): void;

  /**
   * Get the position of a block in the graph editor.
   *
   * @param id - Block ID
   * @returns Position or undefined if block has no position set
   */
  getBlockPosition(id: BlockIdT): { x: number; y: number } | undefined;

  /**
   * Set the position of a block in the graph editor.
   *
   * @param id - Block ID
   * @param position - New position
   */
  setBlockPosition(id: BlockIdT, position: { x: number; y: number }): void;

  // -------------------------------------------------------------------------
  // Edge Operations
  // -------------------------------------------------------------------------

  /**
   * Add an edge connecting two blocks.
   *
   * @param source - Source block ID
   * @param sourcePort - Source port ID
   * @param target - Target block ID
   * @param targetPort - Target port ID
   * @returns Generated edge ID
   */
  addEdge(
    source: BlockIdT,
    sourcePort: string,
    target: BlockIdT,
    targetPort: string
  ): string;

  /**
   * Remove an edge from the graph.
   *
   * @param id - Edge ID to remove
   */
  removeEdge(id: string): void;

  // -------------------------------------------------------------------------
  // Optional Operations (PatchStore only)
  // -------------------------------------------------------------------------

  /**
   * Update block parameters.
   * Only available for main patch editing (PatchStore).
   * Composite editor does not support runtime param editing.
   *
   * @param id - Block ID
   * @param params - Parameter updates (partial)
   */
  updateBlockParams?(id: BlockIdT, params: Record<string, unknown>): void;

  /**
   * Update block display name.
   * Only available for main patch editing (PatchStore).
   *
   * @param id - Block ID
   * @param displayName - New display name
   * @returns Error message if validation fails
   */
  updateBlockDisplayName?(id: BlockIdT, displayName: string): { error?: string };

  /**
   * Update input port properties.
   * Only available for main patch editing (PatchStore).
   *
   * @param blockId - Block ID
   * @param portId - Port ID
   * @param updates - Port property updates
   */
  updateInputPort?(
    blockId: BlockIdT,
    portId: string,
    updates: { defaultSource?: DefaultSource; combineMode?: CombineMode }
  ): void;

  /**
   * Update input port combine mode.
   * Only available for main patch editing (PatchStore).
   *
   * @param blockId - Block ID
   * @param portId - Port ID
   * @param mode - New combine mode
   */
  updateInputPortCombineMode?(blockId: BlockIdT, portId: string, mode: CombineMode): void;
}
