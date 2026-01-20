/**
 * PortContextMenu - Context menu for input/output ports.
 *
 * Input port actions:
 * - Disconnect: Removes the incoming edge
 * - Reset to Default: Clears connection and uses default source
 *
 * Output port actions:
 * - Disconnect All: Removes all outgoing edges from this port
 */

import React, { useMemo } from 'react';
import {
  LinkOff as DisconnectIcon,
  RestartAlt as ResetIcon,
} from '@mui/icons-material';
import type { BlockId, PortId } from '../../../types';
import { rootStore } from '../../../stores';
import { ContextMenu, type ContextMenuItem } from '../ContextMenu';

export interface PortContextMenuProps {
  blockId: BlockId;
  portId: PortId;
  isInput: boolean;
  anchorPosition: { top: number; left: number } | null;
  onClose: () => void;
}

export const PortContextMenu: React.FC<PortContextMenuProps> = ({
  blockId,
  portId,
  isInput,
  anchorPosition,
  onClose,
}) => {
  const items = useMemo<ContextMenuItem[]>(() => {
    const block = rootStore.patch.blocks.get(blockId);
    if (!block) return [];

    if (isInput) {
      // Input port: Disconnect, Reset to Default
      const connectedEdge = rootStore.patch.edges.find(
        (edge) => edge.to.blockId === blockId && edge.to.slotId === portId
      );
      const hasConnection = !!connectedEdge;

      // Check if port has a default source
      const inputPort = block.inputPorts.get(portId);
      const hasDefault = !!inputPort?.defaultSource;

      return [
        {
          label: 'Disconnect',
          icon: <DisconnectIcon fontSize="small" />,
          action: () => {
            if (connectedEdge) {
              rootStore.patch.removeEdge(connectedEdge.id);
            }
          },
          disabled: !hasConnection,
        },
        {
          label: 'Reset to Default',
          icon: <ResetIcon fontSize="small" />,
          action: () => {
            // Remove connection if any
            if (connectedEdge) {
              rootStore.patch.removeEdge(connectedEdge.id);
            }
            // Clear any per-instance default source override
            // (This would require a new PatchStore method - for now just disconnect)
            // TODO: Implement clearInputPortDefaultSource() in PatchStore
          },
          disabled: !hasConnection && !hasDefault,
        },
      ];
    } else {
      // Output port: Disconnect All
      const connectedEdges = rootStore.patch.edges.filter(
        (edge) => edge.from.blockId === blockId && edge.from.slotId === portId
      );
      const hasConnections = connectedEdges.length > 0;

      return [
        {
          label: `Disconnect All (${connectedEdges.length})`,
          icon: <DisconnectIcon fontSize="small" />,
          action: () => {
            for (const edge of connectedEdges) {
              rootStore.patch.removeEdge(edge.id);
            }
          },
          disabled: !hasConnections,
        },
      ];
    }
  }, [blockId, portId, isInput]);

  return <ContextMenu items={items} anchorPosition={anchorPosition} onClose={onClose} />;
};
