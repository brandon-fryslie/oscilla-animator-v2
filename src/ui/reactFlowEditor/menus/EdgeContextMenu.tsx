/**
 * EdgeContextMenu - Context menu for edges (connections).
 *
 * Actions:
 * - Delete Connection: Removes the edge
 * - Go to Source: Selects and centers the source block
 * - Go to Target: Selects and centers the target block
 */

import React, { useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import {
  Delete as DeleteIcon,
  ArrowBack as SourceIcon,
  ArrowForward as TargetIcon,
  Transform as LensIcon,
} from '@mui/icons-material';
import type { BlockId } from '../../../types';
import { useStores } from '../../../stores';
import { ContextMenu, type ContextMenuItem } from '../ContextMenu';
import { requireBlockDef } from '../../../blocks/registry';
import { findCompatibleLenses, getLensLabel } from '../lensUtils';

export interface EdgeContextMenuProps {
  edgeId: string;
  anchorPosition: { top: number; left: number } | null;
  onClose: () => void;
  onNavigateToBlock: (blockId: BlockId) => void;
}

export const EdgeContextMenu: React.FC<EdgeContextMenuProps> = observer(({
  edgeId,
  anchorPosition,
  onClose,
  onNavigateToBlock,
}) => {
  const { patch } = useStores();

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
      const sourceBlockDef = requireBlockDef(sourceBlock.type);
      const targetBlockDef = requireBlockDef(targetBlock.type);
      
      const sourceOutput = sourceBlockDef.outputs[edge.from.slotId];
      const targetInput = targetBlockDef.inputs[edge.to.slotId];
      
      if (sourceOutput?.type && targetInput?.type) {
        const compatibleLenses = findCompatibleLenses(sourceOutput.type, targetInput.type);
        
        if (compatibleLenses.length > 0) {
          // Limit to 3 lenses in edge menu (less than port menu)
          const lensesToShow = compatibleLenses.slice(0, 3);
          
          // Add each lens as a direct menu item
          for (const lens of lensesToShow) {
            menuItems.push({
              label: `Add Lens: ${lens.label}`,
              icon: <LensIcon fontSize="small" />,
              action: () => {
                const sourceAddress = `v1:blocks.${sourceBlock.displayName}.outputs.${edge.from.slotId}`;
                patch.addLens(edge.to.blockId as BlockId, edge.to.slotId, lens.blockType, sourceAddress);
              },
            });
          }
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
  }, [edgeId, onNavigateToBlock, patch]);

  return <ContextMenu items={items} anchorPosition={anchorPosition} onClose={onClose} />;
});
