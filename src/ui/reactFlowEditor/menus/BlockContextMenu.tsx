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
import {
  ContentCopy as DuplicateIcon,
  SwapHoriz as ReplaceIcon,
  Delete as DeleteIcon,
  LinkOff as DisconnectIcon,
  CenterFocusStrong as CenterIcon,
} from '@mui/icons-material';
import type { BlockId } from '../../../types';
import { useStores } from '../../../stores';
import { ContextMenu, type ContextMenuItem } from '../ContextMenu';
import { findCompatibleReplacementPlans } from './blockReplacement';

export interface BlockContextMenuProps {
  blockId: BlockId;
  anchorPosition: { top: number; left: number } | null;
  onClose: () => void;
  onCenter: (blockId: BlockId) => void;
}

export const BlockContextMenu: React.FC<BlockContextMenuProps> = ({
  blockId,
  anchorPosition,
  onClose,
  onCenter,
}) => {
  const { patch, layout, selection } = useStores();

  const items = useMemo<ContextMenuItem[]>(() => {
    const block = patch.blocks.get(blockId);
    if (!block) return [];

    // Count connected edges
    const connectedEdges = patch.edges.filter(
      (edge) => edge.from.blockId === blockId || edge.to.blockId === blockId
    );
    const hasConnections = connectedEdges.length > 0;
    const replacementPlans = findCompatibleReplacementPlans(patch.patch, blockId);

    return [
      {
        label: 'Duplicate Block',
        icon: <DuplicateIcon fontSize="small" />,
        action: () => {
          // Create copy with same type and params
          const newId = patch.addBlock(block.type, { ...block.params }, {
            displayName: `${block.displayName} (copy)`,
            domainId: block.domainId,
            role: block.role,
          });

          const sourcePos = layout.getPosition(blockId);
          if (sourcePos) {
            // [LAW:single-enforcer] LayoutStore remains the single owner of node positions.
            // Duplication uses an offset write through that boundary.
            layout.setPosition(newId, {
              x: sourcePos.x + 48,
              y: sourcePos.y + 48,
            });
          }
        },
        dividerAfter: true,
      },
      {
        label: 'Replace Block...',
        icon: <ReplaceIcon fontSize="small" />,
        action: () => {},
        children: replacementPlans.map((candidate) => ({
          label: candidate.blockLabel,
          icon: <ReplaceIcon fontSize="small" />,
          action: () => {
            const sourceBlock = patch.blocks.get(blockId);
            if (!sourceBlock) return;

            const sourcePos = layout.getPosition(blockId);
            const replacementId = patch.addBlock(candidate.blockType, {}, {
              domainId: sourceBlock.domainId,
              role: sourceBlock.role,
            });

            if (sourcePos) {
              // [LAW:single-enforcer] LayoutStore remains the sole authority for
              // node positions, including replacement swaps.
              layout.setPosition(replacementId, sourcePos);
            }

            for (const edge of candidate.rewiredEdges) {
              patch.addEdge(
                {
                  kind: 'port',
                  blockId: edge.from.blockId === blockId ? replacementId : edge.from.blockId,
                  slotId: edge.from.slotId,
                },
                {
                  kind: 'port',
                  blockId: edge.to.blockId === blockId ? replacementId : edge.to.blockId,
                  slotId: edge.to.slotId,
                },
                {
                  enabled: edge.enabled,
                  sortKey: edge.sortKey,
                  role: edge.role,
                  ...(edge.alias !== undefined ? { alias: edge.alias } : {}),
                },
              );
            }

            patch.removeBlock(blockId);
            selection.selectBlock(replacementId);
          },
        })),
        disabled: replacementPlans.length === 0,
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
  }, [blockId, onCenter, patch, layout, selection]);

  return <ContextMenu items={items} anchorPosition={anchorPosition} onClose={onClose} />;
};
