import React, { useCallback } from 'react';
import { PaneviewReact, type IPaneviewPanelProps, type PaneviewReadyEvent, type IDockviewPanelProps } from 'dockview';
import { BlockLibrary } from '../../components/BlockLibrary';
import { BlockInspector } from '../../components/BlockInspector';

const LEFT_SIDEBAR_COMPONENTS: Record<string, React.FC<IPaneviewPanelProps>> = {
  'left-sidebar-library': () => <BlockLibrary />,
  'left-sidebar-inspector': () => <BlockInspector />,
};

export const LeftSidebarPanel: React.FC<IDockviewPanelProps> = () => {
  const handleReady = useCallback((event: PaneviewReadyEvent) => {
    if (event.api.panels.length > 0) {
      return;
    }

    event.api.addPanel({
      id: 'left-sidebar-library-pane',
      component: 'left-sidebar-library',
      title: 'Library',
      isExpanded: true,
      minimumBodySize: 140,
      size: 320,
    });

    event.api.addPanel({
      id: 'left-sidebar-inspector-pane',
      component: 'left-sidebar-inspector',
      title: 'Inspector',
      isExpanded: true,
      minimumBodySize: 140,
      size: 280,
    });
  }, []);

  return (
    <div style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
      <PaneviewReact
        className="oscilla-sidebar-paneview"
        components={LEFT_SIDEBAR_COMPONENTS}
        onReady={handleReady}
      />
    </div>
  );
};

