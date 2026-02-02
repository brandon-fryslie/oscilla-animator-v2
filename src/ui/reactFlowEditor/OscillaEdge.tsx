/**
 * OscillaEdge - Custom Edge Component
 *
 * Renders edges with visual indicators for lenses and adapters.
 * Shows an amber lens badge near the target port when lenses are present.
 */

import React from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from 'reactflow';
import type { OscillaEdgeData } from './nodes';
import { getLensLabel } from './lensUtils';

/**
 * Custom edge component for Oscilla connections.
 *
 * Features:
 * - Standard bezier edge path
 * - Amber lens indicator near target port when lenses are present
 * - Hover tooltip showing lens details
 * - Preserves all existing edge styling (adapters, non-contributing)
 */
export function OscillaEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: EdgeProps<OscillaEdgeData>) {
  // Compute bezier path
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Check if this edge has lenses
  const hasLenses = data?.lenses && data.lenses.length > 0;
  const lensCount = data?.lenses?.length ?? 0;

  // Compute position for lens indicator (near target port)
  // Place it at 90% along the edge path, biased toward the target
  const indicatorX = targetX * 0.9 + sourceX * 0.1;
  const indicatorY = targetY * 0.9 + sourceY * 0.1;

  // Build tooltip text
  const tooltipText = hasLenses
    ? data!.lenses!.map(l => getLensLabel(l.lensType)).join(', ')
    : '';

  return (
    <>
      {/* Main edge path */}
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />

      {/* Lens indicator badge (only if lenses present) */}
      {hasLenses && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${indicatorX}px, ${indicatorY}px)`,
              pointerEvents: 'all',
              cursor: 'pointer',
            }}
            title={tooltipText}
            onClick={(e) => {
              // Stop propagation to prevent edge selection
              e.stopPropagation();
              // Future: open lens editor context menu
            }}
          >
            <div
              style={{
                minWidth: lensCount > 1 ? '18px' : '10px',
                height: '10px',
                borderRadius: '5px',
                background: '#f59e0b', // Amber color
                border: '1px solid #d97706', // Darker amber border
                fontSize: '8px',
                fontWeight: 'bold',
                color: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 3px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
              }}
            >
              {lensCount > 1 ? lensCount : ''}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
