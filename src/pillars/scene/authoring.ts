/**
 * src/pillars/scene/authoring.ts
 *
 * Pure authoring policy for building a `PillarPatch` from the scene catalog —
 * the rules the editor applies when a user adds a block or wires a port. Kept
 * pure (no MobX, no renderer) so the store stays thin and these decisions are
 * unit-testable in isolation.
 *
 * [LAW:single-enforcer] These are the one place "what config does a fresh block
 *   start with" and "what role/kind does an authored block/edge carry" are
 *   decided; the store and UI never re-derive them ad hoc.
 * [LAW:effects-at-boundaries] Pure functions of catalog metadata; the effects
 *   (mutating the store, installing the plan) live at their own boundaries.
 */

import type { PillarEdge, PillarKind } from '../types';
import type {
  SceneCatalogMetadata,
  SceneContributionRole,
  SceneConfigControl,
  ScenePortDeclaration,
} from './scene-block';

/**
 * The authored `kind` for a block, derived from its contribution role. `kind`
 * is part of the shared authored model but the scene compiler dispatches on the
 * block's `role`, not its kind; this mapping keeps the authored patch honest
 * (an instance source reads as a generator, a draw as an intent) without the
 * editor inventing a kind per call site.
 *
 * [LAW:types-are-the-program] Exhaustive over the role union — a new role is a
 *   compile error here until its authored kind is declared.
 */
export function pillarKindForRole(role: SceneContributionRole): PillarKind {
  switch (role) {
    case 'instanceSource':
      return 'generator';
    case 'scalarSource':
      return 'generator';
    case 'modifier':
      return 'modifier';
    case 'draw':
      return 'intent';
    default:
      return assertNever(role);
  }
}

/**
 * The authored edge role for a wire landing on a given input port. The scene
 * assembler matches a draw's instance source on its `primary` edge, so the
 * block's primary instance input mints a `primary` edge; a material input mints
 * a `material` edge; everything else is `secondary`. The port id `'primary'` is
 * the contract's name for that slot, mirrored here so validation (which keys on
 * `inputSlot`) and assembly (which keys on `role`) agree for one minted edge.
 */
export function edgeRoleForPort(port: ScenePortDeclaration): PillarEdge['role'] {
  if (port.id === 'primary') return 'primary';
  if (port.value === 'materialShell') return 'material';
  return 'secondary';
}

/**
 * The initial config for a freshly-added block, one entry per declared config
 * field, chosen by the field's control so the result satisfies the block's
 * config schema (positive numbers/ints start at 1; optional assets are omitted).
 *
 * [LAW:no-silent-failure] If a control's default would not parse, that surfaces
 *   as a config diagnostic on compile rather than being silently corrected.
 */
export function defaultSceneConfig(
  catalog: SceneCatalogMetadata,
): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const field of catalog.configFields) {
    // A field's authored default (a knob's `SceneScalarKnob.default`) is the
    // single source of that value; only a field with no authored default falls to
    // the control-generic default. [LAW:one-source-of-truth]
    const value = field.defaultValue ?? defaultForControl(field.control);
    // An omitted key is the honest default for an optional field.
    if (value !== undefined) config[field.key] = value;
  }
  return config;
}

function defaultForControl(control: SceneConfigControl): unknown {
  switch (control) {
    case 'number':
    case 'integer':
      return 1;
    case 'toggle':
      return false;
    case 'color':
      return '#ffffff';
    case 'colorList':
      // A two-entry palette/ramp: the minimum the schema accepts, with two
      // distinct hues so a freshly-added color source renders visibly.
      return ['#ff2d55', '#2e8bff'];
    case 'select':
    case 'asset':
      // No defensible non-empty default; leave the field unset.
      return undefined;
    default:
      return assertNever(control);
  }
}

function assertNever(value: never): never {
  throw new Error(`[scene] unhandled authoring case: ${JSON.stringify(value)}`);
}
