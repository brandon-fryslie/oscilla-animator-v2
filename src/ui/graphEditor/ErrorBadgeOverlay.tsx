/**
 * ErrorBadgeOverlay - Renders error badges over graph nodes
 *
 * Observes diagnostics and renders error badges in the top-right corner of nodes
 * that have errors or warnings. Uses ReactFlow's node positions for placement.
 */

import React from 'react';
import { observer } from 'mobx-react-lite';
import { useNodes } from 'reactflow';
import { ErrorBadge } from './ErrorBadge';
import type { DiagnosticsStore } from '../../stores/DiagnosticsStore';
import type { BlockId } from '../../types';

interface ErrorBadgeOverlayProps {
  diagnostics: DiagnosticsStore;
}

/**
 * ErrorBadgeOverlay component.
 * Renders error badges for all nodes with diagnostics.
 */
export const ErrorBadgeOverlay: React.FC<ErrorBadgeOverlayProps> = observer(({ diagnostics }) => {
  const nodes = useNodes();

  return (
    <>
      {nodes.map((node) => {
        const blockId = node.id as BlockId;
        const diags = diagnostics.getDiagnosticsForBlock(blockId);

        if (diags.length === 0) {
          return null;
        }

        // Position badge in top-right corner of node
        // Node dimensions: use computed or measured width/height
        const nodeWidth = (node as any).measured?.width ?? (node as any).width ?? 200;
        const nodeHeight = (node as any).measured?.height ?? (node as any).height ?? 100;

        // Badge position: top-right corner, offset slightly inward
        const badgeX = node.position.x + nodeWidth - 6;
        const badgeY = node.position.y + 6;

        return (
          <ErrorBadge
            key={`badge-${blockId}`}
            diagnostics={diags}
            position={{ x: badgeX, y: badgeY }}
            size={20}
          />
        );
      })}
    </>
  );
});
