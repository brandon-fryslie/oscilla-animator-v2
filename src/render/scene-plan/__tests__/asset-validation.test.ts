/**
 * Contract for the pre-install asset-reference validator. These assert what the
 * validator *means* — which plans are installable against which registry — not
 * how the renderer realizes them. Pure data in, issue list out; no decode, no
 * Three. [LAW:behavior-not-structure]
 */

import { describe, it, expect } from 'vitest';

import { assetId } from '../../../core/ids';
import { createAssetRegistry, type AssetMetadata } from '../../../assets';
import {
  SCENE_PLAN_VERSION,
  textureRef,
  validatePlanAssets,
  formatPlanAssetIssues,
  type ScenePlan,
  type TextureDef,
  type TextureRef,
} from '..';

function planWithTextures(textures: Record<TextureRef, TextureDef>): ScenePlan {
  return {
    version: SCENE_PLAN_VERSION,
    resources: { geometries: {}, materials: {}, textures, computeResources: {}, postChains: {} },
    objects: {},
    render: { camera: { kind: 'orthographic', halfExtentX: 1, halfExtentY: 1 }, inputs: [], draws: [], postChain: null },
  } as ScenePlan;
}

const asset = (id: string, kind: AssetMetadata['kind']): AssetMetadata => ({
  id: assetId(id),
  kind,
  label: id,
  source: { kind: 'url', url: `data:,${id}` },
});

describe('validatePlanAssets', () => {
  it('reports no issues for a plan with no textures', () => {
    const plan = planWithTextures({});
    expect(validatePlanAssets(plan, createAssetRegistry([]))).toEqual([]);
  });

  it('reports no issues when every texture asset is registered and decodable', () => {
    const plan = planWithTextures({
      [textureRef('a')]: { kind: 'asset', assetId: assetId('img') },
      [textureRef('b')]: { kind: 'asset', assetId: assetId('tex') },
    });
    const registry = createAssetRegistry([asset('img', 'image'), asset('tex', 'texture')]);
    expect(validatePlanAssets(plan, registry)).toEqual([]);
  });

  it('flags a texture whose asset is not registered as missing', () => {
    const plan = planWithTextures({ [textureRef('a')]: { kind: 'asset', assetId: assetId('ghost') } });
    const issues = validatePlanAssets(plan, createAssetRegistry([]));
    expect(issues).toEqual([{ reason: 'missing', ref: textureRef('a'), assetId: assetId('ghost') }]);
  });

  it('flags a registered asset whose kind has no texture decoder', () => {
    const plan = planWithTextures({ [textureRef('a')]: { kind: 'asset', assetId: assetId('mesh') } });
    const registry = createAssetRegistry([asset('mesh', 'model')]);
    const issues = validatePlanAssets(plan, registry);
    expect(issues).toEqual([
      { reason: 'undecodableKind', ref: textureRef('a'), assetId: assetId('mesh'), kind: 'model' },
    ]);
  });

  it('reports every bad reference, not just the first', () => {
    const plan = planWithTextures({
      [textureRef('good')]: { kind: 'asset', assetId: assetId('img') },
      [textureRef('gone')]: { kind: 'asset', assetId: assetId('ghost') },
      [textureRef('wrong')]: { kind: 'asset', assetId: assetId('mesh') },
    });
    const registry = createAssetRegistry([asset('img', 'image'), asset('mesh', 'material')]);
    const issues = validatePlanAssets(plan, registry);
    expect(issues.map((i) => i.reason)).toEqual(['missing', 'undecodableKind']);
  });
});

describe('formatPlanAssetIssues', () => {
  it('renders each issue as a readable line naming ref, asset, and cause', () => {
    const plan = planWithTextures({
      [textureRef('gone')]: { kind: 'asset', assetId: assetId('ghost') },
      [textureRef('wrong')]: { kind: 'asset', assetId: assetId('mesh') },
    });
    const registry = createAssetRegistry([asset('mesh', 'nodeMaterial')]);
    const text = formatPlanAssetIssues(validatePlanAssets(plan, registry));
    expect(text).toContain("'ghost'");
    expect(text).toContain('not registered');
    expect(text).toContain("'mesh'");
    expect(text).toContain('no texture decoder');
  });
});
