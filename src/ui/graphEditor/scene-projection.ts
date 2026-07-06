/**
 * scene-projection - project pillar/scene facts into the editor's neutral
 * presentation vocabulary.
 *
 * Shared by the pillar providers (PillarPatchAdapter, SceneBlockCatalog) so the
 * scene→neutral mapping lives in exactly one place. The sibling of
 * `neutral-projection` (which does the same for the V1 backend).
 * [LAW:one-source-of-truth]
 */

import type { SceneValueKind } from '../../pillars/scene/scene-block';
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
