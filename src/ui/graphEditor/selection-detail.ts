/**
 * SelectionDetail — the editor's neutral authority on inspector-facing facts.
 *
 * An inspector is a projection of the current selection over the graph model: for
 * a selected block it shows identity, ports (with resolved types + how each is
 * fed), and editable config; for a selected edge it shows endpoints and the
 * transform chain; for a selected port it shows the port's own detail. Two eras
 * realize that model with utterly different machinery — V1 reads `PatchStore` +
 * `FrontendResultStore` (provenance chains, default sources, combine modes,
 * lenses); the pillar model reads `PillarPatchStore` + the scene registry (config
 * fields, traced transform routes). Yet the EDITOR-FACING facts are one shape: a
 * self-describing detail the inspector paints without knowing which backend
 * produced it. That single behavior is one seam; each era supplies a provider, and
 * the machinery difference becomes residue inside the provider.
 * [LAW:one-type-per-behavior] [FRAMING:representation]
 *
 * This is the sibling of GraphDataAdapter (what is IN the graph), TypeOracle (what
 * ports MEAN) and EdgeDecorator (what an edge DOES): SelectionDetail answers what
 * the CURRENTLY-SELECTED thing IS, in full. Like the oracle and decorator it reads
 * the live graph, so a provider wraps the era's store; unlike the canvas seams it
 * is consumed by dockview inspector PANELS, not by GraphEditorCore's children, so
 * it is provided by a boot-level React context (SelectionDetailContext), the way
 * BlockCatalog is — not through GraphEditorContext. [LAW:decomposition] [LAW:one-way-deps]
 *
 * CAPABILITY SUPERSET. The vocabulary below is a superset of neutral facts and
 * commands. A provider fills what its era supports and leaves the rest ABSENT — an
 * optional field omitted, never a fabricated default. So the V1 provider surfaces
 * combine mode / default source / lens growth (V1 has them); the scene provider
 * omits those and surfaces config + traced routes (the pillar equivalent). The
 * inspector renders whatever is present, so a pillar block never shows a V1-only
 * section reading a lie, and a V1 block loses nothing. [LAW:no-silent-failure]
 *
 * READS return presentation-ready facts (labels/colors/options pre-computed);
 * WRITES are neutral commands the provider routes to its own store. The pure core
 * (this file) names the facts and commands; the effect happens at the provider
 * boundary. [LAW:effects-at-boundaries]
 */

import type { UIControlHint } from '../../types';
import type { ControlMutationTarget } from '../../types/control-target';
import type { PortTypeDisplay } from './types';
import type { EdgeRef } from './edge-decorations';
import type { PortRef, PortDirection } from './type-oracle';

export type { EdgeRef, PortRef, PortDirection };

// =============================================================================
// Neutral vocabulary — shared
// =============================================================================

/** One option in a neutral select control (block-type, output-port, combine-mode). */
export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

/**
 * A neutral inline control bound to a mutation target — identical shape to the
 * editor's other inline controls (`ParamData`), so a config field, a binding
 * control and a default-value editor all render through one widget and write back
 * through one `applyControl`. [LAW:one-source-of-truth]
 */
export interface DetailControl {
  readonly id: string;
  readonly label: string;
  readonly value: unknown;
  readonly hint?: UIControlHint;
  readonly target: ControlMutationTarget;
}

/**
 * A connection endpoint (a block's port) with the facts an inspector paints: the
 * block's display label and, when the era resolves it, the port's neutral type.
 */
export interface EndpointDetail {
  readonly blockId: string;
  readonly portId: string;
  /** Block display name (falls back to type / id). */
  readonly blockLabel: string;
  /** Resolved neutral type, absent when the era has none for this port. */
  readonly typeDisplay?: PortTypeDisplay;
}

// =============================================================================
// Block detail
// =============================================================================

/**
 * How an input port receives its value. A discriminated value so the inspector
 * stays exhaustive: a wire (`connected`, one or more sources), a materialized
 * default (`default`, a human label), or nothing (`unconnected`). Absence of a
 * feed is `unconnected`, never a fabricated source. [LAW:dataflow-not-control-flow]
 */
export type PortFeed =
  | { readonly kind: 'connected'; readonly sources: readonly [EndpointDetail, ...(readonly EndpointDetail[])] }
  | { readonly kind: 'default'; readonly label: string }
  | { readonly kind: 'unconnected' };

/**
 * The editable default-source of an input port — an era-specific extra the V1
 * provider fills and the scene provider omits (pillar has config knobs, not
 * default-source recipes). Neutral: the provider pre-computes the current
 * selection and the valid options; the inspector renders selects + a reset
 * command and writes back through `setDefaultSource`. [LAW:no-mode-explosion]
 */
