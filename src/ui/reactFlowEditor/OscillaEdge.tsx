/**
 * OscillaEdge - Custom Edge Component
 *
 * Renders edges with visual indicators for:
 * - Lenses and adapters (amber badge)
 * - Errors and warnings (red/orange stroke)
 * - Debug hover state
 */

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from 'reactflow';
import type { OscillaEdgeData } from './nodes';
import { getLensLabel } from './lensUtils';
import type { Diagnostic } from '../../diagnostics/types';

/**
 * Extended edge data including diagnostics.
 */
export interface OscillaEdgeDataWithDiagnostics extends OscillaEdgeData {
  /** Diagnostics affecting this edge */
  diagnostics?: Diagnostic[];
}

/**
 * Determine edge stroke color based on diagnostics.
 */
function getEdgeStrokeColor(diagnostics?: Diagnostic[]): string {
  if (!diagnostics || diagnostics.length === 0) {
    return '#4ecdc4'; // Default teal
  }

  const hasError = diagnostics.some(d => d.severity === 'error' || d.severity === 'fatal');
  const hasWarning = diagnostics.some(d => d.severity === 'warn');

  if (hasError) {
    return '#ef4444'; // Red for errors
  }

  if (hasWarning) {
    return '#f59e0b'; // Orange for warnings
  }

  return '#4ecdc4'; // Default
}

/**
 * Custom edge component for Oscilla connections.
 *
 * Features:
 * - Standard bezier edge path
 * - Error/warning indication (red/orange stroke)
 * - Amber lens indicator near target port when lenses are present
 * - Hover tooltip showing lens details or errors
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
}: EdgeProps<OscillaEdgeDataWithDiagnostics>) {
  // Compute bezier path
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Determine stroke color based on diagnostics
  const strokeColor = getEdgeStrokeColor(data?.diagnostics);
  const hasDiagnostics = data?.diagnostics && data.diagnostics.length > 0;

  // Apply diagnostic styling
  const edgeStyle = {
    ...style,
    stroke: strokeColor,
    strokeWidth: hasDiagnostics ? 2.5 : (style.strokeWidth ?? 2),
  };

  // Check if this edge has lenses
  const hasLenses = data?.lenses && data.lenses.length > 0;
  const lensCount = data?.lenses?.length ?? 0;

  // Compute position for lens indicator (near target port)
  // Place it at 90% along the edge path, biased toward the target
  const indicatorX = targetX * 0.9 + sourceX * 0.1;
  const indicatorY = targetY * 0.9 + sourceY * 0.1;

  // Build tooltip text
  let tooltipText = '';
  if (hasDiagnostics) {
    tooltipText = data!.diagnostics!
      .map(d => `${d.severity.toUpperCase()}: ${d.message}`)
      .join('\n');
  } else if (hasLenses) {
    tooltipText = data!.lenses!.map(l => getLensLabel(l.lensType)).join(', ');
  }

  return (
    <>
      {/* Main edge path */}
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={edgeStyle} />

      {/* Diagnostic indicator - REMOVED: Diagnostics now shown in port popovers */}
      {/* Edge color already indicates errors (red) and warnings (orange) */}

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
