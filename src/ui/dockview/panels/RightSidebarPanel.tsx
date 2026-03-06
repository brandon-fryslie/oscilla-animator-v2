import React, { useCallback, useEffect, useState } from 'react';
import { PaneviewReact, type PaneviewReadyEvent, type IDockviewPanelProps } from 'dockview';
import {
  getRequestedRightSidebarTabId,
  RIGHT_SIDEBAR_COMPONENTS,
  RIGHT_SIDEBAR_TAB_DEFINITIONS,
  subscribeRightSidebarTabRequests,
  type RightSidebarTabId,
} from '../rightSidebarTabs';

export const RightSidebarPanel: React.FC<IDockviewPanelProps> = () => {
  const [paneApi, setPaneApi] = useState<PaneviewReadyEvent['api'] | null>(null);

  const activateTab = useCallback(
    (api: PaneviewReadyEvent['api'], tabId: RightSidebarTabId) => {
      api.getPanel(tabId)?.api.setActive();
    },
    []
  );

  const handleReady = useCallback((event: PaneviewReadyEvent) => {
    // [LAW:dataflow-not-control-flow] Reconcile the complete right-sidebar tab
    // set on readiness; existing tab data decides which add operations no-op.
    RIGHT_SIDEBAR_TAB_DEFINITIONS.forEach((tab) => {
      if (event.api.getPanel(tab.id)) {
        return;
      }

      event.api.addPanel({
        id: tab.id,
        component: tab.component,
        title: tab.title,
        isExpanded: true,
        minimumBodySize: tab.minimumBodySize,
        size: tab.size,
      });
    });

    activateTab(event.api, getRequestedRightSidebarTabId());
    setPaneApi(event.api);
  }, [activateTab]);

  useEffect(() => {
    if (!paneApi) {
      return;
    }

    const activateRequestedTab = (tabId: RightSidebarTabId) => {
      activateTab(paneApi, tabId);
    };

    activateRequestedTab(getRequestedRightSidebarTabId());
    return subscribeRightSidebarTabRequests(activateRequestedTab);
  }, [activateTab, paneApi]);

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
