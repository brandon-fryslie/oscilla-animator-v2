/**
 * Default panel layout for the pillar (scene) era.
 *
 * Mirrors the intent of the retired hand-rolled NativeEditorLayout — palette on
 * the left, the node graph (with the table as a tab) in the center, and the live
 * Three preview prominent on the right with the inspector beneath it — but as
 * real dockview groups that dock, resize, and persist. The preview is a large
 * DOCKED panel (not the small floating one the V1 era uses), because for the
 * pillar editor the rendered scene is the primary output. [LAW:decomposition]
 */

import type { DockviewApi } from 'dockview';

export function createSceneLayout(api: DockviewApi): void {
  const paletteGroup = api.addGroup();
  const centerGroup = api.addGroup({ referenceGroup: paletteGroup, direction: 'right' });
  const previewGroup = api.addGroup({ referenceGroup: centerGroup, direction: 'right' });
  const inspectorGroup = api.addGroup({ referenceGroup: previewGroup, direction: 'below' });

  api.addPanel({
    id: 'scene-palette',
    component: 'scene-palette',
    title: 'Blocks',
    position: { referenceGroup: paletteGroup.id, direction: 'within' },
  });

  api.addPanel({
    id: 'scene-graph',
    component: 'scene-graph',
    title: 'Patch',
    position: { referenceGroup: centerGroup.id, direction: 'within' },
    minimumWidth: 240,
    minimumHeight: 200,
  });
  api.addPanel({
    id: 'scene-table',
    component: 'scene-table',
    title: 'Table',
    position: { referenceGroup: centerGroup.id, direction: 'within' },
  });
  api.getPanel('scene-graph')?.api.setActive();

  api.addPanel({
    id: 'preview',
    component: 'preview',
    title: 'Preview',
    position: { referenceGroup: previewGroup.id, direction: 'within' },
    minimumWidth: 200,
    minimumHeight: 200,
  });

  api.addPanel({
    id: 'scene-inspector',
    component: 'scene-inspector',
    title: 'Inspector',
    position: { referenceGroup: inspectorGroup.id, direction: 'within' },
    minimumHeight: 160,
  });

  paletteGroup.api.setSize({ width: 320 });
  previewGroup.api.setSize({ width: 460 });
  inspectorGroup.api.setSize({ height: 320 });
}
