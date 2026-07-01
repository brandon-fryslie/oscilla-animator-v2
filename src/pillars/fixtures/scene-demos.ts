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
import { makeRingOrbitPatch } from './ring-orbit';
import { makeSpirographPatch } from './spirograph';
import { makeKaleidoscopePatch } from './kaleidoscope';
import { makeConditionalVisibilityPatch } from './conditional-visibility';
import { makeScatterCloudPatch } from './scatter-cloud';
import { makeColorPalettePatch } from './color-palette';

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
  // Target-animation fixtures (oscilla-pillars-scene-nt56.8): each recreates a
  // legacy demo behavior from native blocks only, with layouts authored as
  // composable modifiers over a bare InstanceCount source. No assets.
  'ring-orbit': { makePatch: makeRingOrbitPatch, assets: [] },
  'spirograph': { makePatch: makeSpirographPatch, assets: [] },
  'kaleidoscope': { makePatch: makeKaleidoscopePatch, assets: [] },
  'conditional-visibility': { makePatch: makeConditionalVisibilityPatch, assets: [] },
  // Scatter-modifier proof target (oscilla-pillars-scene-nt56.23): a pseudo-random
  // point cloud placed by hashing each instance index — exercises the new `hash`
  // PlanExpr operator end-to-end. No assets.
  'scatter-cloud': { makePatch: makeScatterCloudPatch, assets: [] },
  // Native palette proof target (oscilla-pillars-scene-nt56.22): the grid colored
  // by a ColorByIndex palette LUT — every dot the palette entry at its index,
  // wrapping across the field. Exercises the texture-backed `{kind:'data'}` LUT
  // and `unlitColorLut` material end-to-end. No assets.
  'color-palette': { makePatch: makeColorPalettePatch, assets: [] },
};
