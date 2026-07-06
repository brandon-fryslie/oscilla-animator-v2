/**
 * src/ui/nativeEditor/NativeMatureGraphCanvas.tsx
 *
 * SPIKE (oscilla-editor-ux-8lsn.14): mounts the mature ReactFlow editor
 * (GraphEditorCore + UnifiedNode) over the pillar patch via PillarPatchAdapter.
 *
 * This is the proving surface for the neutral GraphDataAdapter seam: the same
 * editor that renders the V1 patch here renders and edits the authored pillar
 * patch. Edits flow to PillarPatchStore, whose `compiled` computed drives the
 * live ScenePlan preview (RuntimeService) — the loop is closed with no extra
 * wiring. It reads the same PillarPatchStore as the native Graph/Table views, so
 * switching tabs is a projection choice. [LAW:one-source-of-truth]
 *
 * The mature editor's dockview host is deferred to oscilla-editor-ux-8lsn.20;
 * here it is one center-pane view alongside the native graph for side-by-side
 * equality.
 */

import React, { useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../stores';
import { PillarPatchAdapter } from '../graphEditor/PillarPatchAdapter';
import { SceneTypeOracle } from '../graphEditor/SceneTypeOracle';
import { GraphEditorCore } from '../graphEditor/GraphEditorCore';

export const NativeMatureGraphCanvas: React.FC = observer(() => {
  const { pillarPatch } = useStores();
  const adapter = useMemo(() => new PillarPatchAdapter(pillarPatch), [pillarPatch]);

  // Layout: PillarPatchAdapter seeds deterministic left→right positions, so the
  // graph is readable on first paint and GraphEditorCore's own fitView frames
  // it — no post-mount auto-layout pass, hence no timing/ref race to manage.
  //
  // Connection validation: the scene type oracle judges every wire by the pillar
  // port-compatibility algebra (compareScenePorts) — the same one validateScenePatch
  // reports against — so the drag gate agrees with the compiler. [LAW:one-source-of-truth]
  const oracle = useMemo(() => new SceneTypeOracle(pillarPatch), [pillarPatch]);

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <GraphEditorCore adapter={adapter} oracle={oracle} />
    </div>
  );
});
