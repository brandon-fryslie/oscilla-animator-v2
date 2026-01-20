/**
 * EdgeContextMenu - Context menu for edges (connections).
 *
 * Actions:
 * - Delete Connection: Removes the edge
 * - Go to Source: Selects and centers the source block
 * - Go to Target: Selects and centers the target block
 */

import React, { useMemo } from 'react';
import {
  Delete as DeleteIcon,
  ArrowBack as SourceIcon,
  ArrowForward as TargetIcon,
} from '@mui/icons-material';
import type { BlockId } from '../../../types';
import { rootStore } from '../../../stores';
import { ContextMenu, type ContextMenuItem } from '../ContextMenu';

export interface EdgeContextMenuProps {
  edgeId: string;
  anchorPosition: { top: number; left: number } | null;
  onClose: () => void;
  onNavigateToBlock: (blockId: BlockId) => void;
}

export const EdgeContextMenu: React.FC<EdgeContextMenuProps> = ({
  edgeId,
  anchorPosition,
  onClose,
  onNavigateToBlock,
}) => {
  const items = useMemo<ContextMenuItem[]>(() => {
    const edge = rootStore.patch.edges.find((e) => e.id === edgeId);
    if (!edge) return [];

    const sourceBlock = rootStore.patch.blocks.get(edge.from.blockId as BlockId);
    const targetBlock = rootStore.patch.blocks.get(edge.to.blockId as BlockId);

    const sourceLabel = sourceBlock?.displayName || sourceBlock?.type || edge.from.blockId;
    const targetLabel = targetBlock?.displayName || targetBlock?.type || edge.to.blockId;

    return [
      {
        label: `Go to Source (${sourceLabel})`,
        icon: <SourceIcon fontSize="small" />,
        action: () => {
          onNavigateToBlock(edge.from.blockId as BlockId);
        },
      },
      {
        label: `Go to Target (${targetLabel})`,
        icon: <TargetIcon fontSize="small" />,
        action: () => {
          onNavigateToBlock(edge.to.blockId as BlockId);
        },
        dividerAfter: true,
      },
      {
        label: 'Delete Connection',
        icon: <DeleteIcon fontSize="small" />,
        action: () => {
          rootStore.patch.removeEdge(edgeId);
        },
        danger: true,
      },
    ];
  }, [edgeId, onNavigateToBlock]);

  return <ContextMenu items={items} anchorPosition={anchorPosition} onClose={onClose} />;
};
