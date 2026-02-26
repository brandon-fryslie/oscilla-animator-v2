import React, { useEffect, useMemo, useState } from 'react';
import { ActionIcon, Group, Tooltip } from '@mantine/core';
import type { IDockviewHeaderActionsProps } from 'dockview';
import {
  closeActivePanel,
  isSidebarCollapsed,
  moveActivePanelToFloating,
  toggleMaximizeActivePanel,
  toggleSidebar,
  getSidebarForPanel,
} from './layoutActions';
import type { SidebarSide } from './sidebarConfig';

const iconStyle: React.CSSProperties = {
  fontSize: 11,
  lineHeight: 1,
  fontWeight: 700,
};

function getSidebarForGroup(props: IDockviewHeaderActionsProps): SidebarSide | null {
  for (const panel of props.panels) {
    const side = getSidebarForPanel(panel.id);
    if (side) {
      return side;
    }
  }
  return null;
}

export const DockviewLeftHeaderActions: React.FC<IDockviewHeaderActionsProps> = (props) => {
  const groupSidebar = useMemo(() => getSidebarForGroup(props), [props.panels]);
  const showLeftToggle = groupSidebar !== 'right';
  if (!showLeftToggle) {
    return null;
  }

  const collapsed = isSidebarCollapsed(props.containerApi, 'left');
  const tooltip = collapsed ? 'Expand left sidebar' : 'Collapse left sidebar';

  return (
    <Group gap={4} wrap="nowrap">
      <Tooltip label={tooltip} withArrow>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label={tooltip}
          onClick={() => toggleSidebar(props.containerApi, 'left')}
        >
          <span style={iconStyle}>☰</span>
        </ActionIcon>
      </Tooltip>
    </Group>
  );
};

export const DockviewRightHeaderActions: React.FC<IDockviewHeaderActionsProps> = ({
  containerApi,
  activePanel,
  panels,
}) => {
  const groupSidebar = useMemo(() => {
    for (const panel of panels) {
      const side = getSidebarForPanel(panel.id);
      if (side) {
        return side;
      }
    }
    return null;
  }, [panels]);

  const showRightToggle = groupSidebar !== 'left';
  const canActOnPanel = Boolean(activePanel);
  const protectedPanel = activePanel?.id === 'flow-editor';

  const [isMaximized, setIsMaximized] = useState(activePanel?.api.isMaximized() ?? false);
  useEffect(() => {
    setIsMaximized(activePanel?.api.isMaximized() ?? false);
    const d1 = containerApi.onDidMaximizedGroupChange(() => {
      setIsMaximized(activePanel?.api.isMaximized() ?? false);
    });
    const d2 = containerApi.onDidActivePanelChange(() => {
      setIsMaximized(containerApi.activePanel?.api.isMaximized() ?? false);
    });
    return () => {
      d1.dispose();
      d2.dispose();
    };
  }, [containerApi, activePanel]);

  const rightCollapsed = isSidebarCollapsed(containerApi, 'right');
  const rightTooltip = rightCollapsed ? 'Expand right sidebar' : 'Collapse right sidebar';

  return (
    <Group gap={4} wrap="nowrap">
      {showRightToggle && (
        <Tooltip label={rightTooltip} withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={rightTooltip}
            onClick={() => toggleSidebar(containerApi, 'right')}
          >
            <span style={iconStyle}>☰</span>
          </ActionIcon>
        </Tooltip>
      )}

      <Tooltip label="Float active panel" withArrow>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          disabled={!canActOnPanel}
          aria-label="Float active panel"
          onClick={() => moveActivePanelToFloating(containerApi)}
        >
          <span style={iconStyle}>◱</span>
        </ActionIcon>
      </Tooltip>

      <Tooltip label={isMaximized ? 'Unmaximize panel' : 'Maximize panel'} withArrow>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          disabled={!canActOnPanel}
          aria-label={isMaximized ? 'Unmaximize panel' : 'Maximize panel'}
          onClick={() => toggleMaximizeActivePanel(containerApi)}
        >
          <span style={iconStyle}>{isMaximized ? '❐' : '□'}</span>
        </ActionIcon>
      </Tooltip>

      {!protectedPanel && (
        <Tooltip label="Close active panel" withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            disabled={!canActOnPanel}
            aria-label="Close active panel"
            onClick={() => closeActivePanel(containerApi)}
          >
            <span style={iconStyle}>×</span>
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
};

