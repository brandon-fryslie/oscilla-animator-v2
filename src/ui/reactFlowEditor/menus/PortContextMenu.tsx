/**
 * PortContextMenu - Context menu for input/output ports.
 *
 * Features:
 * - Quick Connect: Shows up to 3 compatible ports to connect to
 * - Combine Mode: Cycle through valid combine modes (input ports only)
 * - Add Block: Create new block that auto-connects (planned)
 * - Disconnect: Remove incoming/outgoing edges
 * - Reset to Default: Clear connection and use default source
 */

import React, { useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import {
  LinkOff as DisconnectIcon,
  RestartAlt as ResetIcon,
  Cable as ConnectIcon,
  Add as AddIcon,
  SwapHoriz as CombineIcon,
} from '@mui/icons-material';
import type { BlockId, PortId, CombineMode } from '../../../types';
import { COMBINE_MODE_CATEGORY } from '../../../types';
import { useStores } from '../../../stores';
import { ContextMenu, type ContextMenuItem } from '../ContextMenu';
import { validateConnection } from '../typeValidation';
import { requireBlockDef, getBlockCategories, getBlockTypesByCategory, type BlockDef } from '../../../blocks/registry';
import type { PayloadType } from '../../../core/canonical-types';

/** Maximum number of quick connect suggestions to show */
const MAX_QUICK_CONNECT = 3;

/** Maximum number of "add block" suggestions to show */
const MAX_ADD_BLOCK = 3;

/**
 * Compatible port info for quick connect menu items.
 */
interface CompatiblePort {
  blockId: BlockId;
  portId: PortId;
  blockLabel: string;
  portLabel: string;
}

/**
 * Compatible block type for "add block" menu items.
 */
interface CompatibleBlockType {
  blockType: string;
  blockLabel: string;
  portId: string;  // The port to connect to
}

/**
 * Find compatible ports for quick connect.
 * For input ports: finds output ports that can connect to this input.
 * For output ports: finds input ports that can receive from this output.
 */
function findCompatiblePorts(
  patch: ReturnType<typeof useStores>['patch']['patch'],
  blockId: BlockId,
  portId: PortId,
  isInput: boolean
): CompatiblePort[] {
  const compatible: CompatiblePort[] = [];

  for (const [otherBlockId, otherBlock] of patch.blocks) {
    // Skip self
    if (otherBlockId === blockId) continue;

    const otherBlockDef = requireBlockDef(otherBlock.type);
    const portsToCheck = isInput ? otherBlockDef.outputs : otherBlockDef.inputs;

    for (const [otherPortId, portDef] of Object.entries(portsToCheck)) {
      // Skip ports that aren't exposed
      if ('exposedAsPort' in portDef && portDef.exposedAsPort === false) continue;

      // Check type compatibility
      let result;
      if (isInput) {
        // We want to connect otherBlock.output -> this.input
        result = validateConnection(
          otherBlockId,
          otherPortId as PortId,
          blockId,
          portId,
          patch
        );
      } else {
        // We want to connect this.output -> otherBlock.input
        result = validateConnection(
          blockId,
          portId,
          otherBlockId,
          otherPortId as PortId,
          patch
        );
      }

      if (result.valid) {
        compatible.push({
          blockId: otherBlockId,
          portId: otherPortId as PortId,
          blockLabel: otherBlock.displayName || otherBlockDef.label || otherBlock.type,
          portLabel: portDef.label || otherPortId,
        });
      }
    }
  }

  return compatible;
}

/**
 * Get a random sample from an array.
 */
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
 * Find compatible block types that could be added and connected to this port.
 * For input ports: finds blocks with compatible outputs.
 * For output ports: finds blocks with compatible inputs.
 */
function findCompatibleBlockTypes(
  patch: ReturnType<typeof useStores>['patch']['patch'],
  blockId: BlockId,
  portId: PortId,
  isInput: boolean
): CompatibleBlockType[] {
  const compatible: CompatibleBlockType[] = [];
  const thisBlock = patch.blocks.get(blockId);
  if (!thisBlock) return compatible;

  const thisBlockDef = requireBlockDef(thisBlock.type);
  const thisPortDef = isInput
    ? thisBlockDef.inputs[portId]
    : thisBlockDef.outputs[portId];

  if (!thisPortDef) return compatible;

  // Get all block types from registry
  const categories = getBlockCategories();
  for (const category of categories) {
    const blockTypes = getBlockTypesByCategory(category);
    for (const blockDef of blockTypes) {
      // Skip time blocks (hidden from library)
      if (blockDef.capability === 'time') continue;

      // Check if any port is compatible
      const portsToCheck = isInput ? blockDef.outputs : blockDef.inputs;

      for (const [candidatePortId, candidatePortDef] of Object.entries(portsToCheck)) {
        // Skip ports that aren't exposed
        if ('exposedAsPort' in candidatePortDef && candidatePortDef.exposedAsPort === false) continue;

        // For compatibility checking, we need the types
        // Since we don't have a real block instance, do a simple payload type check
        const thisPayload = thisPortDef.type.payload;
        const candidatePayload = candidatePortDef.type.payload;

        // Simple compatibility: same payload type
        // Full validation would require type inference, but this is good enough for suggestions
        if (thisPayload === candidatePayload) {
          compatible.push({
            blockType: blockDef.type,
            blockLabel: blockDef.label || blockDef.type,
            portId: candidatePortId,
          });
          break; // One match per block type is enough
        }
      }
    }
  }

  return compatible;
}

/**
 * Get valid combine modes for a given payload type.
 */
function getValidCombineModes(payloadType: PayloadType): CombineMode[] {
  const isNumeric = ['float', 'int', 'vec2', 'vec3', 'color'].includes(payloadType as string);
  const isBoolean = payloadType .kind === 'bool';

  return (Object.entries(COMBINE_MODE_CATEGORY) as [CombineMode, string][])
    .filter(([_, category]) => {
      if (category === 'any') return true;
      if (category === 'numeric' && isNumeric) return true;
      if (category === 'boolean' && isBoolean) return true;
      return false;
    })
    .map(([mode]) => mode);
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

export const PortContextMenu: React.FC<PortContextMenuProps> = observer(({
  blockId,
  portId,
  isInput,
  anchorPosition,
  onClose,
}) => {
  const { patch, layout, selection } = useStores();

  const items = useMemo<ContextMenuItem[]>(() => {
    const block = patch.blocks.get(blockId);
    if (!block) return [];

    const blockDef = requireBlockDef(block.type);
    const menuItems: ContextMenuItem[] = [];

    // ==========================================================================
    // Section 1: Quick Connect
    // ==========================================================================
    const compatiblePorts = findCompatiblePorts(patch.patch, blockId, portId, isInput);
    const quickConnectPorts = randomSample(compatiblePorts, MAX_QUICK_CONNECT);

    for (const port of quickConnectPorts) {
      menuItems.push({
        label: `Connect to ${port.blockLabel}.${port.portLabel}`,
        icon: <ConnectIcon fontSize="small" />,
        action: () => {
          if (isInput) {
            // Connect: otherBlock.output -> this.input
            patch.addEdge(
              { kind: 'port', blockId: port.blockId, slotId: port.portId },
              { kind: 'port', blockId, slotId: portId }
            );
          } else {
            // Connect: this.output -> otherBlock.input
            patch.addEdge(
              { kind: 'port', blockId, slotId: portId },
              { kind: 'port', blockId: port.blockId, slotId: port.portId }
            );
          }
        },
      });
    }

    if (quickConnectPorts.length > 0) {
      menuItems[menuItems.length - 1].dividerAfter = true;
    }

    // ==========================================================================
    // Section 2: Combine Mode (input ports only)
    // ==========================================================================
    if (isInput) {
      const inputPort = block.inputPorts.get(portId);
      const inputDef = blockDef.inputs[portId];
      if (inputDef) {
        const payloadType = inputDef.type.payload;
        const validModes = getValidCombineModes(payloadType);
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
    const compatibleBlockTypes = findCompatibleBlockTypes(patch.patch, blockId, portId, isInput);
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
    // Section 4: Disconnect / Reset
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
          // TODO: Implement clearInputPortDefaultSource() in PatchStore
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
  }, [blockId, portId, isInput, patch, layout, selection]);

  return <ContextMenu items={items} anchorPosition={anchorPosition} onClose={onClose} />;
});
