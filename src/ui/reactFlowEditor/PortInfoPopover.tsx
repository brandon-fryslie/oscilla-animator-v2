/**
 * PortInfoPopover - Floating popover for detailed port information.
 *
 * Displays rich port metadata on hover including:
 * - Port name and type
 * - Connection info (what it's connected to)
 * - Debug value (when debug mode enabled)
 * - Default source info (for unconnected inputs)
 *
 * Renders as a portal positioned relative to the hovered element.
 * Does not wrap the Handle element to avoid interfering with ReactFlow.
 */

import React, { useEffect, useState } from 'react';
import { Portal, Text, Stack, Group, Badge, Box, Paper, Divider } from '@mantine/core';
import { observer } from 'mobx-react-lite';
import type { PortData } from './nodes';
import type { DefaultSource } from '../../types';
import { useStores, formatDebugValue } from '../../stores';
import { getLensLabel } from './lensUtils';

interface PortInfoPopoverProps {
  port: PortData | null;
  isInput: boolean;
  anchorEl: HTMLElement | null;
  /** Block ID for port-based debug queries (output ports without connections) */
  blockId?: string;
}

/**
 * Format a default source for display.
 */
function formatDefaultSource(ds: DefaultSource): string {
  if (ds.blockType === 'TimeRoot') {
    return `TimeRoot.${ds.output}`;
  }

  if (ds.blockType === 'Const' && ds.params?.value !== undefined) {
    const value = ds.params.value;
    if (typeof value === 'number') {
      return String(value);
    } else if (Array.isArray(value)) {
      return `[${value.join(', ')}]`;
    } else if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    }
    return String(value);
  }

  return `${ds.blockType}.${ds.output}`;
}

/**
 * Get badge color based on default source type.
 */
function getDefaultSourceBadgeColor(ds: DefaultSource): string {
  if (ds.blockType === 'TimeRoot') {
    return 'blue';
  }
  return 'teal';
}

