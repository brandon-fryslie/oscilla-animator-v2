/**
 * src/pillars/scene/insertability.ts
 *
 * The palette query: "given the port I selected, which blocks can connect here?"
 * It reads only declared catalog metadata (`SceneCatalogMetadata.ports`) — never
 * a block's `contribute()` body and never a `ScenePlan`. The answer is a list of
 * candidate ports tagged with the compatibility verdict, so the palette can show
 * a direct wire distinctly from one that needs an adapter.
 *
 * [LAW:decomposition] Insertability and patch validation are two queries over the
 *   same port-compatibility algebra; this part answers the palette's question and
 *   nothing else.
 * [LAW:effects-at-boundaries] Pure over declared data: same registry + selection
 *   in, same candidate list out.
 */

import type {
  SceneRegistry,
  ScenePortDeclaration,
  ScenePortDirection,
  SceneValueKind,
} from './scene-block';
import {
  compareScenePorts,
  NATIVE_ADAPTATION_ROUTES,
  type AdaptationRoute,
  type PortCompatibility,
} from './port-compatibility';

/** The port the user has selected in the editor. */
export interface ScenePortSelection {
  readonly value: SceneValueKind;
  readonly direction: ScenePortDirection;
}

/** A catalog port that can connect to the selection, with how it connects. */
export interface ConnectableScenePort {
  readonly blockType: string;
  readonly displayName: string;
  readonly port: ScenePortDeclaration;
  readonly compatibility: PortCompatibility;
}

const OPPOSITE: Readonly<Record<ScenePortDirection, ScenePortDirection>> = {
  input: 'output',
  output: 'input',
};

/**
 * Orient the selection and a candidate into the directional (`from` → `to`) pair
 * the compatibility algebra expects: the output side is always `from`, the input
 * side always `to`.
 */
function orient(
  selection: ScenePortSelection,
  candidate: SceneValueKind,
): { readonly from: SceneValueKind; readonly to: SceneValueKind } {
  return selection.direction === 'output'
    ? { from: selection.value, to: candidate }
    : { from: candidate, to: selection.value };
}

function isConnectable(verdict: PortCompatibility): boolean {
  // A direct wire or an adapter-bridged wire is offerable; a mismatch or a
  // deferred (unsupported) kind is not a valid insertion.
  return verdict.kind === 'compatible' || verdict.kind === 'adaptationNeeded';
}

/**
 * The catalog ports that can receive or feed the selected port. A selected output
 * is matched against input ports; a selected input against output ports. Both
 * direct and adapter-bridged candidates are returned, tagged by verdict; the
 * palette decides how to present each.
 */
export function connectableScenePorts(
  registry: SceneRegistry,
  selection: ScenePortSelection,
  routes: readonly AdaptationRoute[] = NATIVE_ADAPTATION_ROUTES,
): readonly ConnectableScenePort[] {
  const wantDirection = OPPOSITE[selection.direction];
  const matches: ConnectableScenePort[] = [];
  for (const block of registry.catalog) {
    for (const port of block.ports) {
      if (port.direction !== wantDirection) continue;
      const { from, to } = orient(selection, port.value);
      const compatibility = compareScenePorts(from, to, routes);
      if (isConnectable(compatibility)) {
        matches.push({ blockType: block.type, displayName: block.displayName, port, compatibility });
      }
    }
  }
  return matches;
}
