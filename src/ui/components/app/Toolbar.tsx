/**
 * Toolbar Component
 *
 * Top toolbar with app title, performance stats, and export functionality.
 * Uses Mantine for a gorgeous, modern look.
 */

import React, { useState, useEffect } from 'react';
import {
  Group,
  Button,
  Text,
  Badge,
  Box,
  Tooltip,
  Select,
  ActionIcon,
  rem,
} from '@mantine/core';
import { Settings as SettingsIcon } from '@mui/icons-material';
import { observer } from 'mobx-react-lite';
import { useStore } from '../../../stores';
import { useExportPatch } from '../../hooks/useExportPatch';
import type { DockviewApi } from 'dockview';
import { Toast } from '../common/Toast';

interface ToolbarProps {
  stats?: string;
  dockviewApi?: DockviewApi | null;
}

export const Toolbar: React.FC<ToolbarProps> = observer(({ stats = 'FPS: --', dockviewApi }) => {
  const camera = useStore('camera');
  const exportPatch = useExportPatch();
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastSeverity, setToastSeverity] = useState<'success' | 'error'>('success');

  // Preset dropdown state - reads from window globals set by main.ts
  const [presets, setPresets] = useState<Array<{ label: string; value: string }>>([]);
  const [currentPreset, setCurrentPreset] = useState<string | null>(null);

  useEffect(() => {
    // Poll for presets availability (set by main.ts after runtime init)
    const check = () => {
      if (window.__oscilla_presets) {
        setPresets(window.__oscilla_presets);
        setCurrentPreset(window.__oscilla_currentPreset ?? '0');
      }
    };
    check();
    const interval = setInterval(check, 200);
    return () => clearInterval(interval);
  }, []);

  const handlePresetChange = (value: string | null) => {
    if (value === null) return;
    setCurrentPreset(value);
    const switchFn = window.__oscilla_switchPreset;
    if (switchFn) switchFn(value);
  };

  const handleExport = async () => {
    const result = await exportPatch();
    setToastMessage(result.message);
    setToastSeverity(result.success ? 'success' : 'error');
    setToastOpen(true);

    if (!result.success && result.error) {
      console.error('Export error:', result.error);
    }
  };

  const handleToastClose = () => {
    setToastOpen(false);
  };

  const handleResetLocalStorage = () => {
    const clearStorageAndReload = (window as unknown as { clearStorageAndReload?: () => void }).clearStorageAndReload;
    if (clearStorageAndReload) {
      clearStorageAndReload();
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
            {/* Preset Dropdown */}
            {presets.length > 0 && (
              <Select
                data={presets}
                value={currentPreset}
                onChange={handlePresetChange}
                size="xs"
                w={180}
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

              <Tooltip label="Settings" position="bottom" withArrow>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="lg"
                  onClick={() => {
                    if (dockviewApi) {
                      const panel = dockviewApi.getPanel('settings');
                      if (panel) {
                        const group = panel.group;
                        if (panel.api.isActive && group) {
                          // Toggle off: collapse the settings group
                          group.api.setSize({ width: 0 });
                        } else if (group) {
                          // Toggle on: expand and activate
                          group.api.setSize({ width: 280 });
                          panel.api.setActive();
                        }
                      }
                    }
                  }}
                  style={{
                    border: '1px solid rgba(139, 92, 246, 0.2)',
                  }}
                >
                  <SettingsIcon style={{ fontSize: rem(18) }} />
                </ActionIcon>
              </Tooltip>

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
