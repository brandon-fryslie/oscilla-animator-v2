import React, { useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Menu,
  Text,
  Tooltip,
  rem,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { observer } from 'mobx-react-lite';
import type { DockviewApi } from 'dockview';
import { useStore } from '../../../stores';
import { clearStorageAndReload } from '../../../services/PatchPersistence';
import { useExportPatch } from '../../hooks/useExportPatch';
import { Toast } from '../common/Toast';
import { copyBoundaryFixtureJsonFromBridge } from './boundary-fixture-copy';
import {
  openOrFocusPanel,
  resetDockviewLayout,
  toggleSidebar,
} from '../../dockview/layoutActions';
import { PANEL_MENU_ITEMS } from '../../dockview/panelRegistry';

interface ToolbarProps {
  stats?: string;
  dockviewApi?: DockviewApi | null;
}

export const Toolbar: React.FC<ToolbarProps> = observer(({ stats = 'FPS: --', dockviewApi }) => {
  const camera = useStore('camera');
  const patch = useStore('patch');
  const diagnostics = useStore('diagnostics');
  const isMobile = useMediaQuery('(max-width: 48em)');

  const exportPatch = useExportPatch();

  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastSeverity, setToastSeverity] = useState<'success' | 'error'>('success');

  const panelMenuItems = useMemo(() => PANEL_MENU_ITEMS, []);

  const handleExport = async () => {
    const result = await exportPatch();
    setToastMessage(result.message);
    setToastSeverity(result.success ? 'success' : 'error');
    setToastOpen(true);
    if (!result.success && result.error) {
      diagnostics.log({
        level: 'error',
        message: `Export error: ${result.error}`,
      });
    }
  };

  const handleNewPatch = () => {
    if (!confirm('Create a new patch? This clears the current patch.')) {
      return;
    }
    patch.clear();
    setToastMessage('New patch created');
    setToastSeverity('success');
    setToastOpen(true);
  };

  const handleCopyBoundaryFixtureJson = async () => {
    const result = await copyBoundaryFixtureJsonFromBridge();
    setToastMessage(result.message);
    setToastSeverity(result.success ? 'success' : 'error');
    setToastOpen(true);
    if (!result.success && result.error) {
      diagnostics.log({
        level: 'error',
        message: `Boundary fixture copy error: ${result.error.message}`,
      });
    }
  };

  const patchMenu = (
    <Menu shadow="md" width={220} withinPortal>
      <Menu.Target>
        <Button variant="subtle" color="gray" size="xs">Patch</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={handleNewPatch}>New</Menu.Item>
        <Menu.Item disabled>Save</Menu.Item>
        <Menu.Item disabled>Load</Menu.Item>
        <Menu.Item onClick={handleExport}>Export</Menu.Item>
        <Menu.Item onClick={handleCopyBoundaryFixtureJson}>Copy Boundary Fixture JSON</Menu.Item>
        <Menu.Divider />
        <Menu.Item onClick={clearStorageAndReload}>Reset Storage</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );

  const layoutMenu = (
    <Menu shadow="md" width={220} withinPortal>
      <Menu.Target>
        <Button variant="subtle" color="gray" size="xs">Layout</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          onClick={() => dockviewApi && toggleSidebar(dockviewApi, 'left')}
          disabled={!dockviewApi}
        >
          Toggle Left Sidebar
        </Menu.Item>
        <Menu.Item
          onClick={() => dockviewApi && toggleSidebar(dockviewApi, 'right')}
          disabled={!dockviewApi}
        >
          Toggle Right Sidebar
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          onClick={() => dockviewApi && resetDockviewLayout(dockviewApi)}
          disabled={!dockviewApi}
        >
          Reset Layout
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );

  const panelsMenu = (
    <Menu shadow="md" width={240} withinPortal>
      <Menu.Target>
        <Button variant="subtle" color="gray" size="xs">Panels</Button>
      </Menu.Target>
      <Menu.Dropdown>
        {panelMenuItems.map((panel) => (
          <Menu.Item
            key={panel.id}
            onClick={() => dockviewApi && openOrFocusPanel(dockviewApi, panel.id)}
            disabled={!dockviewApi}
          >
            {panel.title}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );

  const mobileActionsMenu = (
    <Menu shadow="md" width={280} withinPortal>
      <Menu.Target>
        <Button variant="subtle" color="gray" size="xs">Menu</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Patch</Menu.Label>
        <Menu.Item onClick={handleNewPatch}>New Patch</Menu.Item>
        <Menu.Item onClick={handleExport}>Export Patch</Menu.Item>
        <Menu.Item onClick={handleCopyBoundaryFixtureJson}>Copy Boundary Fixture JSON</Menu.Item>
        <Menu.Item onClick={clearStorageAndReload}>Reset Storage</Menu.Item>
        <Menu.Divider />
        <Menu.Label>Layout</Menu.Label>
        <Menu.Item onClick={() => dockviewApi && toggleSidebar(dockviewApi, 'left')} disabled={!dockviewApi}>
          Toggle Left Sidebar
        </Menu.Item>
        <Menu.Item onClick={() => dockviewApi && toggleSidebar(dockviewApi, 'right')} disabled={!dockviewApi}>
          Toggle Right Sidebar
        </Menu.Item>
        <Menu.Item onClick={() => dockviewApi && resetDockviewLayout(dockviewApi)} disabled={!dockviewApi}>
          Reset Layout
        </Menu.Item>
        <Menu.Divider />
        <Menu.Label>Panels</Menu.Label>
        {panelMenuItems.map((panel) => (
          <Menu.Item
            key={panel.id}
            onClick={() => dockviewApi && openOrFocusPanel(dockviewApi, panel.id)}
            disabled={!dockviewApi}
          >
            {panel.title}
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Item onClick={() => camera.toggle()}>
          {camera.isActive ? 'Disable 3D Camera' : 'Enable 3D Camera'}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );

  return (
    <>
      <Box
        component="header"
        style={{
          flexShrink: 0,
          height: rem(52),
          background: 'linear-gradient(180deg, rgba(30, 30, 46, 0.98) 0%, rgba(24, 24, 37, 0.98) 100%)',
          borderBottom: '1px solid rgba(139, 92, 246, 0.15)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <Group h="100%" px={isMobile ? 'xs' : 'md'} justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Tooltip label="Toggle left sidebar" withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Toggle left sidebar"
                onClick={() => dockviewApi && toggleSidebar(dockviewApi, 'left')}
              >
                <span style={{ fontSize: rem(13), fontWeight: 700 }}>☰</span>
              </ActionIcon>
            </Tooltip>
            <Box
              style={{
                width: rem(32),
                height: rem(32),
                borderRadius: rem(8),
                background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 50%, #F59E0B 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)',
                flexShrink: 0,
              }}
            >
              <Text fw={700} size="sm" c="white">O</Text>
            </Box>
            <Group gap="xs" wrap="nowrap">
              <Text
                fw={600}
                size={isMobile ? 'md' : 'lg'}
                variant="gradient"
                gradient={{ from: 'violet', to: 'grape', deg: 45 }}
              >
                Oscilla v2
              </Text>
              {!isMobile && (
                <Badge
                  size="xs"
                  variant="gradient"
                  gradient={{ from: 'violet', to: 'grape', deg: 90 }}
                  style={{ textTransform: 'uppercase' }}
                >
                  Alpha
                </Badge>
              )}
            </Group>

            <Button
              variant="gradient"
              gradient={{ from: 'violet', to: 'grape', deg: 90 }}
              color="gray"
              size="xs"
              onClick={() => dockviewApi && openOrFocusPanel(dockviewApi, 'left-sidebar')}
              disabled={!dockviewApi}
            >
              Demos
            </Button>

            {isMobile ? (
              mobileActionsMenu
            ) : (
              <>
                {patchMenu}
                {layoutMenu}
                {panelsMenu}
                <Button
                  variant={camera.isActive ? 'gradient' : 'subtle'}
                  gradient={{ from: 'violet', to: 'grape', deg: 90 }}
                  color="gray"
                  size="xs"
                  onClick={() => camera.toggle()}
                >
                  3D
                </Button>
              </>
            )}

            <Tooltip label="Toggle right sidebar" withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Toggle right sidebar"
                onClick={() => dockviewApi && toggleSidebar(dockviewApi, 'right')}
              >
                <span style={{ fontSize: rem(13), fontWeight: 700 }}>☰</span>
              </ActionIcon>
            </Tooltip>
          </Group>

          <Group gap="xs" wrap="nowrap">
            {diagnostics.gpuFaultState && (
              <Tooltip
                label={diagnostics.gpuFaultState.message}
                withArrow
                multiline
                w={300}
              >
                <Badge
                  variant="filled"
                  color={diagnostics.gpuFaultState.severity === 'fatal' ? 'red' : 'orange'}
                  size="lg"
                  radius="md"
                  styles={{
                    root: {
                      fontFamily: 'var(--mantine-font-family-monospace)',
                      fontWeight: 700,
                      fontSize: rem(11),
                      padding: `${rem(4)} ${rem(12)}`,
                      cursor: 'help',
                    },
                  }}
                >
                  {diagnostics.gpuFaultState.severity === 'fatal' ? 'GPU LOST' : 'GPU ERROR'}
                </Badge>
              </Tooltip>
            )}

            {!isMobile && (
              <Badge
                variant="outline"
                color="dark"
                size="lg"
                radius="md"
                styles={{
                  root: {
                    fontFamily: 'var(--mantine-font-family-monospace)',
                    fontWeight: 500,
                    fontSize: rem(11),
                    padding: `${rem(4)} ${rem(12)}`,
                    borderColor: 'rgba(139, 92, 246, 0.3)',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  },
                }}
              >
                {stats}
              </Badge>
            )}
          </Group>
        </Group>
      </Box>

      <Toast
        message={toastMessage}
        open={toastOpen}
        onClose={() => setToastOpen(false)}
        severity={toastSeverity}
      />
    </>
  );
});
