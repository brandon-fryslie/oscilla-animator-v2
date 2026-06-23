/**
 * Behavioral contract for the Three loading bridge's resolve orchestration. The
 * effectful decode is injected as a fake, so these tests cover the parts that
 * are deterministic without a real loader: cache-key dedup (two refs to one
 * asset decode once), ref→texture mapping, loud failure on an unregistered or
 * non-image asset, and wholesale cache invalidation on dispose. The real
 * TextureLoader path is proven by the headed e2e.
 */

import { describe, it, expect } from 'vitest';
import { Texture } from 'three/webgpu';

import { assetId } from '../../../../core/ids';
import { createAssetRegistry, type AssetMetadata } from '../../../../assets';
import {
  SCENE_PLAN_VERSION,
  textureRef,
  type ScenePlan,
  type TextureDef,
  type TextureRef,
} from '../../../scene-plan';
import { ThreeLoadingBridge, type TextureDecoder } from '../asset-bridge';

function planWithTextures(textures: Record<TextureRef, TextureDef>): ScenePlan {
  return {
    version: SCENE_PLAN_VERSION,
    resources: { geometries: {}, materials: {}, textures, computeResources: {}, postChains: {} },
    objects: {},
    render: { camera: { kind: 'orthographic', halfExtentX: 1, halfExtentY: 1 }, inputs: [], draws: [], postChain: null },
  } as ScenePlan;
}

const textureAsset = (id: string): AssetMetadata => ({
  id: assetId(id),
  kind: 'texture',
  label: id,
  source: { kind: 'url', url: `data:,${id}` },
});

/** A decoder that hands back a fresh Texture per call and records its calls. */
function countingDecoder(): { decode: TextureDecoder; calls: () => number } {
  let calls = 0;
  return {
    decode: () => {
      calls += 1;
      return Promise.resolve(new Texture());
    },
    calls: () => calls,
  };
}

describe('ThreeLoadingBridge.resolveTextures', () => {
  it('maps every plan texture handle to a decoded texture', async () => {
    const { decode } = countingDecoder();
    const bridge = new ThreeLoadingBridge(decode);
    const refA = textureRef('a');
    const plan = planWithTextures({ [refA]: { kind: 'asset', assetId: assetId('img') } });
    const registry = createAssetRegistry([textureAsset('img')]);

    const resolved = await bridge.resolveTextures(plan, registry);
    expect(resolved.get(refA)).toBeInstanceOf(Texture);
  });

  it('decodes a shared asset once and hands both handles the same texture', async () => {
    const { decode, calls } = countingDecoder();
    const bridge = new ThreeLoadingBridge(decode);
    const refA = textureRef('a');
    const refB = textureRef('b');
    const plan = planWithTextures({
      [refA]: { kind: 'asset', assetId: assetId('img') },
      [refB]: { kind: 'asset', assetId: assetId('img') },
    });
    const registry = createAssetRegistry([textureAsset('img')]);

    const resolved = await bridge.resolveTextures(plan, registry);
    expect(calls()).toBe(1);
    expect(resolved.get(refA)).toBe(resolved.get(refB));
  });

  it('throws on an asset the registry does not know', async () => {
    const { decode } = countingDecoder();
    const bridge = new ThreeLoadingBridge(decode);
    const plan = planWithTextures({ [textureRef('a')]: { kind: 'asset', assetId: assetId('ghost') } });
    const registry = createAssetRegistry([]);

    await expect(bridge.resolveTextures(plan, registry)).rejects.toThrow(/unknown asset id 'ghost'/);
  });

  it('releases and re-decodes after dispose', async () => {
    const { decode, calls } = countingDecoder();
    const bridge = new ThreeLoadingBridge(decode);
    const plan = planWithTextures({ [textureRef('a')]: { kind: 'asset', assetId: assetId('img') } });
    const registry = createAssetRegistry([textureAsset('img')]);

    await bridge.resolveTextures(plan, registry);
    expect(calls()).toBe(1);
    // Cache hit on the second resolve: no new decode.
    await bridge.resolveTextures(plan, registry);
    expect(calls()).toBe(1);
    // Dispose invalidates the cache wholesale; the next resolve decodes again.
    bridge.dispose();
    await bridge.resolveTextures(plan, registry);
    expect(calls()).toBe(2);
  });
});

describe('ThreeLoadingBridge default decoder — loud failure on undecodable kinds', () => {
  it('refuses an asset whose kind has no texture decoder', async () => {
    const bridge = new ThreeLoadingBridge();
    const plan = planWithTextures({ [textureRef('a')]: { kind: 'asset', assetId: assetId('mesh') } });
    const registry = createAssetRegistry([
      { id: assetId('mesh'), kind: 'model', label: 'mesh', source: { kind: 'url', url: 'data:,mesh' } },
    ]);
    await expect(bridge.resolveTextures(plan, registry)).rejects.toThrow(/has no texture decoder/);
  });
});
