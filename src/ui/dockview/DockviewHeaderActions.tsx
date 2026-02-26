import React from 'react';
import { ActionIcon, Group, Menu, Tooltip } from '@mantine/core';
import type { IDockviewHeaderActionsProps } from 'dockview';
import {
  closeActivePanel,
  moveActivePanelToFloating,
  toggleMaximizeActivePanel,
  toggleSidebar,
  toggleSidebars,
} from './layoutActions';

const iconStyle: React.CSSProperties = {
  fontSize: 11,
  lineHeight: 1,
  fontWeight: 700,
};

export const DockviewRightHeaderActions: React.FC<IDockviewHeaderActionsProps> = ({
  containerApi,
  activePanel,
}) => {
  const canActOnPanel = Boolean(activePanel);
  const isMaximized = activePanel?.api.isMaximized() ?? false;

  return (
    <Group gap={4} wrap="nowrap">
      <Menu shadow="md" width={190} position="bottom-end" withinPortal>
        <Menu.Target>
          <Tooltip label="Sidebars" withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="Sidebar menu"
            >
              <span style={iconStyle}>☰</span>
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={() => toggleSidebars(containerApi)}>
            Toggle Sidebars
          </Menu.Item>
          <Menu.Item onClick={() => toggleSidebar(containerApi, 'left')}>
            Toggle Left Sidebar
          </Menu.Item>
          <Menu.Item onClick={() => toggleSidebar(containerApi, 'right')}>
            Toggle Right Sidebar
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <Tooltip label="Float Active Panel" withArrow>
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

      <Tooltip label={isMaximized ? 'Restore' : 'Maximize'} withArrow>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          disabled={!canActOnPanel}
          aria-label={isMaximized ? 'Restore panel' : 'Maximize panel'}
          onClick={() => toggleMaximizeActivePanel(containerApi)}
        >
          <span style={iconStyle}>{isMaximized ? '❐' : '□'}</span>
        </ActionIcon>
      </Tooltip>

      <Tooltip label="Close Active Panel" withArrow>
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
    </Group>
  );
};
