/**
 * scene-projection - project pillar/scene facts into the editor's neutral
 * presentation vocabulary.
 *
 * Shared by the pillar providers (PillarPatchAdapter, SceneBlockCatalog) so the
 * scene→neutral mapping lives in exactly one place. The sibling of
 * `neutral-projection` (which does the same for the V1 backend).
 * [LAW:one-source-of-truth]
 */

import type { SceneValueKind, SceneConfigControl } from '../../pillars/scene/scene-block';
import type { UIControlHint } from '../../types';
import type { PortTypeDisplay } from './types';

/** Neutral swatch color per scene value kind (parallels the V1 payload palette). */
const SCENE_VALUE_COLORS: Record<SceneValueKind, string> = {
  instanceBundle: '#f59e0b',
  geometry: '#a78bfa',
  materialShell: '#38bdf8',
  texture: '#f472b6',
  camera: '#8b5cf6',
  color: '#ec4899',
  scalar: '#5a9fd4',
  mask: '#10b981',
};

/** Neutral presentation of a scene value kind (a port's type on the pillar side). */
export function sceneTypeDisplay(value: SceneValueKind): PortTypeDisplay {
  return {
    label: value,
    tooltip: value,
    color: SCENE_VALUE_COLORS[value] ?? '#888888',
    compatibilityToken: value,
  };
}

/**
 * Map a scene config control to the editor's neutral widget hint. The numeric and
 * boolean/color controls map exactly; controls that carry data the flat catalog
 * does not surface (`select` options, asset/colorList pickers) return undefined,
 * so a neutral editor falls back to a value-directed widget rather than inventing
 * an empty picker — an explicit deferral, not a silent gap. A new
 * SceneConfigControl is a compile error here, forcing a decision.
 * [LAW:no-silent-failure] [LAW:one-source-of-truth]
 */
export function sceneControlToHint(control: SceneConfigControl): UIControlHint | undefined {
  switch (control) {
    case 'number':
      return { kind: 'float' };
    case 'integer':
      return { kind: 'int' };
    case 'color':
      return { kind: 'color' };
    case 'toggle':
      return { kind: 'boolean' };
    case 'select':
    case 'asset':
    case 'colorList':
      return undefined;
    default: {
      const _exhaustive: never = control;
      throw new Error(`Unhandled SceneConfigControl: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
