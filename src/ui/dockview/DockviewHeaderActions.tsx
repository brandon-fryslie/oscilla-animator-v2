import React, { useEffect, useState } from 'react';
import { ActionIcon, Group, Tooltip } from '@mantine/core';
import type { IDockviewHeaderActionsProps } from 'dockview';
import {
  closeActivePanel,
  moveActivePanelToFloating,
  toggleMaximizeActivePanel,
} from './layoutActions';

const iconStyle: React.CSSProperties = {
  fontSize: 11,
  lineHeight: 1,
  fontWeight: 700,
};

export const DockviewLeftHeaderActions: React.FC<IDockviewHeaderActionsProps> = (props) => {
  void props;
  return null;
};

export const DockviewRightHeaderActions: React.FC<IDockviewHeaderActionsProps> = ({
  containerApi,
  activePanel,
}) => {
  const canActOnPanel = Boolean(activePanel);
  const protectedPanel = activePanel?.id === 'flow-editor';
  const nonFloatablePanelIds = new Set(['left-sidebar', 'right-sidebar']);
  const panelLocationType = activePanel?.group.api.location.type ?? activePanel?.api.location.type;
  const panelAlreadyFloating = panelLocationType === 'floating' || panelLocationType === 'popout';
  // [LAW:one-type-per-behavior] panel-specific actions are derived from panel
  // identity/capabilities, while common actions remain shared.
  const canFloat = Boolean(
    activePanel &&
    !panelAlreadyFloating &&
    !nonFloatablePanelIds.has(activePanel.id)
  );

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

  return (
    <Group gap={4} wrap="nowrap">
      {canFloat && (
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
      )}

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