export interface DefaultSourceDetail {
  readonly blockType: string;
  readonly outputPortId: string;
  readonly blockTypeOptions: readonly SelectOption[];
  /** Output options for the chosen block type; length > 1 ⇒ show the selector. */
  readonly outputPortOptions: readonly SelectOption[];
  /** True when an override differs from the registry default (offer "reset"). */
  readonly canReset: boolean;
  /** True when the port is wired, so the default is inactive (shown dimmed). */
  readonly inactive: boolean;
}

/** The combine mode of a multi-writer input — an era extra (V1 only). */
export interface CombineModeDetail {
  readonly current: string;
  readonly options: readonly SelectOption[];
}

export interface InputPortDetail {
  readonly id: string;
  readonly label: string;
  readonly typeDisplay?: PortTypeDisplay;
  readonly feed: PortFeed;
  /** Inline value/binding controls (a default-value editor, semantic controls). */
  readonly controls: readonly DetailControl[];
  /** Editable default-source (V1); absent when the era has no such concept. */
  readonly defaultSource?: DefaultSourceDetail;
  /** Combine mode for multi-writer inputs (V1); absent otherwise. */
  readonly combineMode?: CombineModeDetail;
}

export interface OutputPortDetail {
  readonly id: string;
  readonly label: string;
  readonly typeDisplay?: PortTypeDisplay;
  readonly targets: readonly EndpointDetail[];
}

/**
 * A block-level config field. Most are a neutral `control`; an expression block's
 * body is its own kind so the inspector mounts the expression widget rather than a
 * text box (an era extra — V1). A new config kind is a compile error at every
 * exhaustive switch, forcing a decision. [LAW:types-are-the-program]
 */
export type ConfigField =
  | { readonly kind: 'control'; readonly control: DetailControl }
  | { readonly kind: 'expression'; readonly id: string; readonly blockId: string; readonly value: string };

/**
 * How a selected block reads for the inspector. `variant` distinguishes an
 * ordinary block from a hidden system block (a time root) or an unknown type, so
 * those render their own way without the inspector sniffing the type string.
 */
export interface BlockDetail {
  readonly id: string;
  readonly variant: 'block' | 'timeRoot' | 'unknownType';
  readonly type: string;
  readonly typeLabel: string;
  readonly displayName: string;
  /** True when this era supports renaming the instance (V1); false for pillar. */
  readonly canEditDisplayName: boolean;
  readonly inputs: readonly InputPortDetail[];
  readonly outputs: readonly OutputPortDetail[];
  readonly config: readonly ConfigField[];
}

// =============================================================================
// Port detail (the port sub-inspector)
// =============================================================================

/**
 * A port shown in its own right (the port sub-inspector). Carries the port's type,
 * its parent block, how it is fed / what it feeds, and — for an input in an era
 * that has them — its default-source, combine-mode and inline controls. A superset
 * of the facts on `InputPortDetail`/`OutputPortDetail` plus the parent link.
 */
export interface PortDetail {
  readonly ref: PortRef;
  readonly direction: PortDirection;
  readonly label: string;
  readonly typeDisplay?: PortTypeDisplay;
  readonly parentBlock: EndpointDetail;
  readonly feed: PortFeed;
  readonly targets: readonly EndpointDetail[];
  readonly controls: readonly DetailControl[];
  readonly defaultSource?: DefaultSourceDetail;
  readonly combineMode?: CombineModeDetail;
}

// =============================================================================
// Edge detail
// =============================================================================

/**
 * One resolved step in an edge's transform chain, with the neutral before/after
 * types the inspector paints. `kind` distinguishes an authored lens/transform from
 * an auto-inserted adapter. This is the RESOLVED chain (post type-inference),
 * distinct from the EdgeDecorator seam's authored chips — the inspector shows both
 * the type flow (here) and the editable chips (via EdgeDecorator). [LAW:decomposition]
 */
export interface EdgeChainStep {
  readonly kind: 'lens' | 'adapter';
  readonly label: string;
  readonly fromType?: string;
  readonly toType?: string;
}

/** One lens attached to an edge, with its inline params — V1 growth surface. */
export interface LensEntryDetail {
  readonly id: string;
  readonly label: string;
  readonly params: readonly DetailControl[];
}

/** A lens type addable to an edge — V1 growth surface (palette). */
export interface LensOptionDetail {
  readonly blockType: string;
  readonly label: string;
  readonly description: string;
}

