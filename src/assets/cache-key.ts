/**
 * src/assets/cache-key.ts
 *
 * The runtime-cache key for a decoded asset: an {@link AssetId} plus the
 * {@link AssetVariant} it was decoded under. Two consumers that reference the
 * same asset under the same variant share one decoded runtime object; a
 * different variant (e.g. a different color-space interpretation) is a distinct
 * cache entry.
 *
 * Scope source: design-docs/three-fork-integration-proposal.md §5.2
 *   ("resolved Three runtime objects keyed by assetId + variant").
 *
 * CACHE OWNERSHIP & INVALIDATION (acceptance criterion #3):
 * - The loading bridge (src/render/webgpu/three/asset-bridge.ts) is the single
 *   owner of the runtime cache. Nothing else holds decoded objects keyed by
 *   these keys. [LAW:single-enforcer]
 * - An {@link AssetId} is immutable identity: an asset whose *bytes* change is a
 *   new asset with a new id (re-import mints a new id), so a cache entry is never
 *   silently stale — the old key is simply never requested again.
 * - The cache is invalidated wholesale when the bridge is disposed (the decoded
 *   GPU-backed objects are released then). There is no partial eviction policy
 *   yet; one lands when a long-lived session first needs it.
 *
 * [LAW:one-source-of-truth] The key is *derived* from (id, variant) by this one
 *   function. No consumer hand-builds a key string, so the format cannot drift
 *   between the writer and the reader of the cache.
 * [LAW:types-are-the-program] The key is branded, so a raw string cannot be
 *   passed where a cache key is wanted, and the only way to obtain one is this
 *   constructor.
 */

import type { Brand, AssetId } from '../core/ids';

/**
 * How an asset is decoded into a runtime object. Distinct variants of one asset
 * decode to distinct runtime objects (and distinct cache entries).
 *
 * One axis today: the color space the texels are interpreted in. `srgb` is the
 * default for authored color imagery; `linear` is for data textures (normal
 * maps, masks). New axes (flip, wrapping, mip policy) are added here as fields;
 * the key derivation below folds every field in, so adding one cannot collide.
 */
export interface AssetVariant {
  readonly colorSpace: 'srgb' | 'linear';
}

/**
 * The default decode variant: authored imagery interpreted as sRGB.
 *
 * [LAW:one-source-of-truth] The default lives here once, so every consumer that
 *   "just wants the texture" agrees on the same cache entry.
 */
export const DEFAULT_ASSET_VARIANT: AssetVariant = { colorSpace: 'srgb' };

/** Opaque runtime-cache key. Obtained only via {@link assetCacheKey}. */
export type AssetCacheKey = Brand<string, 'AssetCacheKey'>;

/**
 * Derive the runtime-cache key for an asset under a decode variant.
 *
 * The format folds in every variant field, so the same (id, variant) always
 * yields the same key and any variant difference yields a different key.
 */
export function assetCacheKey(id: AssetId, variant: AssetVariant): AssetCacheKey {
  return `${id}@${variant.colorSpace}` as AssetCacheKey;
}
