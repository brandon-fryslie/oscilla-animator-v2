/**
 * PortContextMenu - Context menu for input/output ports.
 *
 * Features:
 * - Connect to...: Submenu of all compatible ports in the patch
 * - Combine Mode: Cycle through valid combine modes (input ports only)
 * - Add Block: Create new block that auto-connects
 * - Add/Remove Lens: Value transformations (input ports only)
 * - Expose as Input/Output: Expose ports when editing composites
 * - Disconnect: Remove incoming/outgoing edges
 * - Reset to Default: Clear connection and use default source
 */

import React, { useMemo } from 'react';
import {
  LinkOff as DisconnectIcon,
  RestartAlt as ResetIcon,
  Cable as ConnectIcon,
  Add as AddIcon,
  SwapHoriz as CombineIcon,
  Transform as LensIcon,
  RemoveCircle as RemoveLensIcon,
  Output as ExposeIcon,
  VisibilityOff as UnexposeIcon,
} from '@mui/icons-material';
import type { BlockId, PortId, CombineMode } from '../../../types';
import { useStores } from '../../../stores';
import { ContextMenu, type ContextMenuItem } from '../ContextMenu';
import { requireAnyBlockDef } from '../../../blocks/registry';
import {
  getLensLabel,
  getLensDefaultParams,
  groupLensMenuOptions,
} from '../lensUtils';
import { internalBlockId } from '../../../blocks/composite-types';
import {
  getCompatibleBlockTypesForPort,
  getCompatibleLensesForConnection,
  getCompatiblePortsForPort,
  getValidCombineModesForInput,
} from '../../authoring/semanticQueries';

/** Maximum number of "add block" suggestions to show */
const MAX_ADD_BLOCK = 3;

/**
 * Compatible block type for "add block" menu items.
 */
interface CompatibleBlockType {
  blockType: string;
  blockLabel: string;
  portId: string;
}

