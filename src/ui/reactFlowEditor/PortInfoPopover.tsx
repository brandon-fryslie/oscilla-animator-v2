/**
 * PortInfoPopover - Floating popover for detailed port information.
 *
 * Uses BasePopover so behavior matches other graph popovers:
 * - hover preview
 * - click pin
 * - interactive while pinned
 */

import React, { useEffect } from 'react';
import { Text, Stack, Group, Badge, Box, Divider } from '@mantine/core';
import { observer } from 'mobx-react-lite';
import type { PortData } from '../graphEditor/nodeDataTransform';
import type { DefaultSource, BlockId, PortId } from '../../types';
import { useStores, formatDebugValue } from '../../stores';
import { getLensLabel } from './lensUtils';
import { BasePopover, POPUP_SURFACE_STYLE, type PopoverAnchorPosition } from './BasePopover';
import {
  formatProvenanceTooltip,
  formatCanonicalTypeTooltip,
  getAdapterBadgeLabel,
  getUnresolvedWarning,
} from '../graphEditor/portTooltipFormatters';
import {
  formatDefaultSourceLabel,
  isTimeDefaultSource,
} from '../defaultSourcePresentation';

interface PortInfoPopoverProps {
  port: PortData | null;
  isInput: boolean;
  arrowOnRight: boolean;
  anchorPosition: PopoverAnchorPosition | null;
  pinned: boolean;
  onClose: () => void;
  /** Block ID for port-based debug queries (output ports without connections) */
  blockId?: string;
}

function getDefaultSourceBadgeColor(ds: DefaultSource): string {
  if (isTimeDefaultSource(ds)) return 'blue';
  return 'teal';
}

