/**
 * SceneGraphEditorPanel — the pillar era's flow-editor, hosted in the dockview
 * shell. Mounts the shared GraphEditorCore over the authored pillar patch via the
 * neutral seams (PillarPatchAdapter / SceneTypeOracle / SceneEdgeDecorator), so
 * the SAME editor that renders the V1 patch renders and edits the pillar patch.
 * Edits flow to PillarPatchStore, whose compiled ScenePlan drives the live Three
 * preview — the loop closes with no extra wiring. [LAW:one-source-of-truth]
 *
 * This is the dockview host the spike (nt8lsn.14) deferred here: the mature editor
 * is now one docked panel in the unified shell, no longer a hand-rolled center-pane
 * view. It reads the same PillarPatchStore as the modulation-table panel, so the
 * two panels are alternate projections of one patch. [FRAMING:representation]
 */

import React, { useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import type { IDockviewPanelProps } from 'dockview';
import { useStores } from '../../../../stores';
import { PillarPatchAdapter } from '../../../graphEditor/PillarPatchAdapter';
import { SceneTypeOracle } from '../../../graphEditor/SceneTypeOracle';
import { SceneEdgeDecorator } from '../../../graphEditor/SceneEdgeDecorator';
import { GraphEditorCore } from '../../../graphEditor/GraphEditorCore';

export const SceneGraphEditorPanel: React.FC<IDockviewPanelProps> = observer(() => {
  const { pillarPatch, selection } = useStores();

  // PillarPatchAdapter seeds deterministic left→right positions, so the graph is
  // readable on first paint and GraphEditorCore's own fitView frames it.
  const adapter = useMemo(() => new PillarPatchAdapter(pillarPatch), [pillarPatch]);

  // The scene type oracle judges every wire by the pillar port-compatibility
  // algebra (compareScenePorts) — the same one validateScenePatch reports
  // against — so the drag gate agrees with the compiler. [LAW:one-source-of-truth]
  const oracle = useMemo(() => new SceneTypeOracle(pillarPatch), [pillarPatch]);

  // The scene decorator traces each edge's pillar transform chain (Scale/Offset/
  // Clamp) — the same chain the modulation table reads — so the canvas shows and
  // edits it as edge chips. [LAW:one-source-of-truth]
  const decorator = useMemo(() => new SceneEdgeDecorator(pillarPatch), [pillarPatch]);

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <GraphEditorCore adapter={adapter} oracle={oracle} decorator={decorator} selection={selection} />
    </div>
  );
});