/**
 * Add/remove/retune lens growth for an edge — an era extra the V1 provider fills.
 * Absent for pillar: chain growth in the pillar model is owned by the
 * scene-adapters epic, not this seam (mirroring the EdgeDecorator scope note).
 */
export interface LensManagementDetail {
  readonly existing: readonly LensEntryDetail[];
  readonly compatible: readonly LensOptionDetail[];
}

export interface EdgeDetail {
  readonly id: string;
  readonly source: EndpointDetail;
  readonly target: EndpointDetail;
  /** Resolved transform steps with type flow; empty for a direct wire. */
  readonly chain: readonly EdgeChainStep[];
  /** Lens management (V1 growth); absent when the era defers chain growth. */
  readonly lensManagement?: LensManagementDetail;
}

// =============================================================================
// Type preview (a library block type, no instance)
// =============================================================================

export interface PreviewPortDetail {
  readonly id: string;
  readonly label: string;
  readonly typeLabel: string;
  /** Default-source label for an input, when the type declares one. */
  readonly defaultLabel?: string;
  /** True when that default is a time source (rendered emphasized). */
  readonly defaultIsTime?: boolean;
}

export interface TypePreviewDetail {
  readonly type: string;
  readonly typeLabel: string;
  readonly description?: string;
  readonly inputs: readonly PreviewPortDetail[];
  readonly outputs: readonly PreviewPortDetail[];
  /** Era extras (V1: form + capability); absent when the era has none. */
  readonly form?: string;
  readonly capability?: string;
}

// =============================================================================
// SelectionDetail interface
// =============================================================================

/**
 * The editor-owned authority on inspector-facing selection detail for one graph.
 * Reads return presentation-ready facts; commands are neutral mutations the
 * provider routes to its own store. Every method returns `undefined` (or an empty
 * detail) for a selection the era cannot describe, rather than throwing — an
 * inspector routinely asks about a selection the graph no longer contains.
 * [LAW:one-way-deps]
 */
export interface SelectionDetail {
  // ---- Reads -------------------------------------------------------------
  /** Full detail for a selected block, or `undefined` when the id is unknown. */
  describeBlock(blockId: string): BlockDetail | undefined;
  /** Full detail for a selected edge by id, or `undefined` when the edge is unknown. */
  describeEdge(edgeId: string): EdgeDetail | undefined;
  /** Full detail for a selected port, or `undefined` when the port is unknown. */
  describePort(ref: PortRef): PortDetail | undefined;
  /** Library preview for a block TYPE (no instance), or `undefined` if unknown. */
  describeTypePreview(blockType: string): TypePreviewDetail | undefined;

  // ---- Commands (effects at the provider boundary) -----------------------
  /** Write one inline control's value. */
  applyControl(target: ControlMutationTarget, value: unknown): void;
  /** Rename a block instance; returns a validation error message when rejected. */
  setDisplayName(blockId: string, displayName: string): { error?: string };
  /** Set (or clear, with `undefined`) an input port's default source. */
  setDefaultSource(blockId: string, portId: string, blockType: string | undefined, outputPortId?: string): void;
  /** Set an input port's combine mode. */
  setCombineMode(blockId: string, portId: string, mode: string): void;
  /** Add a lens of `lensType` to an edge (V1 growth). */
  addLens(edge: EdgeRef, lensType: string): void;
  /** Remove a lens from an edge (V1 growth). */
  removeLens(edge: EdgeRef, lensId: string): void;
  /** Connect a source output to a target input. */
  connect(source: PortRef, target: PortRef): void;
  /** Remove one edge by id. */
  removeEdge(edgeId: string): void;
}

// =============================================================================
// Empty provider
// =============================================================================

/**
 * The detail authority for an editor surface with no inspector model — today, the
 * composite editor, which edits a subgraph definition inspected elsewhere. Making
 * "no detail here" an explicit provider value keeps it out of the inspector as a
 * hidden `if (!detail)` branch: the variability lives in which provider a boot
 * supplies, not in whether the inspector runs. Reads return absent; commands are
 * no-ops. [LAW:dataflow-not-control-flow] [LAW:no-silent-failure]
 */
export const emptySelectionDetail: SelectionDetail = {
  describeBlock: () => undefined,
  describeEdge: () => undefined,
  describePort: () => undefined,
  describeTypePreview: () => undefined,
  applyControl: () => {},
  setDisplayName: () => ({}),
  setDefaultSource: () => {},
  setCombineMode: () => {},
  addLens: () => {},
  removeLens: () => {},
  connect: () => {},
  removeEdge: () => {},
};
