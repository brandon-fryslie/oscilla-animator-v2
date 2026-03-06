import React from 'react';
import type { IPaneviewPanelProps } from 'dockview';
import { SettingsPanel } from '../components/SettingsPanel';
import { DebugMiniView } from '../debug-viz/DebugMiniView';
import {
  getRightSidebarTabForPanelRequest,
  RIGHT_SIDEBAR_DEFAULT_TAB_ID,
  RIGHT_SIDEBAR_TAB_DEFINITIONS,
  type RightSidebarTabId,
} from './rightSidebarTabConfig';

const DebugSidebarTab: React.FC<IPaneviewPanelProps> = () => <DebugMiniView />;
const SettingsSidebarTab: React.FC<IPaneviewPanelProps> = () => <SettingsPanel />;

export const RIGHT_SIDEBAR_COMPONENTS: Record<string, React.FC<IPaneviewPanelProps>> = {
  'right-sidebar-debug': DebugSidebarTab,
  'right-sidebar-settings': SettingsSidebarTab,
};

type RightSidebarTabListener = (tabId: RightSidebarTabId) => void;

const rightSidebarTabListeners = new Set<RightSidebarTabListener>();
let requestedRightSidebarTabId: RightSidebarTabId = RIGHT_SIDEBAR_DEFAULT_TAB_ID;

export function getRequestedRightSidebarTabId(): RightSidebarTabId {
  return requestedRightSidebarTabId;
}

export function requestRightSidebarTabByPanel(panelId: string): RightSidebarTabId | null {
  const tabId = getRightSidebarTabForPanelRequest(panelId);
  if (!tabId) {
    return null;
  }
  requestedRightSidebarTabId = tabId;
  rightSidebarTabListeners.forEach((listener) => listener(tabId));
  return tabId;
}

export function subscribeRightSidebarTabRequests(listener: RightSidebarTabListener): () => void {
  rightSidebarTabListeners.add(listener);
  return () => {
    rightSidebarTabListeners.delete(listener);
  };
}

export {
  getRightSidebarTabForPanelRequest,
  RIGHT_SIDEBAR_DEFAULT_TAB_ID,
  RIGHT_SIDEBAR_TAB_DEFINITIONS,
};
export type { RightSidebarTabId } from './rightSidebarTabConfig';
