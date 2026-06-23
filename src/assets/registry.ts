/**
 * src/assets/registry.ts
 *
 * The Oscilla asset registry: the canonical lookup from {@link AssetId} to
 * {@link AssetMetadata}. This is the single source for "what is this asset",
 * owned by Oscilla and independent of any renderer (proposal §5.3).
 *
 * It is a *value*, constructed from a set of metadata — not a module-level
 * singleton. The app/runtime owns its lifetime and decides what it contains
 * (e.g. a demo's assets, or a loaded project's asset set).
 *
 * [LAW:no-shared-mutable-globals] No ambient registry. `createAssetRegistry`
 *   returns an owned value with an explicit read API.
 * [LAW:one-source-of-truth] An AssetId resolves to exactly one metadata record;
 *   duplicate ids at construction are a loud error, not a last-writer-wins merge.
 * [LAW:no-silent-failure] Looking up an unknown asset throws — a plan that
 *   references an unregistered asset is a broken plan, surfaced loudly, never a
 *   silently-skipped resource.
 */

import type { AssetId } from '../core/ids';
import type { AssetMetadata } from './asset';

/**
 * Read-only access to canonical asset metadata.
 *
 * [LAW:effects-at-boundaries] Pure lookups only; resolving an asset to a decoded
 *   runtime object is the loading bridge's effectful job, not the registry's.
 */
export interface AssetRegistry {
  /** Canonical metadata for an asset. @throws if the id is not registered. */
  readonly getMetadata: (id: AssetId) => AssetMetadata;
  /** Whether an asset is registered, without throwing. */
  readonly has: (id: AssetId) => boolean;
  /** Every registered asset, in registration order. */
  readonly all: () => readonly AssetMetadata[];
}

/**
 * Build a registry from a set of asset metadata.
 *
 * @throws if two records share an id (an asset has exactly one canonical record).
 */
export function createAssetRegistry(assets: readonly AssetMetadata[]): AssetRegistry {
  const byId = new Map<AssetId, AssetMetadata>();
  for (const asset of assets) {
    if (byId.has(asset.id)) {
      throw new Error(`AssetRegistry: duplicate asset id '${asset.id}' — an asset has one canonical record`);
    }
    byId.set(asset.id, asset);
  }
  const order = [...assets];

  return {
    getMetadata: (id) => {
      const metadata = byId.get(id);
      if (!metadata) {
        const known = order.map((a) => a.id).join(', ') || '(none)';
        throw new Error(`AssetRegistry: unknown asset id '${id}'. Registered: ${known}`);
      }
      return metadata;
    },
    has: (id) => byId.has(id),
    all: () => order,
  };
}
