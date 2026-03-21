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
  Transform as LensIcon,
} from '@mui/icons-material';
import type { BlockId, PortId } from '../../../types';
import { useStores } from '../../../stores';
import { ContextMenu, type ContextMenuItem } from '../ContextMenu';
import { getLensDefaultParams, groupLensMenuOptions } from '../lensUtils';
import { getCompatibleLensesForConnection } from '../../authoring/semanticQueries';

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
  const { patch, frontend } = useStores();

  const items = useMemo<ContextMenuItem[]>(() => {
    const edge = patch.edges.find((e) => e.id === edgeId);
    if (!edge) return [];

    const sourceBlock = patch.blocks.get(edge.from.blockId as BlockId);
    const targetBlock = patch.blocks.get(edge.to.blockId as BlockId);

    const sourceLabel = sourceBlock?.displayName || sourceBlock?.type || edge.from.blockId;
    const targetLabel = targetBlock?.displayName || targetBlock?.type || edge.to.blockId;

    const menuItems: ContextMenuItem[] = [
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
      },
    ];

    // Add Lens option (if source and target types are available)
    if (sourceBlock && targetBlock) {
      const compatibleLenses = getCompatibleLensesForConnection(
        patch.patch,
        frontend,
        edge.from.blockId as BlockId,
        edge.from.slotId as PortId,
        edge.to.blockId as BlockId,
        edge.to.slotId as PortId,
      );
      const grouped = groupLensMenuOptions(compatibleLenses);
      const describeLens = (label: string, description: string): string =>
        description.trim().length > 0 ? `${label} - ${description}` : label;

      const addLens = (lensType: string): void => {
        const params = getLensDefaultParams(lensType);
        const sourceAddress = `v1:blocks.${edge.from.blockId}.outputs.${edge.from.slotId}`;
        patch.addLens(edge.to.blockId as BlockId, edge.to.slotId, lensType, sourceAddress, params);
      };

      if (grouped.common.length > 0 || grouped.others.length > 0) {
        for (const lens of grouped.common) {
          menuItems.push({
            label: `Insert Lens: ${describeLens(lens.label, lens.description)}`,
            icon: <LensIcon fontSize="small" />,
            action: () => addLens(lens.blockType),
          });
        }

        if (grouped.others.length > 0) {
          const overflowChildren: ContextMenuItem[] = grouped.others.map((lens) => ({
            label: lens.blockType.startsWith('Adapter_')
              ? `[Adapter] ${describeLens(lens.label, lens.description)}`
              : `[Lens] ${describeLens(lens.label, lens.description)}`,
            icon: <LensIcon fontSize="small" />,
            action: () => addLens(lens.blockType),
          }));
          menuItems.push({
            label: 'Insert Lens: More...',
            icon: <LensIcon fontSize="small" />,
            action: () => {},
            children: overflowChildren,
          });
        }
      }
    }

    // Add divider before Delete
    const lastItem = menuItems[menuItems.length - 1];
    if (lastItem && lastItem.label.includes('Lens')) {
      lastItem.dividerAfter = true;
    } else if (menuItems.length > 0) {
      menuItems[menuItems.length - 1].dividerAfter = true;
    }

    menuItems.push({
      label: 'Delete Connection',
      icon: <DeleteIcon fontSize="small" />,
      action: () => {
        patch.removeEdge(edgeId);
      },
      danger: true,
    });

    return menuItems;
  }, [edgeId, frontend, onNavigateToBlock, patch]);

  return <ContextMenu items={items} anchorPosition={anchorPosition} onClose={onClose} />;
};
