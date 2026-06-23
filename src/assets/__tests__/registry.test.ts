/**
 * Behavioral contract for the Oscilla asset registry: it resolves a known asset
 * to its canonical metadata, reports membership without throwing, and fails
 * loudly on duplicate construction or unknown lookups — never a silent default.
 */

import { describe, it, expect } from 'vitest';

import { assetId } from '../../core/ids';
import type { AssetMetadata } from '../asset';
import { createAssetRegistry } from '../registry';

const image = (id: string, label: string): AssetMetadata => ({
  id: assetId(id),
  kind: 'texture',
  label,
  source: { kind: 'url', url: `data:,${id}` },
});

describe('createAssetRegistry', () => {
  it('resolves a registered asset to its canonical metadata', () => {
    const registry = createAssetRegistry([image('a', 'Alpha'), image('b', 'Beta')]);
    expect(registry.getMetadata(assetId('a')).label).toBe('Alpha');
    expect(registry.getMetadata(assetId('b')).kind).toBe('texture');
  });

  it('reports membership without throwing', () => {
    const registry = createAssetRegistry([image('a', 'Alpha')]);
    expect(registry.has(assetId('a'))).toBe(true);
    expect(registry.has(assetId('missing'))).toBe(false);
  });

  it('lists every registered asset in registration order', () => {
    const registry = createAssetRegistry([image('a', 'Alpha'), image('b', 'Beta')]);
    expect(registry.all().map((a) => a.id)).toEqual([assetId('a'), assetId('b')]);
  });

  it('throws on an unknown asset id rather than returning a default', () => {
    const registry = createAssetRegistry([image('a', 'Alpha')]);
    expect(() => registry.getMetadata(assetId('nope'))).toThrow(/unknown asset id 'nope'/);
  });

  it('rejects duplicate ids at construction', () => {
    expect(() => createAssetRegistry([image('a', 'Alpha'), image('a', 'Again')])).toThrow(
      /duplicate asset id 'a'/,
    );
  });
});
