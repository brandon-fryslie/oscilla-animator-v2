/**
 * ConnectionPicker Component
 *
 * MUI Autocomplete-based picker for selecting a port to connect to.
 * Filters compatible ports by type and shows them grouped by block.
 */

import React, { useMemo } from 'react';
import { Autocomplete, TextField } from '@mui/material';
import { observer } from 'mobx-react-lite';
import type { BlockId, PortId } from '../../types';
import type { Patch } from '../../graph/Patch';
import { getBlockDefinition } from '../../blocks/registry';
import { validateConnection, formatTypeForDisplay } from '../reactFlowEditor/typeValidation';
import { colors } from '../theme';

/**
 * Represents a selectable port option in the picker.
 */
interface PortOption {
  blockId: BlockId;
  blockName: string;
  portId: PortId;
  portLabel: string;
  typeDisplay: string;
  isCompatible: boolean;
}

/**
 * Props for ConnectionPicker component.
 */
interface ConnectionPickerProps {
  /** The target port we're connecting TO (for input) or FROM (for output) */
  targetBlockId: BlockId;
  targetPortId: PortId;
  /** Direction of the target port */
  direction: 'input' | 'output';
  /** Current patch to search for compatible ports */
  patch: Patch;
  /** Callback when a port is selected */
  onSelect: (sourceBlockId: BlockId, sourcePortId: PortId) => void;
  /** Callback when picker is cancelled */
  onCancel: () => void;
}

/**
 * ConnectionPicker component.
 */
export const ConnectionPicker = observer(function ConnectionPicker({
  targetBlockId,
  targetPortId,
  direction,
  patch,
  onSelect,
  onCancel,
}: ConnectionPickerProps) {
  // Build list of compatible ports
  const portOptions = useMemo(() => {
    const options: PortOption[] = [];

    // Determine which direction to search
    // If target is INPUT, we search for OUTPUT ports
    // If target is OUTPUT, we search for INPUT ports
    const searchDirection = direction === 'input' ? 'output' : 'input';

    for (const [blockId, block] of patch.blocks) {
      const blockDef = getBlockDefinition(block.type);
      if (!blockDef) continue;

      const portsToCheck = searchDirection === 'input' ? blockDef.inputs : blockDef.outputs;

      for (const [portId, port] of Object.entries(portsToCheck)) {
        // portId comes from Object.entries

        // Skip if this port is already connected
        const isConnected =
          searchDirection === 'input'
            ? patch.edges.some((e) => e.to.blockId === blockId && e.to.slotId === portId)
            : patch.edges.some((e) => e.from.blockId === blockId && e.from.slotId === portId);

        if (isConnected) continue;

        // Check type compatibility
        let validationResult;
        if (direction === 'input') {
          // Target is INPUT, source is OUTPUT
          validationResult = validateConnection(blockId, portId, targetBlockId, targetPortId, patch);
        } else {
          // Target is OUTPUT, source is INPUT
          validationResult = validateConnection(targetBlockId, targetPortId, blockId, portId, patch);
        }

        const isCompatible = validationResult.valid;

        options.push({
          blockId,
          blockName: block.displayName || blockDef.label,
          portId: portId as PortId,
          portLabel: port.label,
          typeDisplay: formatTypeForDisplay(port.type),
          isCompatible,
        });
      }
    }

    // Sort: compatible first, then by block name
    return options.sort((a, b) => {
      if (a.isCompatible !== b.isCompatible) {
        return a.isCompatible ? -1 : 1;
      }
      return a.blockName.localeCompare(b.blockName);
    });
  }, [patch, targetBlockId, targetPortId, direction]);

  // Only show compatible options
  const compatibleOptions = portOptions.filter((opt) => opt.isCompatible);

  return (
    <div style={{ marginTop: '8px' }}>
      <Autocomplete
        options={compatibleOptions}
        groupBy={(option) => option.blockName}
        getOptionLabel={(option) => `${option.portLabel} (${option.typeDisplay})`}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Select port to connect"
            size="small"
            autoFocus
            placeholder="Search..."
          />
        )}
        onChange={(_, value) => {
          if (value) {
            onSelect(value.blockId, value.portId);
          }
        }}
        onClose={() => {
          // Don't call onCancel here - it's handled by the close button
        }}
        sx={{
          '& .MuiAutocomplete-paper': {
            backgroundColor: colors.bgPanel,
          },
          '& .MuiInputBase-root': {
            backgroundColor: colors.bgContent,
            color: colors.textPrimary,
          },
          '& .MuiInputLabel-root': {
            color: colors.textSecondary,
          },
        }}
      />
      <button
        onClick={onCancel}
        style={{
          marginTop: '8px',
          padding: '6px 12px',
          background: 'transparent',
          border: `1px solid ${colors.border}`,
          borderRadius: '4px',
          color: colors.textPrimary,
          cursor: 'pointer',
          fontSize: '12px',
        }}
      >
        Cancel
      </button>
    </div>
  );
});
