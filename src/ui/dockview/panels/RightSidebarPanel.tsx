import React, { useCallback } from 'react';
import { PaneviewReact, type IPaneviewPanelProps, type PaneviewReadyEvent, type IDockviewPanelProps } from 'dockview';
import { SettingsPanel } from '../../components/SettingsPanel';

const RIGHT_SIDEBAR_COMPONENTS: Record<string, React.FC<IPaneviewPanelProps>> = {
  'right-sidebar-settings': () => <SettingsPanel />,
};

export const RightSidebarPanel: React.FC<IDockviewPanelProps> = () => {
  const handleReady = useCallback((event: PaneviewReadyEvent) => {
    if (event.api.panels.length > 0) {
      return;
    }

    event.api.addPanel({
      id: 'right-sidebar-settings-pane',
      component: 'right-sidebar-settings',
      title: 'Settings',
      isExpanded: true,
      minimumBodySize: 120,
      size: 1,
    });
  }, []);

  return (
    <div style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
      <PaneviewReact
        className="oscilla-sidebar-paneview"
        components={RIGHT_SIDEBAR_COMPONENTS}
        onReady={handleReady}
      />
    </div>
  );
};

