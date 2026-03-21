/**
 * ConnectionPicker Component
 *
 * MUI Autocomplete-based picker for selecting a port to connect to.
 * Filters compatible ports by type and shows them grouped by block.
 */

import React, { useMemo } from 'react';
import { Autocomplete, TextField } from '@mui/material';
import type { BlockId, PortId } from '../../types';
import type { Patch } from '../../graph/Patch';
import { requireAnyBlockDef } from '../../blocks/registry';
import { formatTypeForDisplay } from '../reactFlowEditor/typeValidation';
import { colors } from '../theme';
import { useStores } from '../../stores';
import { getCompatiblePortsForPort } from '../authoring/semanticQueries';

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
export const ConnectionPicker: React.FC<ConnectionPickerProps> = function ConnectionPicker({
  targetBlockId,
  targetPortId,
  direction,
  patch,
  onSelect,
  onCancel,
}: ConnectionPickerProps) {
  const { frontend } = useStores();

  // Build list of compatible ports
  const portOptions = useMemo(() => {
    return getCompatiblePortsForPort(
      patch,
      frontend,
      targetBlockId,
      targetPortId,
      direction === 'input',
    )
      .map((candidate): PortOption => {
        const block = patch.blocks.get(candidate.blockId)!;
        const blockDef = requireAnyBlockDef(block.type);
        const searchDirection = direction === 'input' ? 'output' : 'input';
        const portDef = searchDirection === 'input'
          ? blockDef.inputs[candidate.portId]
          : blockDef.outputs[candidate.portId];

        return {
          blockId: candidate.blockId,
          blockName: candidate.blockLabel,
          portId: candidate.portId,
          portLabel: candidate.portLabel,
          typeDisplay: portDef?.type ? formatTypeForDisplay(portDef.type) : '',
          isCompatible: true,
        };
      })
      .sort((a, b) => a.blockName.localeCompare(b.blockName));
  }, [patch, frontend, targetBlockId, targetPortId, direction]);

  return (
    <div style={{ marginTop: '8px' }}>
      <Autocomplete
        options={portOptions}
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
};
