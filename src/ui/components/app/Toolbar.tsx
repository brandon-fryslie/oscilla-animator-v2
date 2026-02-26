/**
 * Toolbar Component
 *
 * Top toolbar with app title, performance stats, and export functionality.
 * Uses Mantine for a gorgeous, modern look.
 */

import React, { useState, useMemo } from 'react';
import {
  Group,
  Button,
  Text,
  Badge,
  Box,
  Tooltip,
  Select,
  ActionIcon,
  Menu,
  rem,
} from '@mantine/core';
import { observer } from 'mobx-react-lite';
import { useStore } from '../../../stores';
import { useExportPatch } from '../../hooks/useExportPatch';
import { clearStorageAndReload } from '../../../services/PatchPersistence';
import type { DockviewApi } from 'dockview';
import { Toast } from '../common/Toast';
import {
  openOrFocusPanel,
  resetDockviewLayout,
  toggleSidebar,
  toggleSidebars,
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
  const diagnostics = useStore('diagnostics');
  const exportPatch = useExportPatch();
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastSeverity, setToastSeverity] = useState<'success' | 'error'>('success');

  // Derive Select data from DemoStore (stable unless demos change — they don't)
  const demoSelectData = useMemo(
    () => demo.demos.map(d => ({ label: d.name, value: d.filename })),
    [demo.demos],
  );

  const handleDemoChange = (value: string | null) => {
    if (value === null) return;
    demo.selectDemo(value);
  };

  const handleExport = async () => {
    const result = await exportPatch();
    setToastMessage(result.message);
    setToastSeverity(result.success ? 'success' : 'error');
    setToastOpen(true);

    if (!result.success && result.error) {
      // [LAW:single-enforcer] Toolbar routes export failures through diagnostics.
      diagnostics.log({
        level: 'error',
        message: `Export error: ${result.error}`,
      });
    }
  };

  const handleToastClose = () => {
    setToastOpen(false);
  };

  const handleResetLocalStorage = () => {
    clearStorageAndReload();
  };

  const handleToggleLeftSidebar = () => {
    if (!dockviewApi) return;
    toggleSidebar(dockviewApi, 'left');
  };

  const handleToggleRightSidebar = () => {
    if (!dockviewApi) return;
    toggleSidebar(dockviewApi, 'right');
  };

  const handleToggleBothSidebars = () => {
    if (!dockviewApi) return;
    toggleSidebars(dockviewApi);
  };

  const handleResetLayout = () => {
    if (!dockviewApi) return;
    resetDockviewLayout(dockviewApi);
  };

  const handleOpenPanel = (panelId: string) => {
    if (!dockviewApi) return;
    openOrFocusPanel(dockviewApi, panelId);
  };

  const handleNewPatch = () => {
    if (confirm('Create a new patch? This will clear the current patch.')) {
      patch.clear();
      setToastMessage('New patch created');
      setToastSeverity('success');
      setToastOpen(true);
    }
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
          {/* Logo and Title */}
          <Group gap="sm">
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

          {/* Preset Selector + Stats and Actions */}
          <Group gap="md">
            {/* Demo Dropdown */}
            {demoSelectData.length > 0 && (
              <Select
                data={demoSelectData}
                value={demo.currentFilename}
                onChange={handleDemoChange}
                searchable
                placeholder="Select demo..."
                size="xs"
                w={200}
                allowDeselect={false}
                styles={{
                  input: {
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    borderColor: 'rgba(139, 92, 246, 0.3)',
                    color: '#ccc',
                    fontSize: rem(12),
                  },
                  dropdown: {
                    backgroundColor: '#1e1e2e',
                    borderColor: 'rgba(139, 92, 246, 0.3)',
                  },
                  option: {
                    fontSize: rem(12),
                  },
                }}
              />
            )}

            {/* Performance Stats */}
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

            {/* Action Buttons */}
            <Group gap="xs">
              <Tooltip label="Create new patch" position="bottom" withArrow>
                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  onClick={handleNewPatch}
                  styles={{
                    root: {
                      border: '1px solid rgba(139, 92, 246, 0.2)',
                    },
                  }}
                >
                  New
                </Button>
              </Tooltip>

              <Tooltip label="Open existing patch" position="bottom" withArrow>
                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  styles={{
                    root: {
                      border: '1px solid rgba(139, 92, 246, 0.2)',
                    },
                  }}
                >
                  Open
                </Button>
              </Tooltip>

              <Tooltip label="Save current patch" position="bottom" withArrow>
                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  styles={{
                    root: {
                      border: '1px solid rgba(139, 92, 246, 0.2)',
                    },
                  }}
                >
                  Save
                </Button>
              </Tooltip>

              <Tooltip label="3D Preview (hold Shift)" position="bottom" withArrow>
                <Button
                  variant={camera.isActive ? 'gradient' : 'subtle'}
                  gradient={{ from: 'violet', to: 'grape', deg: 90 }}
                  color="gray"
                  size="xs"
                  onClick={() => camera.toggle()}
                  styles={{
                    root: {
                      border: camera.isActive
                        ? 'none'
                        : '1px solid rgba(139, 92, 246, 0.2)',
                      boxShadow: camera.isActive
                        ? '0 2px 8px rgba(139, 92, 246, 0.25)'
                        : 'none',
                    },
                  }}
                >
                  3D
                </Button>
              </Tooltip>

              <Tooltip label="Reset localStorage" position="bottom" withArrow>
                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  onClick={handleResetLocalStorage}
                  styles={{
                    root: {
                      border: '1px solid rgba(139, 92, 246, 0.2)',
                    },
                  }}
                >
                  Reset
                </Button>
              </Tooltip>

              <Menu shadow="md" width={220} position="bottom-end" withinPortal>
                <Menu.Target>
                  <Tooltip label="Layout controls" position="bottom" withArrow>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="lg"
                      style={{
                        border: '1px solid rgba(139, 92, 246, 0.2)',
                      }}
                    >
                      <span style={{ fontSize: rem(14), fontWeight: 700 }}>☰</span>
                    </ActionIcon>
                  </Tooltip>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Layout</Menu.Label>
                  <Menu.Item onClick={handleToggleBothSidebars} disabled={!dockviewApi}>
                    Toggle Sidebars
                  </Menu.Item>
                  <Menu.Item onClick={handleToggleLeftSidebar} disabled={!dockviewApi}>
                    Toggle Left Sidebar
                  </Menu.Item>
                  <Menu.Item onClick={handleToggleRightSidebar} disabled={!dockviewApi}>
                    Toggle Right Sidebar
                  </Menu.Item>
                  <Menu.Item onClick={handleResetLayout} disabled={!dockviewApi}>
                    Reset Layout
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>

              <Menu shadow="md" width={230} position="bottom-end" withinPortal>
                <Menu.Target>
                  <Tooltip label="Open/focus panels" position="bottom" withArrow>
                    <Button
                      variant="subtle"
                      color="gray"
                      size="xs"
                      styles={{
                        root: {
                          border: '1px solid rgba(139, 92, 246, 0.2)',
                        },
                      }}
                    >
                      Panels
                    </Button>
                  </Tooltip>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Panels</Menu.Label>
                  {PANEL_DEFINITIONS.map((panel) => (
                    <Menu.Item
                      key={panel.id}
                      onClick={() => handleOpenPanel(panel.id)}
                      disabled={!dockviewApi}
                    >
                      {panel.title}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>

              <Tooltip label="Export to clipboard (Cmd+E)" position="bottom" withArrow>
                <Button
                  variant="gradient"
                  gradient={{ from: 'violet', to: 'grape', deg: 90 }}
                  size="xs"
                  onClick={handleExport}
                  styles={{
                    root: {
                      boxShadow: '0 2px 8px rgba(139, 92, 246, 0.25)',
                    },
                  }}
                >
                  Export
                </Button>
              </Tooltip>
            </Group>
          </Group>
        </Group>
      </Box>

      <Toast
        open={toastOpen}
        message={toastMessage}
        severity={toastSeverity}
        onClose={handleToastClose}
      />
    </>
  );
});
