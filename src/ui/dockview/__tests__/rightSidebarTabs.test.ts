import { describe, expect, it } from 'vitest';
import { PANEL_DEFINITIONS, PANEL_MENU_ITEMS } from '../panelMetadata';
import { getRightSidebarTabForPanelRequest } from '../rightSidebarTabConfig';

describe('right sidebar layout defaults', () => {
  it('does not register the removed Step Debugger panel', () => {
    const stepDebugger = PANEL_DEFINITIONS.find((panel) => panel.id === 'step-debugger');

    expect(stepDebugger).toBeUndefined();
    expect(PANEL_MENU_ITEMS.some((item) => item.id === 'step-debugger')).toBe(false);
  });

  it('routes Debug and Settings requests to right-sidebar tabs', () => {
    expect(getRightSidebarTabForPanelRequest('debug-miniview')).toBe('right-sidebar-debug-pane');
    expect(getRightSidebarTabForPanelRequest('settings')).toBe('right-sidebar-settings-pane');
  });

  it('exposes Debug and Settings in the panel menu without listing the sidebar shell', () => {
    expect(PANEL_MENU_ITEMS).toContainEqual({ id: 'debug-miniview', title: 'Debug' });
    expect(PANEL_MENU_ITEMS).toContainEqual({ id: 'settings', title: 'Settings' });
    expect(PANEL_MENU_ITEMS.some((item) => item.id === 'right-sidebar')).toBe(false);
  });
});
