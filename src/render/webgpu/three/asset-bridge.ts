/**
 * src/render/webgpu/three/asset-bridge.ts
 *
 * The Three loading bridge: the single place that turns an Oscilla asset into a
 * decoded Three runtime object, and the single owner of the runtime cache that
 * holds those objects (proposal §5.3 — "the only place that knows about
 * LoadingManager, TextureLoader, GLTFLoader").
 *
 * Scope source: design-docs/three-fork-integration-proposal.md §5.2, §5.3.
 * Ownership/seam canon: design-docs/three-migration-backend-canon.md — Oscilla
 *   owns asset identity/metadata (the AssetRegistry); this bridge owns runtime
 *   decoding/caching. The decoded `Texture` is a derived cache entry, not a
 *   canonical asset.
 * Capability tier: design-docs/three-fork-deltas.md §1 Tier B — upstream Three
 *   loaders, no fork delta.
 *
 * [LAW:effects-at-boundaries] Decoding (fetch + image decode) is the effect. It
 *   is isolated in an injected {@link TextureDecoder}, so the bridge's
 *   orchestration (cache lookup, dedup by cache key, ref→object mapping) is pure
 *   and unit-testable with a fake decoder; the default decoder is the one edge
 *   that touches a loader.
 * [LAW:single-enforcer] All texture decode and caching flows through one
 *   {@link ThreeLoadingBridge} instance. Scene realization receives already-
 *   resolved textures and never loads anything itself.
 * [LAW:no-silent-failure] An asset a plan references but the registry does not
 *   know, or an asset whose kind is not a decodable texture, fails loudly here —
 *   never a silently-skipped or blank texture.
 */

import {
  LinearSRGBColorSpace,
  LoadingManager,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from 'three/webgpu';

import type { AssetMetadata, AssetRegistry, AssetVariant } from '../../../assets';
import { assetCacheKey, DEFAULT_ASSET_VARIANT } from '../../../assets';
import type { ScenePlan, TextureDef, TextureRef } from '../../scene-plan';

/**
 * Decode one asset's bytes into a Three `Texture` under a decode variant. The
 * effectful seam of the bridge; the default uses a `TextureLoader`, and tests
 * inject a deterministic fake.
 */
export type TextureDecoder = (metadata: AssetMetadata, variant: AssetVariant) => Promise<Texture>;

function colorSpaceFor(variant: AssetVariant): typeof SRGBColorSpace | typeof LinearSRGBColorSpace {
  // [LAW:dataflow-not-control-flow] The Three color-space constant is a value
  //   looked up from the variant, not a branch that forgets a case.
  return variant.colorSpace === 'srgb' ? SRGBColorSpace : LinearSRGBColorSpace;
}

/**
 * The default decoder: load an image asset through Three's `TextureLoader`
 * (driven by a `LoadingManager`, the upstream URL-rewriting / grouped-load
 * point) and tag its color space from the variant.
 *
 * Only `image`/`texture` assets decode to a texture. A non-image asset kind
 * reaching the texture table is a mis-authored plan, surfaced loudly.
 */
export function createDefaultTextureDecoder(manager: LoadingManager = new LoadingManager()): TextureDecoder {
  const loader = new TextureLoader(manager);
  return (metadata, variant) => {
    if (metadata.kind !== 'image' && metadata.kind !== 'texture') {
      return Promise.reject(
        new Error(
          `ThreeLoadingBridge: asset '${metadata.id}' has kind '${metadata.kind}', which has no texture decoder (only image/texture decode to a Texture)`,
        ),
      );
    }
    // [LAW:no-silent-failure] One source variant today; an unknown source shape
    //   is a loud error rather than a silent no-op load.
    if (metadata.source.kind !== 'url') {
      return Promise.reject(
        new Error(`ThreeLoadingBridge: asset '${metadata.id}' has an unsupported source kind for texture decode`),
      );
    }
    const url = metadata.source.url;
    return new Promise<Texture>((resolve, reject) => {
      loader.load(
        url,
        (texture) => {
          texture.colorSpace = colorSpaceFor(variant);
          resolve(texture);
        },
        undefined,
        (event) => reject(event instanceof Error ? event : new Error(`failed to load texture '${url}'`)),
      );
    });
  };
}

/**
 * Owns the runtime cache of decoded textures and resolves a plan's texture table
 * into ref-keyed Three `Texture`s for realization.
 *
 * Cache ownership & invalidation are documented at src/assets/cache-key.ts: this
 * bridge is the single cache owner; entries are keyed by (assetId, variant) so
 * two refs to the same asset share one decode; the cache is released wholesale
 * on {@link ThreeLoadingBridge.dispose}.
 */
export class ThreeLoadingBridge {
  private readonly cache = new Map<string, Texture>();

  constructor(private readonly decode: TextureDecoder = createDefaultTextureDecoder()) {}

  /**
   * Decode (or reuse from cache) every texture the plan references, returning a
   * map from each plan `TextureRef` to its decoded Three `Texture`.
   *
   * Two refs that name the same asset under the same variant share one cache
   * entry, so the asset is decoded once. The returned map is what the pure
   * realizer consumes.
   */
  async resolveTextures(plan: ScenePlan, registry: AssetRegistry): Promise<ReadonlyMap<TextureRef, Texture>> {
    const resolved = new Map<TextureRef, Texture>();
    const entries = Object.entries(plan.resources.textures) as [TextureRef, TextureDef][];
    for (const [ref, def] of entries) {
      const metadata = registry.getMetadata(def.assetId);
      const variant = DEFAULT_ASSET_VARIANT;
      const key = assetCacheKey(def.assetId, variant);
      const cached = this.cache.get(key);
      const texture = cached ?? (await this.decode(metadata, variant));
      this.cache.set(key, texture);
      resolved.set(ref, texture);
    }
    return resolved;
  }

  /**
   * Release every decoded texture and clear the cache.
   *
   * [LAW:no-silent-failure] Invalidation is wholesale and owned: after dispose
   *   the bridge holds no GPU-backed objects, so a stale texture cannot leak.
   */
  dispose(): void {
    for (const texture of this.cache.values()) {
      texture.dispose();
    }
    this.cache.clear();
  }
}