export const PortInfoPopover: React.FC<PortInfoPopoverProps> = observer(({
  port,
  isInput,
  arrowOnRight,
  anchorPosition,
  pinned,
  onClose,
  blockId,
}) => {
  const { debug, diagnostics, frontend, patch } = useStores();
  const debugEnabled = debug.enabled;

  useEffect(() => {
    const active = Boolean(port && anchorPosition);
    debug.setPortPopoverActive(active);
    return () => {
      debug.setPortPopoverActive(false);
    };
  }, [debug, port, anchorPosition]);

  if (!port || !anchorPosition) {
    return null;
  }

  // Rich V1 port detail is read straight from the compiler/patch stores here
  // (this popover is a store-reading surface owned by the type-oracle /
  // edge-decoration seams; the pillar path simply has no such data and these
  // sections stay empty). The neutral node vocabulary carries only the type
  // header (color/tooltip), which is shown regardless of era.
  const dir = isInput ? 'in' : 'out';
  const resolvedType = blockId ? frontend.getResolvedPortTypeByIds(blockId, port.id, dir) : undefined;
  const provenance = blockId ? frontend.getPortProvenanceByIds(blockId, port.id, dir) : undefined;
  const defaultSource = isInput && blockId ? frontend.getDefaultSourceByIds(blockId, port.id) : undefined;
  const lenses = isInput && blockId
    ? patch.blocks.get(blockId as BlockId)?.inputPorts.get(port.id as PortId)?.lenses
    : undefined;

  let debugValue = undefined;
  if (debugEnabled) {
    try {
      if (port.connection) {
        debugValue = debug.getEdgeValue(port.connection.edgeId);
      } else if (!isInput && blockId) {
        debugValue = debug.getPortValue(blockId, port.id);
      }
    } catch {
      // Debug value unavailable — degrade gracefully, don't crash the popover.
    }
  }

  return (
    <BasePopover
      open={Boolean(port && anchorPosition)}
      anchorPosition={anchorPosition}
      interactive={pinned}
      onClose={onClose}
      anchorOrigin={{ vertical: 'center', horizontal: 'left' }}
      transformOrigin={{ vertical: 'center', horizontal: 'left' }}
      paperStyle={{
        ...POPUP_SURFACE_STYLE,
        padding: '12px',
        width: '260px',
      }}
    >
      <div style={{ position: 'relative' }}>
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
            [arrowOnRight ? 'borderLeft' : 'borderRight']: '6px solid rgba(139, 92, 246, 0.35)',
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
            [arrowOnRight ? 'borderLeft' : 'borderRight']: '5px solid rgba(24, 24, 34, 0.98)',
          }}
        />

        <Stack gap="xs">
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm" fw={700} c="white">
              {port.label}
            </Text>
            <Group gap={6} wrap="nowrap">
              <Badge size="xs" variant="outline" color="gray">
                {isInput ? 'input' : 'output'}
              </Badge>
              <Badge size="xs" variant="light" color={pinned ? 'violet' : 'gray'}>
                {pinned ? 'pinned' : 'hover'}
              </Badge>
            </Group>
          </Group>

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
              <Stack gap={2}>
                <Text size="sm" c="white" style={{ fontFamily: 'monospace' }}>
                  {port.typeTooltip}
                </Text>
                {resolvedType && (
                  <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace', whiteSpace: 'pre-line' }}>
                    {formatCanonicalTypeTooltip(resolvedType)}
                  </Text>
                )}
              </Stack>
            </Group>
          </Box>

          {provenance && (
            <Box>
              <Text size="xs" c="dimmed">
                Provenance
              </Text>
              <Group gap="xs" mt={2}>
                {getAdapterBadgeLabel(provenance) && (
                  <Badge size="xs" color="orange" variant="filled">
                    Adapter
                  </Badge>
                )}
                {getUnresolvedWarning(provenance) && (
                  <Badge size="xs" color="red" variant="filled">
                    Unresolved
                  </Badge>
                )}
                <Text size="sm" c="white">
                  {formatProvenanceTooltip(provenance)}
                </Text>
              </Group>
            </Box>
          )}

          {port.connection ? (
            <Box>
              <Text size="xs" c="dimmed">
                {isInput ? 'Connected from' : 'Connected to'}
              </Text>
              <Text size="sm" c="white" mt={2}>
                <Text span fw={500} c="cyan">
                  {port.connection.blockLabel}
                </Text>
                <Text span c="dimmed">{' -> '}</Text>
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

          {debugValue && debugValue.kind === 'scalar' && (
            <>
              <Divider color="#444" />
              <Box>
                <Text size="xs" c="dimmed">
                  Current Value
                </Text>
                <Text size="lg" fw={600} c="cyan" mt={2} style={{ fontFamily: 'monospace' }}>
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
                  Field [{debugValue.stats.count}]
                </Text>
                <Text size="sm" fw={600} c="violet" mt={2} style={{ fontFamily: 'monospace' }}>
                  mean: {debugValue.stats.mean[0].toFixed(3)}
                </Text>
              </Box>
            </>
          )}

          {blockId && port.id && (() => {
            const portDiags = diagnostics.getDiagnosticsForPort(blockId, port.id);
            const errors = portDiags.filter(d => d.severity === 'error' || d.severity === 'fatal');
            const warnings = portDiags.filter(d => d.severity === 'warn');
            if (errors.length === 0 && warnings.length === 0) return null;

            return (
              <Box>
                <Divider color="#444" my="xs" />
                <Text size="xs" c="dimmed" mb={4}>
                  Diagnostics
                </Text>
                <Stack gap={6}>
                  {errors.map((diag, i) => (
                    <Box
                      key={`error-${i}`}
                      style={{
                        padding: '6px 8px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '4px',
                      }}
                    >
                      <Group gap="xs" wrap="nowrap" align="flex-start">
                        <Badge size="xs" color="red" variant="filled" style={{ flexShrink: 0 }}>
                          ERROR
                        </Badge>
                        <Text size="xs" c="red.3" style={{ flex: 1, lineHeight: 1.4 }}>
                          {diag.message}
                        </Text>
                      </Group>
                    </Box>
                  ))}
                  {warnings.map((diag, i) => (
                    <Box
                      key={`warn-${i}`}
                      style={{
                        padding: '6px 8px',
                        background: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        borderRadius: '4px',
                      }}
                    >
                      <Group gap="xs" wrap="nowrap" align="flex-start">
                        <Badge size="xs" color="orange" variant="filled" style={{ flexShrink: 0 }}>
                          WARN
                        </Badge>
                        <Text size="xs" c="orange.3" style={{ flex: 1, lineHeight: 1.4 }}>
                          {diag.message}
                        </Text>
                      </Group>
                    </Box>
                  ))}
                </Stack>
              </Box>
            );
          })()}

          {isInput && !port.isConnected && defaultSource && (
            <Box>
              <Text size="xs" c="dimmed">
                Default Source
              </Text>
              <Badge
                size="sm"
                color={getDefaultSourceBadgeColor(defaultSource)}
                variant="light"
                mt={2}
              >
                {formatDefaultSourceLabel(defaultSource)}
              </Badge>
            </Box>
          )}

          {isInput && lenses && lenses.length > 0 && (
            <Box>
              <Text size="xs" c="dimmed">
                Lenses
              </Text>
              <Stack gap={4} mt={4}>
                {lenses.map((lens) => (
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
      </div>
    </BasePopover>
  );
});
