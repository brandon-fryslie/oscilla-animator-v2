/**
 * OscillaEdge - Custom Edge Component
 *
 * Renders edges with visual indicators for:
 * - Lenses and adapters (amber badge)
 * - Errors and warnings (red/orange stroke)
 * - Debug hover state
 */

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from 'reactflow';
import React, { useMemo, useState } from 'react';
import { Popover } from '@mui/material';
import { observer } from 'mobx-react-lite';
import type { OscillaEdgeData } from './nodes';
import { getLensLabel } from './lensUtils';
import { lensTargetsConnection } from './lensUtils';
import type { Diagnostic } from '../../diagnostics/types';
import type { BlockId } from '../../types';
import { useStores } from '../../stores';
import { LensParamControls } from '../components/LensParamControls';
import { graphColors } from '../graphEditor/graph-tokens';
import { derivedLensBlockId } from '../../graph/lens-block-id';
import { useDebugPortMiniView } from '../debug-viz/useDebugMiniView';
import { DebugEdgeValueDisplay } from '../debug-viz/DebugMiniView';

/**
 * Extended edge data including diagnostics.
 */
export interface OscillaEdgeDataWithDiagnostics extends OscillaEdgeData {
  /** Diagnostics affecting this edge */
  diagnostics?: Diagnostic[];
}

interface LensImpactPreviewProps {
  beforeBlockId: string | null;
  beforePortId: string | null;
  afterBlockId: string | null;
  afterPortId: string | null;
  beforeLabel: string;
  afterLabel: string;
}

function LensImpactPreview(props: LensImpactPreviewProps): React.ReactElement {
  const beforeData = useDebugPortMiniView(
    props.beforeBlockId,
    props.beforePortId,
    props.beforeLabel,
  );
  const afterData = useDebugPortMiniView(
    props.afterBlockId,
    props.afterPortId,
    props.afterLabel,
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, color: '#bbb', fontWeight: 700 }}>
        Lens Impact
      </div>
      {beforeData ? (
        <DebugEdgeValueDisplay data={beforeData} />
      ) : (
        <div style={{ fontSize: 11, color: '#888' }}>
          Before value unavailable.
        </div>
      )}
      {afterData ? (
        <DebugEdgeValueDisplay data={afterData} />
      ) : (
        <div style={{ fontSize: 11, color: '#888' }}>
          After value unavailable.
        </div>
      )}
    </div>
  );
}

/**
 * Determine edge stroke color based on diagnostics.
 */
