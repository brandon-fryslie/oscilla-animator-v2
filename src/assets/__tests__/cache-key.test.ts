/**
 * The runtime-cache key contract (acceptance criterion #3): the key is a pure
 * function of (assetId, variant) — same inputs collapse to one cache entry, any
 * difference in id or variant is a distinct entry. This is what lets two
 * references to one asset share a single decode while a different decode variant
 * stays separate.
 */

import { describe, it, expect } from 'vitest';

import { assetId } from '../../core/ids';
import { assetCacheKey, DEFAULT_ASSET_VARIANT, type AssetVariant } from '../cache-key';

const SRGB: AssetVariant = { colorSpace: 'srgb' };
const LINEAR: AssetVariant = { colorSpace: 'linear' };

describe('assetCacheKey', () => {
  it('is stable: the same id and variant always yield the same key', () => {
    expect(assetCacheKey(assetId('tex'), SRGB)).toBe(assetCacheKey(assetId('tex'), SRGB));
  });

  it('separates different assets under the same variant', () => {
    expect(assetCacheKey(assetId('a'), SRGB)).not.toBe(assetCacheKey(assetId('b'), SRGB));
  });

  it('separates different variants of the same asset', () => {
    expect(assetCacheKey(assetId('tex'), SRGB)).not.toBe(assetCacheKey(assetId('tex'), LINEAR));
  });

  it('defaults to the sRGB variant for authored imagery', () => {
    expect(DEFAULT_ASSET_VARIANT.colorSpace).toBe('srgb');
    expect(assetCacheKey(assetId('tex'), DEFAULT_ASSET_VARIANT)).toBe(assetCacheKey(assetId('tex'), SRGB));
  });
});
