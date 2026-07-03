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
import { state, stateRef } from '../../render/scene-plan';
import { ALL_SCENE_BLOCKS } from './blocks';
import {
  buildSceneRegistry,
  type ScalarContribution,
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
 * A block that produces a scalar (a source or a scalar modifier). Both contribute
 * without reading any resolved knob input, so both belong in pass 1 — before any
 * consumer folds a scalar route. [LAW:one-type-per-behavior] the two roles get the
 * same pass-1 treatment: contribute from config alone.
 */
function producesScalar(role: SceneBlockDefinition<unknown>['role']): boolean {
  return role === 'scalarSource' || role === 'scalarModifier';
}

/**
 * Compile an authored patch to a ScenePlan. Contribution happens in two ordered
 * passes so a routable knob can read a live upstream scalar route:
 *
 *  1. Scalar blocks (Constant, Time, and scalar modifiers like Scale/Offset/
 *     Clamp) contribute first — none reads a knob input, so each is complete
 *     before anything folds a route through it.
 *  2. Every other block resolves its knob inputs (a wired route's folded scalar,
 *     or the synthesized config default) and contributes with them.
 *
 * [LAW:dataflow-not-control-flow] The two passes are the data dependency (scalar
 *   producers before consumers), not a branch on block type at each step.
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
  // The scalar route fold reads this map, fully populated by pass 1 and never
  // mutated in pass 2 — a stable view so a knob's diagnostic never depends on
  // block iteration order. [LAW:no-ambient-temporal-coupling]
  const scalarProducers = new Map<string, ScalarContribution>();
  const knownBlockIds = new Set(parsed.map((p) => p.blockId));

  // Pass 1: scalar producers (sources + modifiers). None reads a knob input, so
  // each contributes from config alone; the fold in pass 2 walks these to resolve
  // any scalar route back to its source.
  for (const { blockId, def, config } of parsed) {
    // A stateful block's *output* is its own storage cell — identity-only, so it is
    // known before its knobs resolve. Register it as a scalar producer here so a
    // downstream route folds through it exactly as through a Constant; its cell and
    // recurrence (which need the resolved knobs) are contributed in pass 2. The
    // `state(self)` leaf is a pure producer value — no `contribute` call needed.
    if (def.role === 'statefulScalar') {
      scalarProducers.set(blockId, { role: 'scalarSource', value: state(stateRef(blockId)) });
      continue;
    }
    if (!producesScalar(def.role)) continue;
    const contribution = def.contribute(config, {});
    contributions.set(blockId, contribution);
    // `producesScalar` guarantees the role, but only the runtime discriminant
    // narrows the union to `ScalarContribution` for the typed producer map.
    if (contribution.role === 'scalarSource' || contribution.role === 'scalarModifier') {
      scalarProducers.set(blockId, contribution);
    }
  }

  // Pass 2: everything else, with knob inputs resolved against the scalar routes.
  const errors: string[] = [];
  for (const { blockId, def, config } of parsed) {
    if (producesScalar(def.role)) continue;
    const inputs = resolveKnobInputs(
      blockId,
      def.catalog.ports,
      config,
      patch.edges,
      scalarProducers,
      knownBlockIds,
      errors,
    );
    contributions.set(blockId, def.contribute(config, inputs));
  }

  if (errors.length > 0) {
    return { kind: 'error', errors };
  }

  return assembleScenePlan(patch.edges, contributions);
}
