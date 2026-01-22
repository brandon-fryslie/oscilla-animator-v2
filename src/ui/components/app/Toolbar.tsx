/**
 * Toolbar Component
 *
 * Top toolbar with app title, performance stats, and export functionality.
 * Uses Mantine for a gorgeous, modern look.
 */

import React, { useState } from 'react';
import {
  Group,
  Button,
  Text,
  Badge,
  Box,
  Tooltip,
  rem,
} from '@mantine/core';
import { observer } from 'mobx-react-lite';
import { useExportPatch } from '../../hooks/useExportPatch';
import { Toast } from '../common/Toast';

interface ToolbarProps {
  stats?: string;
}

export const Toolbar: React.FC<ToolbarProps> = observer(({ stats = 'FPS: --' }) => {
  const exportPatch = useExportPatch();
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastSeverity, setToastSeverity] = useState<'success' | 'error'>('success');

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

          {/* Stats and Actions */}
          <Group gap="md">
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
                      '&:hover': {
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        borderColor: 'rgba(139, 92, 246, 0.4)',
                      },
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
                      '&:hover': {
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        borderColor: 'rgba(139, 92, 246, 0.4)',
                      },
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
                      '&:hover': {
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        borderColor: 'rgba(139, 92, 246, 0.4)',
                      },
                    },
                  }}
                >
                  Save
                </Button>
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
