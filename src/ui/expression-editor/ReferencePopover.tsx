/**
 * Reference Popover
 *
 * Hover popup shown when hovering over a reference chip in the expression editor.
 * Displays metadata about the referenced port (type, connection status).
 */

import React, { useState, useEffect, useRef } from 'react';
import type { AddressRegistry } from '../../graph/address-registry';
import { colors } from '../theme';

// =============================================================================
// Component Props
// =============================================================================

export interface ReferencePopoverProps {
  /** The shorthand being hovered (e.g., "circle_1.radius") */
  readonly shorthand: string;

  /** AddressRegistry for resolving the shorthand */
  readonly addressRegistry: AddressRegistry;

  /** Whether the reference is connected */
  readonly isConnected: boolean;

  /** Position of the popover (viewport coordinates) */
  readonly position: { top: number; left: number };

  /** Called when popover should close */
  readonly onClose: () => void;
}

// =============================================================================
// Component
// =============================================================================

/**
 * ReferencePopover - Hover tooltip for reference chips.
 *
 * Shows:
 * - Block type and port name
 * - Payload type (e.g., Signal<float>)
 * - Connection status (Connected/Not connected)
 *
 * Positioning: Fixed position, viewport-aware.
 */
export const ReferencePopover: React.FC<ReferencePopoverProps> = ({
  shorthand,
  addressRegistry,
  isConnected,
  position,
  onClose,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!popoverRef.current) return;

    const rect = popoverRef.current.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    let { top, left } = position;

    // Adjust horizontal position
    if (left + rect.width > viewport.width) {
      left = Math.max(0, viewport.width - rect.width - 10);
    }

    // Adjust vertical position
    if (top + rect.height > viewport.height) {
      top = Math.max(0, position.top - rect.height - 10);
    }

    setAdjustedPosition({ top, left });
  }, [position]);

  // Resolve the shorthand
  const canonicalAddress = addressRegistry.resolveShorthand(shorthand);
  const resolved = canonicalAddress
    ? addressRegistry.resolve(
        canonicalAddress.kind === 'output'
          ? `v1:blocks.${canonicalAddress.blockId}.outputs.${canonicalAddress.portId}`
          : ''
      )
    : null;

  // Extract metadata
  let blockType = 'Unknown';
  let portName = shorthand.split('.')[1] || 'unknown';
  let payloadTypeStr = 'unknown';
  let cardinalityStr = 'Signal';

  if (resolved?.kind === 'output') {
    const block = resolved.block;
    blockType = block.type;
    portName = resolved.portId;

    const type = resolved.type;
    payloadTypeStr = type.payload.kind;

    const cardAxis = type.extent.cardinality;
    if (cardAxis.kind === 'inst') {
      const card = cardAxis.value.kind;
      cardinalityStr = card === 'one' ? 'Signal' : card === 'many' ? 'Field' : 'Const';
    }
  }

  const typeDesc = `${cardinalityStr}<${payloadTypeStr}>`;

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top: `${adjustedPosition.top}px`,
        left: `${adjustedPosition.left}px`,
        backgroundColor: colors.bgPanel,
        border: `1px solid ${colors.border}`,
        borderRadius: '4px',
        padding: '8px 12px',
        fontSize: '12px',
        color: colors.textPrimary,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        zIndex: 10000,
        pointerEvents: 'none',
        maxWidth: '300px',
      }}
    >
      <div style={{ marginBottom: '4px', fontWeight: 500 }}>
        {blockType} / {portName}
      </div>
      <div style={{ color: colors.textSecondary, marginBottom: '4px' }}>
        {typeDesc}
      </div>
      <div
        style={{
          fontSize: '10px',
          color: isConnected ? colors.primary : colors.warning,
          fontWeight: 500,
        }}
      >
        {isConnected ? '✓ Connected' : '⚠ Not connected'}
      </div>
    </div>
  );
};
