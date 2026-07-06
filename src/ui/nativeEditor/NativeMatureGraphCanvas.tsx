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

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../stores';
import { PillarPatchAdapter } from '../graphEditor/PillarPatchAdapter';
import { GraphEditorCore, type GraphEditorCoreHandle } from '../graphEditor/GraphEditorCore';

export const NativeMatureGraphCanvas: React.FC = observer(() => {
  const { pillarPatch } = useStores();
  const adapter = useMemo(() => new PillarPatchAdapter(pillarPatch), [pillarPatch]);
  const coreRef = useRef<GraphEditorCoreHandle | null>(null);
  const arrangedRef = useRef(false);

  const handleReady = useCallback((handle: GraphEditorCoreHandle) => {
    coreRef.current = handle;
  }, []);

  // Seed a left→right ELK layout once nodes exist (PillarPatchStore has no
  // stored positions; without this every node stacks at the origin). The rAF
  // lets GraphEditorCore reconcile nodes from the adapter before we arrange.
  const blockCount = pillarPatch.patch.blocks.length;
  useEffect(() => {
    if (arrangedRef.current || blockCount === 0) return;
    arrangedRef.current = true;
    const raf = requestAnimationFrame(() => {
      coreRef.current
        ?.autoArrange()
        .then(() => coreRef.current?.zoomToFit())
        .catch((err: unknown) => console.error('Mature pillar graph layout failed:', err));
    });
    return () => cancelAnimationFrame(raf);
  }, [blockCount]);

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <GraphEditorCore ref={coreRef} adapter={adapter} onEditorReady={handleReady} />
    </div>
  );
});
