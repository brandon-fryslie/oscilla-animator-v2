/**
 * EdgeDecorator — the editor's neutral authority on an edge's transform chain.
 *
 * A value arriving at an input can be reshaped on the way in by an ordered chain
 * of parameterized transforms. Two eras realize this concept in completely
 * different machinery: V1 stores `LensAttachment` records ON the target input
 * port; the pillar model has no edge field at all and reconstructs the chain by
 * tracing backward through `'transform'`-category blocks. Yet the EDITOR-FACING
 * behavior is identical — an ordered list of transform steps decorating one edge,
 * each shown as a chip and each with editable params. That single behavior is one
 * seam; each era supplies a provider, and the mechanism difference becomes residue
 * inside the provider. [LAW:one-type-per-behavior] [FRAMING:representation]
 *
 * This is the sibling of TypeOracle (what a port MEANS) and BlockCatalog (what
 * could be ADDED): the decorator answers what an edge DOES to the value passing
 * through it. Like the oracle and the adapter it reads the live graph, so a
 * provider wraps the era's store and is constructed per editor mount, reached by
 * the ReactFlow-instantiated edge renderer through the GraphEditor context.
 * [LAW:decomposition] [LAW:one-way-deps]
 *
 * SCOPE — this seam owns exactly "describe an edge's chain, and retune a step's
 * params". Growing a chain (add / remove / reorder / palette) is a separate
 * concern owned by the scene-adapters epic; the edge inspector is owned by the
 * inspector-panels ticket; block-param-control neutrality by the typed-control
 * ticket. Fusing any of those here would make the part do more than one thing.
 * [LAW:composability]
 */

import type { UIControlHint } from '../../types';

// =============================================================================
// Neutral vocabulary
// =============================================================================

/**
 * A reference to one edge in the graph the editor is showing, addressed by its
 * endpoints rather than an era-specific edge id — the endpoints are what both a
 * V1 lens (keyed by target port + source address) and a pillar route (keyed by
 * the input slot it feeds) resolve against, so the neutral seam speaks the fact
 * both providers actually key on. [FRAMING:representation]
 */
export interface EdgeRef {
  readonly sourceBlockId: string;
  readonly sourcePortId: string;
  readonly targetBlockId: string;
  readonly targetPortId: string;
}

/**
 * One editable parameter of a decoration step, projected to the editor's neutral
 * control vocabulary — the same `UIControlHint` every other inline control in the
 * editor uses, so a decoration param and a block param render through identical
 * widgets. The provider reads the current value from its era's model; the editor
 * writes back through `EdgeDecorator.setParam`. [LAW:one-source-of-truth]
 */
export interface DecorationParam {
  /** Stable within the step; the id handed back to `setParam`. */
  readonly id: string;
  /** Display label for the control. */
  readonly label: string;
  /** Current value (number | boolean | string | …), read from the era's model. */
  readonly value: unknown;
  /** Widget hint; absent falls back to type-directed widget selection. */
  readonly hint?: UIControlHint;
}

/**
 * One transform step decorating an edge: its chip presentation plus the params
 * the in-place editor exposes. Self-describing — the editor paints the chip and
 * renders the param controls without knowing whether it came from a V1 lens or a
 * pillar transform block. [LAW:composability]
 */
export interface EdgeDecoration {
  /** Stable within the edge's chain; the id handed back to `setParam`. */
  readonly id: string;
  /** Chip text (e.g. the transform's name). */
  readonly label: string;
  /** Chip color (any CSS color string). */
  readonly color: string;
  /** Chip hover tooltip. */
  readonly tooltip: string;
  /** Editable params, in display order; empty for a param-less transform. */
  readonly params: readonly DecorationParam[];
}

// =============================================================================
// EdgeDecorator interface
// =============================================================================

/**
 * The editor-owned authority on one graph's edge transform chains. A provider
 * resolves each edge to its era's chain internally; the editor passes only
 * neutral endpoint refs and reads neutral steps. [LAW:one-way-deps]
 */
export interface EdgeDecorator {
  /**
   * The ordered transform chain decorating `edge`, source→target order, or an
   * empty list when the edge carries none. The whole read half — the chips and
   * the params both derive from this one call, so they can never disagree.
   * [LAW:one-source-of-truth]
   */
  decorations(edge: EdgeRef): readonly EdgeDecoration[];

  /**
   * Retune one param of one step on `edge`. The era-neutral write: the provider
   * routes it to its own store (V1 → `updateLensParams`, pillar → block config),
   * so the editor performs no era-specific mutation. [LAW:effects-at-boundaries]
   */
  setParam(edge: EdgeRef, decorationId: string, paramId: string, value: unknown): void;
}

// =============================================================================
// Empty provider
// =============================================================================

/**
 * The decorator for an editor surface with no transform-chain concept — today,
 * the composite editor, which edits a subgraph definition where value transforms
 * are not authored. Making "no decorations here" an explicit provider value keeps
 * it out of the edge renderer as a hidden `if (!decorator)` branch: the
 * variability lives in which decorator a mount supplies, not in whether the
 * renderer runs. [LAW:dataflow-not-control-flow] [LAW:no-silent-failure]
 */
export const noEdgeDecorator: EdgeDecorator = {
  decorations: () => [],
  setParam: () => {},
};
