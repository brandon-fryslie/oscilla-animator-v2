/**
 * src/pillars/fixtures/scene-demos.ts
 *
 * Registry of authored patches that compile through `compileScenePlan` (the
 * Three-migration ScenePlan path), keyed by the stable id the app shell selects
 * with `?scenePlan=<id>`.
 *
 * This is the ScenePlan-path sibling of `PILLAR_FIXTURES` (which feeds the
 * frozen GPU-IR compiler-tester). The two registries never mix: a patch here is
 * a proof target for the Three backend via `compileScenePlan`, not for the
 * GPU-IR compiler via `compilePillarPatch`.
 *
 * [LAW:one-source-of-truth] The id→patch mapping lives here once; the runtime
 *   resolves a `?scenePlan=` selection through this map rather than hard-coding
 *   a single fixture at the call site.
 */

import type { PillarPatch } from '../types';
import { makeGridOfSquaresPatch } from './grid-of-squares';

export const SCENE_PLAN_DEMOS: Readonly<Record<string, () => PillarPatch>> = {
  // Three-migration first proof target
  // (design-docs/three-migration-first-proof-contract.md).
  'grid-of-squares': makeGridOfSquaresPatch,
};
