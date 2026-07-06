/**
 * BlockCatalog — the editor's neutral answer to "what block types exist?"
 *
 * This is the palette/insertion seam, the sibling of GraphDataAdapter: where the
 * adapter answers "what is IN the graph" (block/edge instances), the catalog
 * answers "what block types could I ADD" (browse, define, suggest). Both eras —
 * the V1 registry and the pillar scene registry — become coequal providers of
 * this one query surface, so the editor's library, connection picker, and
 * replacement menu never consult a backend registry directly.
 * [FRAMING:representation] [LAW:one-way-deps]
 *
 * ARCHITECTURAL CONSTRAINT: like GraphDataAdapter, this interface speaks only the
 * editor's neutral vocabulary. Each provider translates its era-specific block
 * definitions INTO these presentation-ready facts (`CatalogEntry`); the consumers
 * render/insert without knowing which backend produced them. A backend without a
 * concept (composites, expression editors, singleton roots) simply reports the
 * neutral default (`form: 'primitive'`, `openBehavior: {kind:'none'}`,
 * `insertable: true`). [LAW:dataflow-not-control-flow]
 *
 * The catalog is a projection of a STATIC registry (both eras register their
 * blocks at boot), so — unlike GraphDataAdapter — it carries no live graph and
 * needs no MobX reactivity.
 */

import type { PortTypeDisplay } from './types';

// =============================================================================
// Neutral catalog vocabulary
// =============================================================================

/**
 * How an authored block instance "opens" — the per-type action offered in the
 * block context menu. Neutral: an era without an expression editor reports
 * `{ kind: 'none' }`. The run/label logic lives in `block-ui`; the catalog only
 * states which behavior a type has.
 */
export type CatalogOpenBehavior =
  | { readonly kind: 'none' }
  | { readonly kind: 'expressionEditor' };

/**
 * A wireable port on a catalog entry, projected for insertion/display. Only
 * ports the editor actually surfaces cross the seam — config-only inputs
 * (edited inline, never wired) and hidden outputs are a registry-internal detail
 * and are filtered out by the provider. [LAW:decomposition]
 */
export interface CatalogPort {
  readonly id: string;
  readonly label: string;
  /** Presentation-ready display of the port's declared type. */
  readonly typeDisplay: PortTypeDisplay;
}

/** The structural flavor of a catalog entry (drives the library's badge). */
export type CatalogEntryForm = 'primitive' | 'macro' | 'composite';

/**
 * A block type available in the editor, projected to neutral display + insertion
 * facts. This is the whole truth a consumer needs to browse, define, and suggest
 * a block type without touching a backend registry. [LAW:composability]
 */
export interface CatalogEntry {
  /** Registry key / discriminant — the argument to `addBlock`. */
  readonly type: string;
  /** Human label for the type (e.g. "Constant"). */
  readonly label: string;
  /** Longer prose used in search + tooltip. */
  readonly description?: string;
  /** Grouping name for the library (a free string; providers may use their own). */
  readonly category: string;
  /** Structural flavor. A backend without composites reports 'primitive'. */
  readonly form: CatalogEntryForm;
  /**
   * Whether the type's definition is user-editable. False for locked library
   * composites; true for primitives and user composites. Drives the library's
   * lock/edit badge only.
   */
  readonly editable: boolean;
  /**
   * Whether the type can be freely added to / replaced into a graph. False for
   * singleton roots (a V1 time root); the library hides these and the
   * replacement menu excludes them.
   */
  readonly insertable: boolean;
  /** Per-type open action offered in the context menu. */
  readonly openBehavior: CatalogOpenBehavior;
  /** Wireable input ports (config-only inputs excluded). */
  readonly inputs: readonly CatalogPort[];
  /** Wireable output ports (hidden outputs excluded). */
  readonly outputs: readonly CatalogPort[];
}

// =============================================================================
// BlockCatalog interface
// =============================================================================

/**
 * The editor-owned catalog query surface. A provider supplies the full set of
 * known entries and a keyed lookup; every other view (categories, grouping,
 * search, insertable filtering) is derived by the free helpers below so those
 * derivations live in exactly one place rather than N provider implementations.
 * [LAW:one-source-of-truth]
 */
export interface BlockCatalog {
  /** Every known block type, projected to neutral facts. */
  readonly entries: readonly CatalogEntry[];
  /** Lookup by type discriminant. */
  getEntry(type: string): CatalogEntry | undefined;
}

// =============================================================================
// Derived views (one source of truth: `catalog.entries`)
// =============================================================================

/** Look up an entry, throwing if the type is unknown (parity with `requireAnyBlockDef`). */
export function requireCatalogEntry(catalog: BlockCatalog, type: string): CatalogEntry {
  const entry = catalog.getEntry(type);
  if (!entry) {
    throw new Error(`Unknown block type: "${type}" is not in the catalog`);
  }
  return entry;
}

/** Entries the editor lets the user add (singleton roots excluded). */
export function insertableEntries(catalog: BlockCatalog): readonly CatalogEntry[] {
  return catalog.entries.filter((e) => e.insertable);
}

/** Sorted, unique category names over the insertable entries. */
export function catalogCategories(catalog: BlockCatalog): readonly string[] {
  const seen = new Set<string>();
  for (const entry of insertableEntries(catalog)) {
    seen.add(entry.category);
  }
  return [...seen].sort();
}

/** Insertable entries within one category, in registration order. */
export function catalogEntriesInCategory(catalog: BlockCatalog, category: string): readonly CatalogEntry[] {
  return insertableEntries(catalog).filter((e) => e.category === category);
}

/**
 * Case-insensitive substring match over type / label / description. Empty query
 * returns the input unchanged. [LAW:dataflow-not-control-flow] — the same filter
 * runs every call; the query value carries the variability.
 */
export function searchEntries(
  entries: readonly CatalogEntry[],
  query: string,
): readonly CatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return entries;
  return entries.filter(
    (e) =>
      e.type.toLowerCase().includes(q) ||
      e.label.toLowerCase().includes(q) ||
      (e.description?.toLowerCase().includes(q) ?? false),
  );
}
