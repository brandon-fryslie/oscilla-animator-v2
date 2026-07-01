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

import type { PlanExpr } from '../../render/scene-plan';
import type { PillarPatch } from '../types';
import { ALL_SCENE_BLOCKS } from './blocks';
import {
  buildSceneRegistry,
  type SceneBlockDefinition,
  type SceneContribution,
  type SceneDiagnostic,
} from './scene-block';
import { resolveKnobInputs } from './scalar-inputs';
import { assembleScenePlan, type SceneCompileResult } from './assemble';

interface ParsedBlock {
  readonly blockId: string;
  readonly def: SceneBlockDefinition<unknown>;
  readonly config: unknown;
}

/**
 * Compile an authored patch to a ScenePlan. Contribution happens in two ordered
 * passes so a routable knob can read a live upstream scalar:
 *
 *  1. Scalar sources (Constant, Time) contribute first — they are leaves, so
 *     their `PlanExpr` values are known before anything reads them.
 *  2. Every other block resolves its knob inputs (a wired source's scalar, or the
 *     synthesized config default) and contributes with them.
 *
 * [LAW:dataflow-not-control-flow] The two passes are the data dependency (sources
 *   before consumers), not a branch on block type at each step.
 */
export function compileScenePlan(patch: PillarPatch): SceneCompileResult {
  const registry = buildSceneRegistry(ALL_SCENE_BLOCKS);
  const diagnostics: SceneDiagnostic[] = [];
  const parsed: ParsedBlock[] = [];

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
    parsed.push({ blockId: block.id, def, config });
  }

  if (diagnostics.length > 0) {
    return { kind: 'error', errors: diagnostics.map((d) => d.message) };
  }

  const contributions = new Map<string, SceneContribution>();
  const scalarValues = new Map<string, PlanExpr>();

  // Pass 1: scalar sources. They have no knob inputs, so an empty resolved-inputs
  // record is complete; their value becomes available to every consumer below.
  for (const { blockId, def, config } of parsed) {
    if (def.role !== 'scalarSource') continue;
    const contribution = def.contribute(config, {});
    contributions.set(blockId, contribution);
    if (contribution.role === 'scalarSource') scalarValues.set(blockId, contribution.value);
  }

  // Pass 2: everything else, with knob inputs resolved against the scalar sources.
  const errors: string[] = [];
  for (const { blockId, def, config } of parsed) {
    if (def.role === 'scalarSource') continue;
    const inputs = resolveKnobInputs(
      blockId,
      def.catalog.ports,
      config,
      patch.edges,
      scalarValues,
      errors,
    );
    contributions.set(blockId, def.contribute(config, inputs));
  }

  if (errors.length > 0) {
    return { kind: 'error', errors };
  }

  return assembleScenePlan(patch.edges, contributions);
}