function getEdgeStrokeColor(diagnostics?: Diagnostic[]): string {
  if (!diagnostics || diagnostics.length === 0) {
    return graphColors.edgeDefault;
  }

  const hasError = diagnostics.some(d => d.severity === 'error' || d.severity === 'fatal');
  const hasWarning = diagnostics.some(d => d.severity === 'warn');

  if (hasError) {
    return graphColors.edgeError;
  }

  if (hasWarning) {
    return graphColors.edgeWarning;
  }

  return graphColors.edgeDefault;
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
export const OscillaEdge = observer(function OscillaEdge(
  props: EdgeProps<OscillaEdgeDataWithDiagnostics>,
) {
  const {
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    data,
  } = props;
  const sourceHandle = (props as { sourceHandle?: string; sourceHandleId?: string }).sourceHandle
    ?? (props as { sourceHandleId?: string }).sourceHandleId
    ?? '';
  const targetHandle = (props as { targetHandle?: string; targetHandleId?: string }).targetHandle
    ?? (props as { targetHandleId?: string }).targetHandleId
    ?? '';
  const { selection, frontend, patch } = useStores();
  const [chipAnchorPosition, setChipAnchorPosition] = useState<{ top: number; left: number } | null>(null);
  const [activeLensContext, setActiveLensContext] = useState<{ lensId: string; targetPortId: string } | null>(null);
  const [hoverLensContext, setHoverLensContext] = useState<{
    lensId: string;
    lensIndex: number;
    targetPortId: string;
    top: number;
    left: number;
  } | null>(null);

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

  const sourceDisplayName = patch.blocks.get(source as BlockId)?.displayName;

  const edgeLenses = useMemo(
    () =>
      (data?.lenses ?? []).filter((lens) =>
        lensTargetsConnection(lens, source, sourceHandle ?? '', sourceDisplayName),
      ),
    [data?.lenses, source, sourceHandle, sourceDisplayName],
  );

  const hasLenses = edgeLenses.length > 0;

  const adapterCount = useMemo(() => {
    if (!targetHandle) return 0;
    const provenance = frontend.getPortProvenanceByIds(target, targetHandle, 'in');
    if (!provenance || provenance.kind === 'unresolved') return 0;
    return provenance.chain.filter((step) => step.kind === 'adapter').length;
  }, [frontend, target, targetHandle]);

  const hasTransforms = hasLenses || adapterCount > 0;

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
  } else if (hasTransforms) {
    const labels = [
      ...edgeLenses.map((lens) => getLensLabel(lens.lensType)),
      ...(adapterCount > 0 ? [`Adapters x${adapterCount}`] : []),
    ];
    tooltipText = labels.join(', ');
  }

  const activeLens = edgeLenses.find((lens) => lens.id === activeLensContext?.lensId) ?? null;
  const activeTargetPortId = activeLensContext?.targetPortId ?? '';
  const hoverLens = edgeLenses.find((lens) => lens.id === hoverLensContext?.lensId) ?? null;
  const hoverTargetPortId = hoverLensContext?.targetPortId ?? '';

  const closeLensPopover = (): void => {
    setChipAnchorPosition(null);
    setActiveLensContext(null);
  };

  const closeHoverPreview = (): void => {
    setHoverLensContext(null);
  };

  return (
    <>
      {/* Main edge path */}
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={edgeStyle} />

      {/* Diagnostic indicator - REMOVED: Diagnostics now shown in port popovers */}
      {/* Edge color already indicates errors (red) and warnings (orange) */}

      {/* Transform indicator chips (lenses + adapters) */}
      {hasTransforms && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${indicatorX}px, ${indicatorY}px)`,
              pointerEvents: 'all',
              display: 'flex',
              gap: 4,
              alignItems: 'center',
            }}
            title={tooltipText}
          >
            {edgeLenses.map((lens, lensIndex) => (
              <button
                key={lens.id}
                onMouseDown={(event) => {
                  event.stopPropagation();
                }}
                onMouseEnter={(event) => {
                  event.stopPropagation();
                  if (!targetHandle) return;
                  setHoverLensContext({
                    lensId: lens.id,
                    lensIndex,
                    targetPortId: targetHandle,
                    top: event.clientY,
                    left: event.clientX,
                  });
                }}
                onMouseLeave={closeHoverPreview}
                onClick={(event) => {
                  event.stopPropagation();
                  selection.selectEdge(id);
                  if (!targetHandle) return;
                  closeHoverPreview();
                  setActiveLensContext({ lensId: lens.id, targetPortId: targetHandle });
                  setChipAnchorPosition({ top: event.clientY, left: event.clientX });
                }}
                style={{
                  height: 18,
                  borderRadius: 9,
                  background: graphColors.lensBadge,
                  border: '1px solid #d97706',
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#111',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 6px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
                  cursor: 'pointer',
                  maxWidth: 110,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={`${getLensLabel(lens.lensType)} (hover: preview, click: edit)`}
              >
                {getLensLabel(lens.lensType)}
              </button>
            ))}

            {adapterCount > 0 && (
              <div
                onClick={(event) => {
                  event.stopPropagation();
                  selection.selectEdge(id);
                }}
                style={{
                  height: 18,
                  borderRadius: 9,
                  background: 'rgba(255,165,0,0.16)',
                  border: '1px solid rgba(255,165,0,0.5)',
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#fbbf24',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 6px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
                  cursor: 'pointer',
                }}
                title={`Adapters x${adapterCount}`}
              >
                A{adapterCount}
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}

      <Popover
        open={Boolean(hoverLensContext && hoverLens && hoverTargetPortId)}
        anchorReference="anchorPosition"
        anchorPosition={hoverLensContext ? { top: hoverLensContext.top, left: hoverLensContext.left } : undefined}
        onClose={closeHoverPreview}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        disableAutoFocus
        disableEnforceFocus
        disableRestoreFocus
        slotProps={{
          paper: {
            style: { pointerEvents: 'none' },
          },
        }}
      >
        {hoverLens && hoverLensContext && (
          <div
            style={{
              minWidth: 320,
              maxWidth: 420,
              maxHeight: 520,
              overflow: 'auto',
              padding: 10,
              background: 'linear-gradient(135deg, rgba(22, 24, 30, 0.98) 0%, rgba(14, 16, 22, 0.98) 100%)',
              border: '1px solid rgba(217, 119, 6, 0.35)',
            }}
          >
            <LensImpactPreview
              beforeBlockId={
                hoverLensContext.lensIndex === 0
                  ? source
                  : (edgeLenses[hoverLensContext.lensIndex - 1]
                    ? derivedLensBlockId(hoverTargetPortId, edgeLenses[hoverLensContext.lensIndex - 1].id)
                    : null)
              }
              beforePortId={hoverLensContext.lensIndex === 0 ? sourceHandle : 'out'}
              afterBlockId={derivedLensBlockId(hoverTargetPortId, hoverLens.id)}
              afterPortId="out"
              beforeLabel={hoverLensContext.lensIndex === 0
                ? `before · ${source}.${sourceHandle}`
                : `before · lens ${hoverLensContext.lensIndex}`}
              afterLabel={`after · ${getLensLabel(hoverLens.lensType)}`}
            />
          </div>
        )}
      </Popover>

      <Popover
        open={Boolean(chipAnchorPosition && activeLens && activeTargetPortId)}
        anchorReference="anchorPosition"
        anchorPosition={chipAnchorPosition ?? undefined}
        onClose={closeLensPopover}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        disableAutoFocus
        disableEnforceFocus
        disableRestoreFocus
      >
        {activeLens && activeTargetPortId && (
          <div
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            style={{
              minWidth: 280,
              maxWidth: 360,
              padding: 12,
              background: 'linear-gradient(135deg, rgba(30, 30, 40, 0.98) 0%, rgba(20, 20, 30, 0.98) 100%)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
              {getLensLabel(activeLens.lensType)}
            </div>
            <LensParamControls
              lens={activeLens}
              targetBlockId={target as BlockId}
              targetPortId={activeTargetPortId}
              compact
            />
          </div>
        )}
      </Popover>
    </>
  );
});
