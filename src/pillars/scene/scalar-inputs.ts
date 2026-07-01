/**
 * src/pillars/scene/scalar-inputs.ts
 *
 * Resolve the scalar `PlanExpr` feeding every routable knob input port, so a
 * modifier's `contribute` reads `inputs.x` with no wired/unwired branch of its
 * own. This module is the single owner of the "canonical default source" rule:
 * an unwired knob resolves to a `Constant` carrying its config value (a synthesized
 * default source), a wired knob resolves to the scalar value its source produced.
 *
 * [LAW:single-enforcer] The default-source rule lives here, once — every block's
 *   `contribute` consumes the resolved value and never re-derives the default.
 * [LAW:one-source-of-truth] The default's constant is read from config; it is not
 *   a second copy stored on the port or the patch.
 * [LAW:no-silent-failure] A knob wired to a source that produces no scalar is a
 *   surfaced diagnostic, not a silently-dropped route.
 */

import { konst, type PlanExpr } from '../../render/scene-plan';
import type { PillarEdge } from '../types';
import type { ScenePortDeclaration } from './scene-block';

/**
 * Resolve every routable knob input port of one block to a scalar `PlanExpr`.
 * Non-knob ports (a required instance bundle) are not knobs and are skipped; they
 * are resolved as bundle edges by assembly, not here.
 */
export function resolveKnobInputs(
  blockId: string,
  ports: readonly ScenePortDeclaration[],
  config: unknown,
  edges: readonly PillarEdge[],
  scalarValues: ReadonlyMap<string, PlanExpr>,
  errors: string[],
): Record<string, PlanExpr> {
  const inputs: Record<string, PlanExpr> = {};
  for (const port of ports) {
    if (port.direction !== 'input') continue;
    if (port.default.kind !== 'configScalar') continue;
    inputs[port.id] = resolveKnob(blockId, port, port.default.configKey, config, edges, scalarValues, errors);
  }
  return inputs;
}

/**
 * The scalar value one knob resolves to. The wired/unwired distinction is genuine
 * graph state, decided here once: an unwired knob is its synthesized default
 * source `konst(config[configKey])`; a wired knob is the value its source
 * produced. Downstream (`contribute`) sees a single `PlanExpr` either way.
 */
function resolveKnob(
  blockId: string,
  port: ScenePortDeclaration,
  configKey: string,
  config: unknown,
  edges: readonly PillarEdge[],
  scalarValues: ReadonlyMap<string, PlanExpr>,
  errors: string[],
): PlanExpr {
  const edge = edges.find((e) => e.target === blockId && e.inputSlot === port.id);
  if (edge === undefined) {
    return konst(numberConfig(config, configKey, blockId, port.id));
  }
  const value = scalarValues.get(edge.source);
  if (value === undefined) {
    errors.push(
      `[scene] knob '${blockId}.${port.id}' is fed by '${edge.source}', which is not a scalar source`,
    );
    // Still resolve to the default so one bad wire yields one diagnostic, not a
    // cascade of "missing input" errors from the rest of assembly.
    return konst(numberConfig(config, configKey, blockId, port.id));
  }
  return value;
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
