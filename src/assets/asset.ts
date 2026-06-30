/**
 * src/assets/asset.ts
 *
 * The Oscilla-owned asset model: what an asset *is*, independent of any
 * renderer. An asset has a stable {@link AssetId} (project identity), a category
 * ({@link AssetKind}), a human label, and a {@link AssetSource} describing where
 * its bytes come from. Decoding a source into a runtime object (a Three
 * `Texture`, `BufferGeometry`, …) is the loading bridge's job, not this module's.
 *
 * Scope source: design-docs/three-fork-integration-proposal.md §4.2, §5.2, §5.3.
 * Ownership/seam canon: design-docs/three-migration-backend-canon.md —
 *   "project-level asset identity and metadata" is Oscilla's; "runtime asset
 *   decoding/loading" is the backend bridge's.
 *
 * [LAW:one-source-of-truth] This metadata is the canonical description of an
 *   asset. The decoded Three object the bridge produces is a derived cache
 *   entry keyed by AssetId; it is never re-authored here.
 * [LAW:effects-at-boundaries] Nothing in this module touches the network, a
 *   loader, or a renderer. It is pure data describing assets; the act of
 *   fetching/decoding lives behind the loading bridge.
 * [LAW:no-shared-mutable-globals] There is no module-level asset store. A
 *   registry is constructed as a value (see ./registry); the app owns its
 *   lifetime.
 */

import type { AssetId } from '../core/ids';

/**
 * The category of an asset. These are the first-class asset reference kinds the
 * migration introduces (proposal §4.2). A kind is a tag the loading bridge uses
 * to pick a decoder; it does not, by itself, imply a decoder exists yet.
 *
 * [LAW:no-mode-explosion] The vocabulary is the proposal's named categories. New
 *   kinds are added here as the migration grows; consumers stay exhaustive over
 *   the union rather than string-matching ad hoc.
 *
 * DECODER COVERAGE: only `texture`/`image` have a bridge decoder today (the
 *   first texture proof). `geometry`/`model`/`material`/`nodeMaterial` are
 *   nameable references whose decoders land with the ticket that first needs
 *   them — the bridge fails loudly on an unimplemented kind, never silently.
 *   The canonical machine-readable form of this coverage is
 *   {@link TEXTURE_DECODABLE_KINDS} below.
 */
export type AssetKind =
  | 'image'
  | 'texture'
  | 'geometry'
  | 'model'
  | 'material'
  | 'nodeMaterial';

/**
 * The asset kinds the texture loading bridge can decode into a Three `Texture`
 * today. This is the single declaration of texture-decode coverage: the pure
 * pre-install plan validator and the effectful Three decoder both consult it, so
 * "can this asset back a texture handle?" has one answer that cannot drift.
 *
 * [LAW:one-source-of-truth] The decodable set lives here, at the asset boundary,
 *   not duplicated as a literal in the validator and again in the decoder.
 * [LAW:single-enforcer] Growing texture coverage (e.g. a compressed-texture
 *   decoder) is a one-line edit here; every consumer follows automatically.
 */
export const TEXTURE_DECODABLE_KINDS = ['image', 'texture'] as const satisfies readonly AssetKind[];

/** Whether an asset of this kind can be decoded into a texture (see {@link TEXTURE_DECODABLE_KINDS}). */
export function isTextureDecodable(kind: AssetKind): boolean {
  return (TEXTURE_DECODABLE_KINDS as readonly AssetKind[]).includes(kind);
}

/**
 * Where an asset's bytes come from.
 *
 * One variant today: a URL the loader fetches. A `data:` URL makes an asset
 * fully self-contained (no external file server), which is how the first proof
 * keeps its assets hermetic; an `http(s):` URL is the same shape for real
 * imported files. Binary/blob and embedded-buffer sources are added as new
 * variants when an importer first produces them.
 *
 * [LAW:dataflow-not-control-flow] The source is a discriminated value the bridge
 *   dispatches on, not a set of optional fields a decoder sniffs.
 */
export type AssetSource = { readonly kind: 'url'; readonly url: string };

/**
 * The canonical, backend-neutral description of one asset.
 *
 * [LAW:types-are-the-program] Every asset carries an id, a kind, a label, and a
 *   source — there is no "asset with no source" or "asset with no identity"
 *   state to defend against downstream.
 */
export interface AssetMetadata {
  readonly id: AssetId;
  readonly kind: AssetKind;
  readonly label: string;
  readonly source: AssetSource;
}
