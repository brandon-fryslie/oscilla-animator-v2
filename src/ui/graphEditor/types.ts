/**
 * GraphDataAdapter - Unified interface for graph data sources
 *
 * Enables the GraphEditorCore to work with different data stores
 * (PatchStore for the main V1 graph, CompositeEditorStore for the composite
 * editor, PillarPatchStore for the pillar/ScenePlan graph) through a single
 * unified interface.
 *
 * ARCHITECTURAL CONSTRAINT: this interface is the SEAM, and it speaks only the
 * editor's own neutral vocabulary — never any one backend's language. Each
 * provider (adapter) translates its era-specific model INTO these neutral,
 * presentation-ready facts; the editor renders them without knowing which
 * backend produced them. [FRAMING:representation] [LAW:one-way-deps]
 *
 * The only genuinely backend-neutral fact about a value is its TYPE (every era
 * has types). Everything else that used to leak across this seam
 * (default-source, provenance, lenses, combine-mode, inference binding) is
 * era-specific and is projected here into one of two presentation-ready shapes:
 * a decoration (something the editor paints) or a control (something the editor
 * edits). The provider pre-computes labels/colors/tooltips; the renderer is
 * pure. [LAW:effects-at-boundaries]
 */

import type { UIControlHint } from '../../types';
import type { ControlMutationTarget } from '../../types/control-target';

// =============================================================================
// Neutral presentation vocabulary
// =============================================================================

/**
 * Backend-neutral, presentation-ready description of a port's resolved type.
 *
 * A provider translates its era-specific type model (V1 CanonicalType, pillar
 * scene-port type, …) into this before it crosses the seam. Wiring legality is
 * a separate concern owned by the type-oracle seam; `compatibilityToken` here
 * is a display-only grouping key (two ports read as "the same type" iff their
 * tokens are equal).
 */
export interface PortTypeDisplay {
  /** Short label for the handle / inline display, e.g. "One<float>". */
  readonly label: string;
  /** Full hover tooltip text. */
  readonly tooltip: string;
  /** Handle / swatch color (any CSS color string). */
  readonly color: string;
  /** Opaque display-only wire-compatibility grouping token. */
  readonly compatibilityToken: string;
}

/**
 * A visual annotation the editor paints on a port — an indicator dot, a badge,
 * a warning glyph, or a transform chip. The provider decides what to show and
 * how it reads; the renderer only paints it. This is the single neutral shape
 * that V1 default-source dots, provenance badges/warnings, and lens/transform
 * chips all project into.
 */
export interface PortDecoration {
  readonly kind: PortDecorationKind;
  /** Text shown inside a badge/warning, or as a chip label. */
  readonly label?: string;
  /** Dot / badge color (any CSS color string). */
  readonly color?: string;
  /** Hover tooltip. */
  readonly tooltip?: string;
}

/**
 * `indicator` — a small colored dot beside the handle (e.g. "has a default").
 * `badge`     — a labeled square badge (e.g. an adapter marker).
 * `warning`   — a labeled square warning badge (e.g. unresolved).
 * `transform` — a chip describing an edge/port transform (e.g. a lens step).
 */
export type PortDecorationKind = 'indicator' | 'badge' | 'warning' | 'transform';

/**
 * An inline control the editor renders for a value — a param editor bound to a
 * mutation target. Era-neutral: the target names WHAT to mutate; the provider's
 * owning store performs it.
 */
export interface ParamData {
  readonly id: string;
  readonly label: string;
  readonly value: unknown;
  readonly hint?: UIControlHint;
  readonly target: ControlMutationTarget;
}

// =============================================================================
// Common Shape Types
// =============================================================================

/**
 * Minimal input-port information needed for rendering.
 * Self-describing: carries its own label, type display, decorations and inline
 * controls so the editor never has to consult a backend registry to render it.
 * [LAW:composability]
 */
