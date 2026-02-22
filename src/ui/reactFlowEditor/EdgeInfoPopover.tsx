/**
 * EdgeInfoPopover - Edge-level debug preview.
 *
 * Distinct from lens popovers:
 * - Represents the edge probe itself
 * - Hover preview, optional click pin
 */

import React from 'react';
import { useDebugMiniView } from '../debug-viz/useDebugMiniView';
import { DebugEdgeValueDisplay } from '../debug-viz/DebugMiniView';
import { BasePopover, POPUP_SURFACE_STYLE, type PopoverAnchorPosition } from './BasePopover';

interface EdgeInfoPopoverProps {
  edgeId: string | null;
  edgeLabel: string | null;
  anchorPosition: PopoverAnchorPosition | null;
  pinned: boolean;
  onClose: () => void;
}

export const EdgeInfoPopover: React.FC<EdgeInfoPopoverProps> = ({
  edgeId,
  edgeLabel,
  anchorPosition,
  pinned,
  onClose,
}) => {
  const data = useDebugMiniView(edgeId, edgeLabel);
  const open = Boolean(edgeId && anchorPosition);

  if (!open) {
    return null;
  }

  return (
    <BasePopover
      open={open}
      anchorPosition={anchorPosition}
      interactive={pinned}
      onClose={onClose}
      paperStyle={{
        ...POPUP_SURFACE_STYLE,
        minWidth: 390,
        maxWidth: 390,
        maxHeight: 430,
        overflow: 'auto',
        padding: 10,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ color: '#4ecdc4', fontSize: 12, fontWeight: 700 }}>
          Edge Probe
        </div>
        {data ? (
          <DebugEdgeValueDisplay data={data} />
        ) : (
          <div style={{ color: '#94a3b8', fontSize: 11 }}>
            No debug value available for this edge yet.
          </div>
        )}
      </div>
    </BasePopover>
  );
};
