/**
 * src/pillars/scene/scalar-inputs.ts
 *
 * Resolve the scalar `PlanExpr` feeding every routable knob input port, so a
 * modifier's `contribute` reads `inputs.x` with no wired/unwired branch of its
 * own. This module is the single owner of the "canonical default source" rule:
 * an unwired knob resolves to a `Constant` carrying its config value (a synthesized
 * default source), a wired knob resolves to the scalar its source route produced.
 *
 * A wired knob's route may pass through scalar *modifier* blocks (scale/offset/
 * clamp) before reaching a source. `resolveScalar` folds that chain back to the
 * source, exactly as `assemble.ts`'s `resolveBundle` folds an instance-modifier
 * chain back to its instance source — one recursive walk, no per-block branch.
 *
 * [LAW:single-enforcer] The default-source rule lives here, once — every block's
 *   `contribute` consumes the resolved value and never re-derives the default.
 * [LAW:one-source-of-truth] The default's constant is read from config; it is not
 *   a second copy stored on the port or the patch.
 * [LAW:dataflow-not-control-flow] The scalar route folds through a generic walk
 *   over contributions; a scalar modifier is a value carrying `apply`, not a case.
 * [LAW:no-silent-failure] A knob wired to a source that produces no scalar is a
 *   surfaced diagnostic, not a silently-dropped route.
 */

import { konst, type PlanExpr } from '../../render/scene-plan';
import type { PillarEdge } from '../types';
import type { ScenePortDeclaration, ScalarContribution } from './scene-block';

/**
 * Resolve every routable knob input port of one block to a scalar `PlanExpr`.
 * Non-knob ports (a required instance bundle) are not knobs and are skipped; they
 * are resolved as bundle edges by assembly, not here.
 *
 * `scalarProducers` holds exactly the blocks a scalar route can fold through
 * (sources + scalar modifiers), fully populated before any knob resolves — so the
 * fold reads a stable map, never one growing under it. `knownBlockIds` is every
 * block in the patch, used to tell a real-but-non-scalar block ("not a scalar
 * source") from a dangling reference ("unknown block") deterministically, without
 * depending on which blocks have contributed yet. [LAW:no-ambient-temporal-coupling]
 */
export function resolveKnobInputs(
  blockId: string,
  ports: readonly ScenePortDeclaration[],
  config: unknown,
  edges: readonly PillarEdge[],
  scalarProducers: ReadonlyMap<string, ScalarContribution>,
  knownBlockIds: ReadonlySet<string>,
  errors: string[],
): Record<string, PlanExpr> {
  const inputs: Record<string, PlanExpr> = {};
  for (const port of ports) {
    if (port.direction !== 'input') continue;
    if (port.default.kind !== 'configScalar') continue;
    inputs[port.id] = resolveKnob(
      blockId,
      port,
      port.default.configKey,
      config,
      edges,
      scalarProducers,
      knownBlockIds,
      errors,
    );
  }
  return inputs;
}

/**
 * The scalar value one knob resolves to. The wired/unwired distinction is genuine
 * graph state, decided here once: an unwired knob is its synthesized default
 * source `konst(config[configKey])`; a wired knob is the scalar its route
 * produced (folded through any scalar modifiers). Downstream (`contribute`) sees a
 * single `PlanExpr` either way.
 */
function resolveKnob(
  blockId: string,
  port: ScenePortDeclaration,
  configKey: string,
  config: unknown,
  edges: readonly PillarEdge[],
  scalarProducers: ReadonlyMap<string, ScalarContribution>,
  knownBlockIds: ReadonlySet<string>,
  errors: string[],
): PlanExpr {
  const edge = edges.find((e) => e.target === blockId && e.inputSlot === port.id);
  if (edge === undefined) {
    return konst(numberConfig(config, configKey, blockId, port.id));
  }
  const value = resolveScalar(edge.source, edges, scalarProducers, knownBlockIds, errors, new Set());
  if (value === null) {
    // `resolveScalar` already surfaced why the route produces no scalar. Fall to
    // the default so one bad route yields one diagnostic, not a cascade of
    // "missing input" errors from the rest of assembly.
    return konst(numberConfig(config, configKey, blockId, port.id));
  }
  return value;
}

/**
 * Fold the scalar route feeding a knob (or another scalar modifier) back to its
 * source. A `scalarSource` is the base case (its value); a `scalarModifier`
 * resolves its own scalar input and applies its transform.
 *
 * A block absent from `scalarProducers` produces no scalar: if it is a real block
 * in the patch it is an instance/draw block ending a scalar route illegally ("not
 * a scalar source"); otherwise the route dangles ("unknown block"). Classifying
 * via `knownBlockIds` — not via which blocks happen to have contributed yet —
 * keeps the diagnostic deterministic. [LAW:no-ambient-temporal-coupling]
 *
 * [LAW:dataflow-not-control-flow] One generic fold: a scalar modifier is a value
 *   carrying `apply`, not a per-type branch — adding a transform block adds no
 *   code path here, exactly as with `resolveBundle`.
 * [LAW:no-silent-failure] A chain that dangles, cycles, or bottoms out at a
 *   non-scalar block is a surfaced error, never a silently-dropped route.
 */
function resolveScalar(
  blockId: string,
  edges: readonly PillarEdge[],
  scalarProducers: ReadonlyMap<string, ScalarContribution>,
  knownBlockIds: ReadonlySet<string>,
  errors: string[],
  visiting: ReadonlySet<string>,
): PlanExpr | null {
  if (visiting.has(blockId)) {
    errors.push(`[scene] scalar route has a cycle through block '${blockId}'`);
    return null;
  }
  const contribution = scalarProducers.get(blockId);
  if (contribution === undefined) {
    errors.push(
      knownBlockIds.has(blockId)
        ? `[scene] block '${blockId}' is not a scalar source`
        : `[scene] scalar route references unknown block '${blockId}'`,
    );
    return null;
  }

  switch (contribution.role) {
    case 'scalarSource':
      return contribution.value;
    case 'scalarModifier': {
      const inputEdge = edges.find(
        (e) => e.target === blockId && e.inputSlot === contribution.input,
      );
      if (!inputEdge) {
        errors.push(`[scene] scalar modifier '${blockId}' has no input edge`);
        return null;
      }
      const upstream = resolveScalar(
        inputEdge.source,
        edges,
        scalarProducers,
        knownBlockIds,
        errors,
        new Set(visiting).add(blockId),
      );
      if (upstream === null) return null;
      return contribution.apply(upstream);
    }
    default:
      return assertNever(contribution);
  }
}

function assertNever(value: never): never {
  throw new Error(`[scene] unhandled scalar contribution: ${JSON.stringify(value)}`);
}

/**
 * Read a knob's default constant from parsed config. The knob's config field is a
 * finite number with a default, so a non-number here is an impossible state (a
 * broken schema), surfaced loudly rather than coerced. [LAW:no-silent-failure]
 */
function numberConfig(config: unknown, key: string, blockId: string, portId: string): number {
  const raw = (config as Record<string, unknown>)[key];
  if (typeof raw !== 'number') {
    throw new Error(
      `[scene] knob '${blockId}.${portId}': default config field '${key}' is not a number`,
    );
  }
  return raw;
}
