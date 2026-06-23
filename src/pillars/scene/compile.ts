/**
 * src/pillars/scene/compile.ts
 *
 * The ScenePlan compile entry: an authored `PillarPatch` → backend-neutral
 * `ScenePlan`. This is the NEW primary assembly target for the Three migration
 * (design-docs/three-migration-scene-plan.md). It replaces
 * `assemblePipelineInstallPayload` as the thing new backend work produces.
 *
 * [LAW:one-source-of-truth] This path never touches `boundary-contract`: it does
 *   not wrap, embed, or round-trip through `PipelineInstallPayload`. The Rust
 *   payload remains a frozen legacy artifact; the two targets do not co-assemble
 *   from one graph (canon §"Dead Concepts").
 * [LAW:no-silent-failure] Every block validates its config and the assembler
 *   validates graph wiring; all errors are collected and returned, never
 *   swallowed.
 */

import type { PillarPatch } from '../types';
import { ALL_SCENE_BLOCKS } from './blocks';
import {
  buildSceneRegistry,
  type SceneContribution,
  type SceneDiagnostic,
} from './scene-block';
import { assembleScenePlan, type SceneCompileResult } from './assemble';

export function compileScenePlan(patch: PillarPatch): SceneCompileResult {
  const registry = buildSceneRegistry(ALL_SCENE_BLOCKS);
  const diagnostics: SceneDiagnostic[] = [];
  const contributions = new Map<string, SceneContribution>();

  for (const block of patch.blocks) {
    const def = registry.get(block.type);
    if (!def) {
      diagnostics.push({
        blockId: block.id,
        message: `[scene] block '${block.id}': unknown block type '${block.type}'`,
      });
      continue;
    }
    const config = def.readConfig(block.config, block.id, diagnostics);
    if (config === null) continue;
    contributions.set(block.id, def.contribute(config));
  }

  if (diagnostics.length > 0) {
    return { kind: 'error', errors: diagnostics.map((d) => d.message) };
  }

  return assembleScenePlan(patch.edges, contributions);
}
