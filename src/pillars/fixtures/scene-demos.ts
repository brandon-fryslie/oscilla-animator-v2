/**
 * src/pillars/fixtures/scene-demos.ts
 *
 * Registry of authored patches that compile through `compileScenePlan` (the
 * Three-migration ScenePlan path), keyed by the stable id the app shell selects
 * with `?scenePlan=<id>`.
 *
 * A demo bundles its authored patch with the assets it references: the runtime
 * builds an `AssetRegistry` from `assets` and resolves the plan's textures
 * through the loading bridge. A patch with no texture assets carries `assets: []`.
 *
 * This is the ScenePlan-path sibling of `PILLAR_FIXTURES` (which feeds the
 * frozen GPU-IR compiler-tester). The two registries never mix: a patch here is
 * a proof target for the Three backend via `compileScenePlan`, not for the
 * GPU-IR compiler via `compilePillarPatch`.
 *
 * [LAW:one-source-of-truth] The id→demo mapping lives here once; the runtime
 *   resolves a `?scenePlan=` selection through this map rather than hard-coding
 *   a single fixture at the call site.
 * [LAW:one-source-of-truth] A demo's assets live beside its patch, so the
 *   registry the runtime builds always matches the asset ids the patch references.
 */

import type { AssetMetadata } from '../../assets';
import type { PillarPatch } from '../types';
import { makeGridOfSquaresPatch } from './grid-of-squares';
import { makeInstanceWavePatch } from './instance-wave';
import { makeInstanceGradientPatch } from './instance-gradient';
import { makeTexturedTilesPatch, TEXTURED_TILES_ASSETS } from './textured-tiles';

/** An authored ScenePlan proof target plus the assets its patch references. */
export interface ScenePlanDemo {
  readonly makePatch: () => PillarPatch;
  readonly assets: readonly AssetMetadata[];
}

export const SCENE_PLAN_DEMOS: Readonly<Record<string, ScenePlanDemo>> = {
  // Three-migration first proof target
  // (design-docs/three-migration-first-proof-contract.md). No assets.
  'grid-of-squares': { makePatch: makeGridOfSquaresPatch, assets: [] },
  // Native modifier-foundation proof target (oscilla-pillars-scene-nt56.4): the
  // grid fed through a WaveOffset transform modifier and a Brightness color
  // modifier before the draw. No assets.
  'instance-wave': { makePatch: makeInstanceWavePatch, assets: [] },
  // Native color-source proof target (oscilla-pillars-scene-nt56.21): the grid
  // colored by a perceptual OKLab Gradient ramping across rank. No assets.
  'instance-gradient': { makePatch: makeInstanceGradientPatch, assets: [] },
  // Asset-bridge proof target (oscilla-pillars-cleanup-ulu.4): a grid of
  // texture-mapped tiles resolved through the AssetRegistry + ThreeLoadingBridge.
  'textured-tiles': { makePatch: makeTexturedTilesPatch, assets: TEXTURED_TILES_ASSETS },
};