export interface InputPortLike {
  readonly id: string;
  /** Display label for the port. */
  readonly label: string;
  /** Presentation-ready resolved type, when known. */
  readonly typeDisplay?: PortTypeDisplay;
  /** Visual annotations (default-source dot, provenance badge, transform chips). */
  readonly decorations?: readonly PortDecoration[];
  /** Inline param affordances shown when the port is unconnected. */
  readonly controls?: readonly ParamData[];
}

/**
 * Minimal output-port information needed for rendering.
 */
export interface OutputPortLike {
  readonly id: string;
  /** Display label for the port. */
  readonly label: string;
  /** Presentation-ready resolved type, when known. */
  readonly typeDisplay?: PortTypeDisplay;
}

/**
 * Minimal block information needed for rendering. Self-describing: an editor
 * can render this block and all its ports without consulting any backend
 * registry.
 */
export interface BlockLike {
  readonly id: string;
  /** Backend block-type identifier (registry key / discriminant). */
  readonly type: string;
  /** Human label for the block type (e.g. "Constant"). */
  readonly typeLabel: string;
  /** User-authored display name for this instance. */
  readonly displayName: string;
  /** Raw config/param values (kept for passthrough / comment text). */
  readonly params: Record<string, unknown>;
  readonly inputPorts: ReadonlyMap<string, InputPortLike>;
  readonly outputPorts: ReadonlyMap<string, OutputPortLike>;
  /** Block-level inline config controls (config-only params). */
  readonly controls: readonly ParamData[];
}

/**
 * Minimal edge information needed for rendering.
 * `decorations` carry any per-edge transform chips (V1 lenses, pillar transform
 * chains) as neutral annotations.
 */
export interface EdgeLike {
  readonly id: string;
  readonly sourceBlockId: string;
  readonly sourcePortId: string;
  readonly targetBlockId: string;
  readonly targetPortId: string;
  readonly decorations?: readonly PortDecoration[];
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
 * - PillarPatchStore uses plain string ids
 *
 * REACTIVITY: All getters must preserve MobX observability from underlying
 * stores. ReactFlow depends on observability to update when data changes.
 *
 * OPTIONAL METHODS: Methods marked with ? are only available for providers that
 * support that capability (e.g. the composite editor has restricted editing).
 */
export interface GraphDataAdapter<BlockIdT = string> {
  // -------------------------------------------------------------------------
  // Read Operations
  // -------------------------------------------------------------------------

  /**
   * Version number that changes when port data (types, decorations) changes
   * without structural block/edge changes. MobX reactions track this to detect
   * data-only updates. Returns 0 / undefined when not applicable.
   */
  readonly dataVersion?: number;

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
   * @param type - Block type (must be registered in the provider's registry)
   * @param position - Initial position in graph editor
   * @returns Generated block ID
   */
  addBlock(type: string, position: { x: number; y: number }): BlockIdT;

  /**
   * Remove a block from the graph. Connected edges are removed automatically.
   */
  removeBlock(id: BlockIdT): void;

  /**
   * Get the position of a block in the graph editor.
   * @returns Position or undefined if the block has no position set.
   */
  getBlockPosition(id: BlockIdT): { x: number; y: number } | undefined;

  /**
   * Set the position of a block in the graph editor.
   */
  setBlockPosition(id: BlockIdT, position: { x: number; y: number }): void;

  // -------------------------------------------------------------------------
  // Edge Operations
  // -------------------------------------------------------------------------

  /**
   * Add an edge connecting two blocks.
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
   */
  removeEdge(id: string): void;

  // -------------------------------------------------------------------------
  // Optional Operations
  // -------------------------------------------------------------------------

  /**
   * Update block config/param values by id. Only available for providers that
   * support instance param editing.
   */
  updateBlockParams?(id: BlockIdT, params: Record<string, unknown>): void;

  /**
   * Update block display name. Only available for providers that support it.
   * @returns Error message if validation fails.
   */
  updateBlockDisplayName?(id: BlockIdT, displayName: string): { error?: string };
}
