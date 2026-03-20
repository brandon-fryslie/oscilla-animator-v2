import React, { useCallback, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { PaneviewReact, type IPaneviewPanelProps, type PaneviewReadyEvent, type IDockviewPanelProps } from 'dockview';
import { BlockLibrary } from '../../components/BlockLibrary';
import { BlockInspector } from '../../components/BlockInspector';
import { DemoBrowserSidebar } from '../../components/DemoBrowserSidebar';
import { useStores } from '../../../stores';

const LEFT_SIDEBAR_COMPONENTS: Record<string, React.FC<IPaneviewPanelProps>> = {
  'left-sidebar-demos': () => <DemoBrowserSidebar />,
  'left-sidebar-library': () => <BlockLibrary />,
  'left-sidebar-inspector': () => <BlockInspector />,
};

export const LeftSidebarPanel: React.FC<IDockviewPanelProps> = observer(() => {
  const { selection } = useStores();
  const [paneviewApi, setPaneviewApi] = useState<PaneviewReadyEvent['api'] | null>(null);

  const inspectorDemand =
    selection.previewType !== null ||
    selection.selectedPort !== null ||
    selection.selectedEdgeId !== null ||
    selection.selectedBlockId !== null;

  const handleReady = useCallback((event: PaneviewReadyEvent) => {
    setPaneviewApi(event.api);

    if (event.api.panels.length > 0) {
      return;
    }

    // [LAW:one-source-of-truth] The left sidebar pane order is declared once
    // here so toolbar actions and restored layouts target the same container.
    event.api.addPanel({
      id: 'left-sidebar-demos-pane',
      component: 'left-sidebar-demos',
      title: 'Demos',
      isExpanded: true,
      minimumBodySize: 180,
      size: 360,
    });

    event.api.addPanel({
      id: 'left-sidebar-library-pane',
      component: 'left-sidebar-library',
      title: 'Block Library',
      isExpanded: false,
      minimumBodySize: 140,
      size: 320,
    });

    event.api.addPanel({
      id: 'left-sidebar-inspector-pane',
      component: 'left-sidebar-inspector',
      title: 'Inspector',
      isExpanded: false,
      minimumBodySize: 140,
      size: 280,
    });
  }, []);

  useEffect(() => {
    const inspectorPanel = paneviewApi?.getPanel('left-sidebar-inspector-pane');
    if (!inspectorPanel) {
      return;
    }

    // [LAW:single-enforcer] SelectionStore is the sole trigger for inspector
    // demand, so sidebar expansion derives only from canonical selection state.
    inspectorPanel.api.setExpanded(inspectorDemand);
  }, [inspectorDemand, paneviewApi]);

  return (
    <div style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
      <PaneviewReact
        className="oscilla-sidebar-paneview"
        components={LEFT_SIDEBAR_COMPONENTS}
        onReady={handleReady}
      />
    </div>
  );
});
