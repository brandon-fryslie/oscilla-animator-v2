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
import { observer } from 'mobx-react-lite';
import type { DockviewApi } from 'dockview';
import { useStore } from '../../../stores';
import { clearStorageAndReload } from '../../../services/PatchPersistence';
import { useExportPatch } from '../../hooks/useExportPatch';
import { Toast } from '../common/Toast';
import {
  openOrFocusPanel,
  resetDockviewLayout,
  toggleSidebar,
} from '../../dockview/layoutActions';
import { PANEL_DEFINITIONS } from '../../dockview/panelRegistry';

interface ToolbarProps {
  stats?: string;
  dockviewApi?: DockviewApi | null;
}

export const Toolbar: React.FC<ToolbarProps> = observer(({ stats = 'FPS: --', dockviewApi }) => {
  const camera = useStore('camera');
  const patch = useStore('patch');
  const demo = useStore('demo');
  const viewport = useStore('viewport');
  const diagnostics = useStore('diagnostics');

  const exportPatch = useExportPatch();

  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastSeverity, setToastSeverity] = useState<'success' | 'error'>('success');

  const visiblePanels = useMemo(
    () => PANEL_DEFINITIONS.filter((panel) => !panel.initiallyHidden),
    []
  );

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

  const handleDemoSelect = (filename: string) => {
    const loaded = demo.selectDemo(filename);
    if (!loaded) {
      setToastMessage(`Failed to load demo: ${filename}`);
      setToastSeverity('error');
      setToastOpen(true);
      return;
    }
    viewport.resetView();
    setToastMessage(`Loaded demo: ${filename}`);
    setToastSeverity('success');
    setToastOpen(true);
  };

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
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
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
              }}
            >
              <Text fw={700} size="sm" c="white">O</Text>
            </Box>
            <Text
              fw={600}
              size="lg"
              variant="gradient"
              gradient={{ from: 'violet', to: 'grape', deg: 45 }}
            >
              Oscilla v2
            </Text>
            <Badge
              size="xs"
              variant="gradient"
              gradient={{ from: 'violet', to: 'grape', deg: 90 }}
              style={{ textTransform: 'uppercase' }}
            >
              Alpha
            </Badge>
          </Group>

          <Group gap="xs">
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

            <Menu shadow="md" width={220} withinPortal>
              <Menu.Target>
                <Button variant="subtle" color="gray" size="xs">Patch</Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={handleNewPatch}>New</Menu.Item>
                <Menu.Item disabled>Save</Menu.Item>
                <Menu.Item disabled>Load</Menu.Item>
                <Menu.Item onClick={handleExport}>Export</Menu.Item>
                <Menu.Divider />
                <Menu.Item onClick={clearStorageAndReload}>Reset Storage</Menu.Item>
              </Menu.Dropdown>
            </Menu>

            <Menu shadow="md" width={260} withinPortal>
              <Menu.Target>
                <Button variant="subtle" color="gray" size="xs">Demos</Button>
              </Menu.Target>
              <Menu.Dropdown>
                {demo.demos.map((item) => (
                  <Menu.Item
                    key={item.filename}
                    onClick={() => handleDemoSelect(item.filename)}
                  >
                    {item.name}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>

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

            <Menu shadow="md" width={240} withinPortal>
              <Menu.Target>
                <Button variant="subtle" color="gray" size="xs">Panels</Button>
              </Menu.Target>
              <Menu.Dropdown>
                {visiblePanels.map((panel) => (
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

            <Button
              variant={camera.isActive ? 'gradient' : 'subtle'}
              gradient={{ from: 'violet', to: 'grape', deg: 90 }}
              color="gray"
              size="xs"
              onClick={() => camera.toggle()}
            >
              3D
            </Button>

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
        </Group>
      </Box>

      <Toast
        open={toastOpen}
        message={toastMessage}
        severity={toastSeverity}
        onClose={() => setToastOpen(false)}
      />
    </>
  );
});
