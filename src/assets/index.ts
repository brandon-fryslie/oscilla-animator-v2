/**
 * src/assets/index.ts
 *
 * Public surface of the Oscilla asset model: identity, metadata, the registry,
 * and the runtime-cache key. Oscilla-owned and renderer-neutral — no `three`
 * type appears anywhere in this module.
 *
 * The Three loading bridge (src/render/webgpu/three/asset-bridge.ts) consumes
 * this surface to decode assets into runtime objects; producers (scene blocks,
 * demos) consume it to declare assets by id.
 */

export type { AssetKind, AssetSource, AssetMetadata } from './asset';
export { TEXTURE_DECODABLE_KINDS, isTextureDecodable } from './asset';
export type { AssetRegistry } from './registry';
export { createAssetRegistry } from './registry';
export type { AssetVariant, AssetCacheKey } from './cache-key';
export { assetCacheKey, DEFAULT_ASSET_VARIANT } from './cache-key';