export const PortInfoPopover: React.FC<PortInfoPopoverProps> = observer(({
  port,
  isInput,
  anchorEl,
  blockId,
}) => {
  const { debug } = useStores();
  const [position, setPosition] = useState<{ top: number; left: number; flipped?: boolean } | null>(null);

  // Calculate position when anchor changes
  useEffect(() => {
    if (anchorEl && port) {
      const rect = anchorEl.getBoundingClientRect();
      const popoverWidth = 240;
      const offset = 16;
      const minEdgeDistance = 10;

      let left: number;
      let actualIsInput = isInput;

      // Try preferred side first, flip if needed
      if (isInput) {
        // Prefer left side for inputs
        left = rect.left - popoverWidth - offset;
        if (left < minEdgeDistance) {
          // Flip to right side
          left = rect.right + offset;
          actualIsInput = false;
        }
      } else {
        // Prefer right side for outputs
        left = rect.right + offset;
        if (left + popoverWidth > window.innerWidth - minEdgeDistance) {
          // Flip to left side
          left = rect.left - popoverWidth - offset;
          actualIsInput = true;
        }
      }

      // Clamp top position to stay within viewport
      const top = Math.max(
        100, // min from top
        Math.min(rect.top + rect.height / 2, window.innerHeight - 150)
      );

      setPosition({ top, left, flipped: actualIsInput !== isInput });
    } else {
      setPosition(null);
    }
  }, [anchorEl, port, isInput]);

  if (!port || !position) {
    return null;
  }

  // Get debug value:
  // - For connected ports: use edge-based lookup
  // - For unconnected output ports: use port-based lookup
  let debugValue = undefined;
  if (debug.enabled) {
    if (port.connection) {
      debugValue = debug.getEdgeValue(port.connection.edgeId);
    } else if (!isInput && blockId) {
      // Unconnected output port - query by blockId:portName
      debugValue = debug.getPortValue(blockId, port.id);
    }
  }

  // Determine effective side for arrow (accounts for flip)
  const arrowOnRight = position.flipped ? !isInput : isInput;

  return (
    <Portal>
      <Paper
        shadow="md"
        style={{
          position: 'fixed',
          top: position.top,
          left: position.left,
          transform: 'translateY(-50%)',
          background: '#2a2a2a',
          border: '1px solid #444',
          padding: '12px',
          width: '240px',
          zIndex: 10000,
          pointerEvents: 'none',
        }}
      >
        {/* Arrow - points toward the port */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            [arrowOnRight ? 'right' : 'left']: '-6px',
            transform: 'translateY(-50%)',
            width: 0,
            height: 0,
            borderTop: '6px solid transparent',
            borderBottom: '6px solid transparent',
            [arrowOnRight ? 'borderLeft' : 'borderRight']: '6px solid #444',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            [arrowOnRight ? 'right' : 'left']: '-5px',
            transform: 'translateY(-50%)',
            width: 0,
            height: 0,
            borderTop: '5px solid transparent',
            borderBottom: '5px solid transparent',
            [arrowOnRight ? 'borderLeft' : 'borderRight']: '5px solid #2a2a2a',
          }}
        />

        <Stack gap="xs">
          {/* Port Name and Direction */}
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm" fw={600} c="white">
              {port.label}
            </Text>
            <Badge size="xs" variant="outline" color="gray">
              {isInput ? 'input' : 'output'}
            </Badge>
          </Group>

          {/* Type Info */}
          <Box>
            <Text size="xs" c="dimmed">
              Type
            </Text>
            <Group gap="xs" mt={2}>
              <Box
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: port.typeColor,
                  flexShrink: 0,
                }}
              />
              <Text size="sm" c="white" style={{ fontFamily: 'monospace' }}>
                {port.typeTooltip}
              </Text>
            </Group>
          </Box>

          {/* Connection Info */}
          {port.connection ? (
            <Box>
              <Text size="xs" c="dimmed">
                {isInput ? 'Connected from' : 'Connected to'}
              </Text>
              <Text size="sm" c="white" mt={2}>
                <Text span fw={500} c="cyan">
                  {port.connection.blockLabel}
                </Text>
                <Text span c="dimmed">{' → '}</Text>
                <Text span style={{ fontFamily: 'monospace' }}>
                  {port.connection.portId}
                </Text>
              </Text>
            </Box>
          ) : (
            <Box>
              <Text size="xs" c="dimmed">
                Status
              </Text>
              <Badge size="sm" color="gray" variant="light" mt={2}>
                Not connected
              </Badge>
            </Box>
          )}

          {/* Debug Value (when connected and debug enabled) */}
          {debugValue && debugValue.kind === 'signal' && (
            <>
              <Divider color="#444" />
              <Box>
                <Text size="xs" c="dimmed">
                  Current Value
                </Text>
                <Text
                  size="lg"
                  fw={600}
                  c="cyan"
                  mt={2}
                  style={{ fontFamily: 'monospace' }}
                >
                  {formatDebugValue(debugValue.value, debugValue.type)}
                </Text>
              </Box>
            </>
          )}
          {debugValue && debugValue.kind === 'field' && (
            <>
              <Divider color="#444" />
              <Box>
                <Text size="xs" c="dimmed">
                  Field [{debugValue.count}]
                </Text>
                <Text
                  size="sm"
                  fw={600}
                  c="violet"
                  mt={2}
                  style={{ fontFamily: 'monospace' }}
                >
                  mean: {debugValue.mean.toFixed(3)}
                </Text>
              </Box>
            </>
          )}

          {/* Default Source (for unconnected inputs) */}
          {isInput && !port.isConnected && port.defaultSource && (
            <Box>
              <Text size="xs" c="dimmed">
                Default Source
              </Text>
              <Badge
                size="sm"
                color={getDefaultSourceBadgeColor(port.defaultSource)}
                variant="light"
                mt={2}
              >
                {formatDefaultSource(port.defaultSource)}
              </Badge>
            </Box>
          )}

          {/* Lenses (for inputs with attached lenses) */}
          {isInput && port.lenses && port.lenses.length > 0 && (
            <Box>
              <Text size="xs" c="dimmed">
                Lenses
              </Text>
              <Stack gap={4} mt={4}>
                {port.lenses.map((lens) => (
                  <Stack key={lens.id} gap={2}>
                    <Group gap="xs" wrap="wrap">
                      <Badge size="xs" color="orange" variant="light">
                        {getLensLabel(lens.lensType)}
                      </Badge>
                      <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
                        {lens.sourceAddress.split('.').slice(-2).join('.')}
                      </Text>
                    </Group>
                    {lens.params && Object.keys(lens.params).length > 0 && (
                      <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace', paddingLeft: '8px' }}>
                        ({Object.entries(lens.params).map(([k, v]) => `${k}: ${String(v)}`).join(', ')})
                      </Text>
                    )}
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      </Paper>
    </Portal>
  );
});
