/**
 * BlockContextMenu - Context menu for blocks (nodes).
 *
 * Actions:
 * - Duplicate Block: Creates a copy with new ID
 * - Delete Block: Removes block and all connected edges
 * - Disconnect All: Removes all edges connected to this block
 * - Center in View: Zooms and pans to center this block
 */

import React, { useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import {
  ContentCopy as DuplicateIcon,
  Delete as DeleteIcon,
  LinkOff as DisconnectIcon,
  CenterFocusStrong as CenterIcon,
} from '@mui/icons-material';
import type { BlockId } from '../../../types';
import { useStores } from '../../../stores';
import { ContextMenu, type ContextMenuItem } from '../ContextMenu';

export interface BlockContextMenuProps {
  blockId: BlockId;
  anchorPosition: { top: number; left: number } | null;
  onClose: () => void;
  onCenter: (blockId: BlockId) => void;
}

export const BlockContextMenu: React.FC<BlockContextMenuProps> = observer(({
  blockId,
  anchorPosition,
  onClose,
  onCenter,
}) => {
  const { patch } = useStores();

  const items = useMemo<ContextMenuItem[]>(() => {
    const block = patch.blocks.get(blockId);
    if (!block) return [];

    // Count connected edges
    const connectedEdges = patch.edges.filter(
      (edge) => edge.from.blockId === blockId || edge.to.blockId === blockId
    );
    const hasConnections = connectedEdges.length > 0;

    return [
      {
        label: 'Duplicate Block',
        icon: <DuplicateIcon fontSize="small" />,
        action: () => {
          // Create copy with same type and params
          const newId = patch.addBlock(block.type, { ...block.params }, {
            displayName: block.displayName ? `${block.displayName} (copy)` : null,
            domainId: block.domainId,
            role: block.role,
          });

          // TODO: Position the new block offset from original (requires access to node position)
          // For now, just create it at default position
        },
        dividerAfter: true,
      },
      {
        label: 'Center in View',
        icon: <CenterIcon fontSize="small" />,
        action: () => {
          onCenter(blockId);
        },
        dividerAfter: true,
      },
      {
        label: 'Disconnect All',
        icon: <DisconnectIcon fontSize="small" />,
        action: () => {
          // Remove all edges connected to this block
          for (const edge of connectedEdges) {
            patch.removeEdge(edge.id);
          }
        },
        disabled: !hasConnections,
      },
      {
        label: 'Delete Block',
        icon: <DeleteIcon fontSize="small" />,
        action: () => {
          patch.removeBlock(blockId);
        },
        danger: true,
      },
    ];
  }, [blockId, onCenter, patch]);

  return <ContextMenu items={items} anchorPosition={anchorPosition} onClose={onClose} />;
});