function randomSample<T>(array: T[], count: number): T[] {
  if (array.length <= count) return array;

  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

/**
 * Get the next combine mode in the cycle.
 */
function getNextCombineMode(current: CombineMode, validModes: CombineMode[]): CombineMode {
  const currentIndex = validModes.indexOf(current);
  const nextIndex = (currentIndex + 1) % validModes.length;
  return validModes[nextIndex];
}

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
  const { patch, layout, selection, compositeEditor, frontend } = useStores();

  const items = useMemo<ContextMenuItem[]>(() => {
    const block = patch.blocks.get(blockId);
    if (!block) return [];

    const blockDef = requireAnyBlockDef(block.type);
    const menuItems: ContextMenuItem[] = [];

    // ==========================================================================
    // Section 1: Connect to... (submenu of all compatible ports)
    // ==========================================================================
    const compatiblePorts = getCompatiblePortsForPort(
      patch.patch,
      frontend,
      blockId,
      portId,
      isInput,
    );

    if (compatiblePorts.length > 0) {
      const children: ContextMenuItem[] = compatiblePorts.map((port) => ({
        label: `${port.blockLabel} · ${port.portLabel}`,
        icon: <ConnectIcon fontSize="small" />,
        action: () => {
          if (isInput) {
            patch.addEdge(
              { kind: 'port', blockId: port.blockId, slotId: port.portId },
              { kind: 'port', blockId, slotId: portId }
            );
          } else {
            patch.addEdge(
              { kind: 'port', blockId, slotId: portId },
              { kind: 'port', blockId: port.blockId, slotId: port.portId }
            );
          }
        },
      }));

      menuItems.push({
        label: `Connect to\u2026`,
        icon: <ConnectIcon fontSize="small" />,
        action: () => {},
        children,
        dividerAfter: true,
      });
    }

    // ==========================================================================
    // Section 2: Combine Mode (input ports only)
    // ==========================================================================
    if (isInput) {
      const inputPort = block.inputPorts.get(portId);
      const inputDef = blockDef.inputs[portId];
      if (inputDef) {
        const validModes = getValidCombineModesForInput(
          patch.patch,
          frontend,
          blockId,
          portId,
        );
        const currentMode = inputPort?.combineMode ?? 'last';

        if (validModes.length > 1) {
          const nextMode = getNextCombineMode(currentMode, validModes);
          menuItems.push({
            label: `Combine: ${currentMode} →`,
            icon: <CombineIcon fontSize="small" />,
            action: () => {
              patch.updateInputPortCombineMode(blockId, portId, nextMode);
            },
            dividerAfter: true,
          });
        }
      }
    }

    // ==========================================================================
    // Section 3: Add Block
    // ==========================================================================
    const compatibleBlockTypes: CompatibleBlockType[] = getCompatibleBlockTypesForPort(
      patch.patch,
      frontend,
      blockId,
      portId,
      isInput,
    );
    const addBlockTypes = randomSample(compatibleBlockTypes, MAX_ADD_BLOCK);

    for (const blockType of addBlockTypes) {
      menuItems.push({
        label: `Add ${blockType.blockLabel}`,
        icon: <AddIcon fontSize="small" />,
        action: () => {
          // Get current block position
          const currentPos = layout.getPosition(blockId);
          const NODE_WIDTH = 200;
          const GAP = 80;

          // Calculate new block position
          const newPos = currentPos
            ? {
                x: isInput
                  ? currentPos.x - NODE_WIDTH - GAP  // Left of current block
                  : currentPos.x + NODE_WIDTH + GAP, // Right of current block
                y: currentPos.y,
              }
            : { x: 100, y: 100 };

          // Create new block
          const newBlockId = patch.addBlock(blockType.blockType, {}, {
            displayName: blockType.blockLabel,
          });

          // Set position
          layout.setPosition(newBlockId, newPos);

          // Create edge
          if (isInput) {
            // New block's output -> this input
            patch.addEdge(
              { kind: 'port', blockId: newBlockId, slotId: blockType.portId },
              { kind: 'port', blockId, slotId: portId }
            );
          } else {
            // This output -> new block's input
            patch.addEdge(
              { kind: 'port', blockId, slotId: portId },
              { kind: 'port', blockId: newBlockId, slotId: blockType.portId }
            );
          }

          // Select new block
          selection.selectBlock(newBlockId);
        },
      });
    }

    if (addBlockTypes.length > 0) {
      menuItems[menuItems.length - 1].dividerAfter = true;
    }

    // ==========================================================================
    // Section 4: Add Lens (input ports only)
    // ==========================================================================
    if (isInput) {
      // Find incoming edge to get source info
      const incomingEdge = patch.edges.find(
        (edge) => edge.to.blockId === blockId && edge.to.slotId === portId
      );

      if (incomingEdge) {
        const compatibleLenses = getCompatibleLensesForConnection(
          patch.patch,
          frontend,
          incomingEdge.from.blockId as BlockId,
          incomingEdge.from.slotId as PortId,
          blockId,
          portId,
        );
        const grouped = groupLensMenuOptions(compatibleLenses);
        const describeLens = (label: string, description: string): string =>
          description.trim().length > 0 ? `${label} - ${description}` : label;

        const addLens = (lensType: string): void => {
          const params = getLensDefaultParams(lensType);
          const sourceAddress = `v1:blocks.${incomingEdge.from.blockId}.outputs.${incomingEdge.from.slotId}`;
          patch.addLens(blockId, portId, lensType, sourceAddress, params);
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
    }

    // ==========================================================================
    // Section 5: Remove Lens (input ports only)
    // ==========================================================================
    if (isInput) {
      const existingLenses = patch.getLensesForPort(blockId, portId);

      if (existingLenses.length > 0) {
        // Add each lens removal as a direct menu item
        for (const lens of existingLenses) {
          menuItems.push({
            label: `Remove Lens: ${getLensLabel(lens.lensType)}`,
            icon: <RemoveLensIcon fontSize="small" />,
            action: () => {
              patch.removeLens(blockId, portId, lens.id);
            },
          });
        }
      }
    }

    // Add divider after lens section if any lens items were added
    const lastItem = menuItems[menuItems.length - 1];
    if (lastItem && (lastItem.label.includes('Lens'))) {
      lastItem.dividerAfter = true;
    }

    // ==========================================================================
    // Section 6: Expose as Input/Output (composite editing only)
    // ==========================================================================
    if (compositeEditor.isOpen) {
      // Convert blockId to InternalBlockId
      const internalBlockIdValue = internalBlockId(blockId);

      if (isInput) {
        const isExposed = compositeEditor.exposedInputs.some(
          exp => exp.internalBlockId === internalBlockIdValue && exp.internalPortId === portId
        );
        menuItems.push({
          label: isExposed ? 'Unexpose Input' : 'Expose as Input',
          icon: isExposed ? <UnexposeIcon fontSize="small" /> : <ExposeIcon fontSize="small" />,
          action: () => {
            if (isExposed) {
              compositeEditor.unexposeInputPort(internalBlockIdValue, portId);
            } else {
              // Use portId as the external ID by default
              compositeEditor.exposeInputPort(portId, internalBlockIdValue, portId);
            }
          },
          dividerAfter: true,
        });
      } else {
        const isExposed = compositeEditor.exposedOutputs.some(
          exp => exp.internalBlockId === internalBlockIdValue && exp.internalPortId === portId
        );
        menuItems.push({
          label: isExposed ? 'Unexpose Output' : 'Expose as Output',
          icon: isExposed ? <UnexposeIcon fontSize="small" /> : <ExposeIcon fontSize="small" />,
          action: () => {
            if (isExposed) {
              compositeEditor.unexposeOutputPort(internalBlockIdValue, portId);
            } else {
              // Use portId as the external ID by default
              compositeEditor.exposeOutputPort(portId, internalBlockIdValue, portId);
            }
          },
          dividerAfter: true,
        });
      }
    }

    // ==========================================================================
    // Section 7: Disconnect / Reset
    // ==========================================================================
    if (isInput) {
      const connectedEdge = patch.edges.find(
        (edge) => edge.to.blockId === blockId && edge.to.slotId === portId
      );
      const hasConnection = !!connectedEdge;

      // Check if port has a default source
      const inputPort = block.inputPorts.get(portId);
      const hasDefault = !!inputPort?.defaultSource;

      menuItems.push({
        label: 'Disconnect',
        icon: <DisconnectIcon fontSize="small" />,
        action: () => {
          if (connectedEdge) {
            patch.removeEdge(connectedEdge.id);
          }
        },
        disabled: !hasConnection,
      });

      menuItems.push({
        label: 'Reset to Default',
        icon: <ResetIcon fontSize="small" />,
        action: () => {
          if (connectedEdge) {
            patch.removeEdge(connectedEdge.id);
          }
          // [LAW:single-enforcer] PatchStore.updateInputPort is the sole mutator
          // for per-port default source overrides.
          patch.updateInputPort(blockId, portId, { defaultSource: undefined });
        },
        disabled: !hasConnection && !hasDefault,
      });
    } else {
      // Output port: Disconnect All
      const connectedEdges = patch.edges.filter(
        (edge) => edge.from.blockId === blockId && edge.from.slotId === portId
      );
      const hasConnections = connectedEdges.length > 0;

      menuItems.push({
        label: `Disconnect All (${connectedEdges.length})`,
        icon: <DisconnectIcon fontSize="small" />,
        action: () => {
          for (const edge of connectedEdges) {
            patch.removeEdge(edge.id);
          }
        },
        disabled: !hasConnections,
      });
    }

    return menuItems;
  }, [blockId, portId, isInput, patch, layout, selection, compositeEditor, frontend]);

  return <ContextMenu items={items} anchorPosition={anchorPosition} onClose={onClose} />;
};
