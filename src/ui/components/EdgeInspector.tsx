/**
 * Edge Inspector Component
 *
 * Rich inspector panel for selected edges. Shows:
 * - Source/target endpoints with resolved types
 * - Transform chain (lenses, adapters) with types at each step
 * - Debug probe (when debug enabled)
 * - Lens management (add/remove)
 * - Edge deletion
 */

import React, { useCallback, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../stores';
import { colors } from '../theme';
import { formatSignalType } from './typeFormatters';
import type { Edge, Patch } from '../../graph/Patch';
import type { BlockId } from '../../types';
import type { CanonicalType } from '../../core/canonical-types';
import type { TransformStep } from '../../types';
import type { PortProvenance } from '../../stores/FrontendResultStore';
import { requireAnyBlockDef } from '../../blocks/registry';
import { findCompatibleLenses, getLensLabel, type LensTypeInfo } from '../reactFlowEditor/lensUtils';
import { useDebugMiniView } from '../debug-viz/useDebugMiniView';
import { DebugEdgeValueDisplay } from '../debug-viz/DebugMiniView';

// =============================================================================
// EdgeEndpoint - Shows a single endpoint (source or target)
// =============================================================================

interface EdgeEndpointProps {
  label: 'Source' | 'Target';
  blockId: string;
  slotId: string;
  patch: Patch;
  resolvedType: CanonicalType | undefined;
  onBlockClick: () => void;
}

function EdgeEndpoint({ label, blockId, slotId, patch, resolvedType, onBlockClick }: EdgeEndpointProps) {
  const block = patch.blocks.get(blockId as BlockId);
  const blockName = block?.displayName || block?.type || blockId;

  return (
    <div style={{ marginBottom: '12px' }}>
      <h4 style={{ margin: '0 0 6px', fontSize: '13px', color: colors.textSecondary }}>
        {label}
      </h4>
      <div
        onClick={onBlockClick}
        style={{
          padding: '8px 12px',
          background: colors.bgPanel,
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '13px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <span style={{ color: colors.primary, textDecoration: 'underline' }}>
            {blockName}
          </span>
          <span style={{ color: colors.textSecondary }}>.{slotId}</span>
        </div>
        {resolvedType && (
          <span style={{
            fontSize: '11px',
            padding: '2px 6px',
            background: 'rgba(78, 205, 196, 0.15)',
            borderRadius: '3px',
            color: colors.primary,
          }}>
            {formatSignalType(resolvedType)}
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// TypeChainDisplay - Shows the full transform chain
// =============================================================================

interface TypeChainDisplayProps {
  chain: readonly TransformStep[];
  sourceType: CanonicalType | undefined;
  targetType: CanonicalType | undefined;
}

function TypeChainDisplay({ chain, sourceType, targetType }: TypeChainDisplayProps) {
  if (chain.length === 0) {
    // Direct connection — show arrow between types
    return (
      <div style={{ marginBottom: '12px' }}>
        <div style={{ textAlign: 'center', color: colors.textSecondary, fontSize: '12px', padding: '4px 0' }}>
          {sourceType && targetType ? (
            <span>
              {formatSignalType(sourceType)} <span style={{ color: colors.primary }}>→</span> {formatSignalType(targetType)}
            </span>
          ) : (
            '↓ direct'
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '12px' }}>
      <h4 style={{ margin: '0 0 6px', fontSize: '13px', color: colors.textSecondary }}>
        Transform Chain
      </h4>
      <div style={{
        padding: '8px',
        background: colors.bgPanel,
        borderRadius: '4px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}>
        {chain.map((step, idx) => (
          <div key={idx}>
            {idx > 0 && (
              <div style={{ textAlign: 'center', color: colors.textMuted, fontSize: '10px', padding: '2px 0' }}>↓</div>
            )}
            <ChainStep step={step} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ChainStep({ step }: { step: TransformStep }) {
  if (step.kind === 'lens') {
    return (
      <div style={{
        padding: '6px 8px',
        background: 'rgba(78, 205, 196, 0.1)',
        borderRadius: '3px',
        border: `1px solid rgba(78, 205, 196, 0.2)`,
        fontSize: '12px',
      }}>
        <span style={{ color: colors.primary, fontWeight: 600 }}>Lens</span>
        <span style={{ color: colors.textSecondary, marginLeft: '6px' }}>
          {getLensLabel(step.lens.lensId)}
        </span>
      </div>
    );
  }

  // Adapter step
  return (
    <div style={{
      padding: '6px 8px',
      background: 'rgba(255, 165, 0, 0.1)',
      borderRadius: '3px',
      border: '1px solid rgba(255, 165, 0, 0.2)',
      fontSize: '12px',
    }}>
      <span style={{ color: '#ffa500', fontWeight: 600 }}>Adapter</span>
      <span style={{ color: colors.textSecondary, marginLeft: '6px' }}>
        {step.adapter.replace('Adapter_', '').replace(/([A-Z])/g, ' $1').trim()}
      </span>
      <div style={{ fontSize: '10px', color: colors.textMuted, marginTop: '2px' }}>
        {formatSignalType(step.from)} → {formatSignalType(step.to)}
      </div>
    </div>
  );
}

// =============================================================================
// DebugProbeSection - Conditional on debug.enabled
// =============================================================================

interface DebugProbeSectionProps {
  edgeId: string;
  edge: Edge;
}

const DebugProbeSection = observer(function DebugProbeSection({ edgeId, edge }: DebugProbeSectionProps) {
  const { debug } = useStores();

  const edgeLabel = `${edge.from.blockId}.${edge.from.slotId} → ${edge.to.blockId}.${edge.to.slotId}`;
  const data = useDebugMiniView(edgeId, edgeLabel);

  if (!debug.enabled) {
    return (
      <div style={{ marginBottom: '12px' }}>
        <h4 style={{ margin: '0 0 6px', fontSize: '13px', color: colors.textSecondary }}>
          Debug <span style={{ fontSize: '10px', color: colors.textMuted }}>(disabled)</span>
        </h4>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '12px' }}>
      <h4 style={{ margin: '0 0 6px', fontSize: '13px', color: colors.textSecondary }}>
        Debug <span style={{ fontSize: '10px', color: colors.primary }}>(active)</span>
      </h4>
      {data ? (
        <DebugEdgeValueDisplay data={data} />
      ) : (
        <div style={{
          padding: '8px',
          background: colors.bgPanel,
          borderRadius: '4px',
          fontSize: '12px',
          color: colors.textMuted,
        }}>
          No debug data available for this edge
        </div>
      )}
    </div>
  );
});

// =============================================================================
// LensManagementSection - Add/remove lenses
// =============================================================================

interface LensManagementSectionProps {
  edge: Edge;
  patch: Patch;
}

const LensManagementSection = observer(function LensManagementSection({ edge, patch }: LensManagementSectionProps) {
  const { patch: patchStore } = useStores();
  const [showLensDropdown, setShowLensDropdown] = useState(false);

  const targetBlock = patch.blocks.get(edge.to.blockId as BlockId);
  const targetPort = targetBlock?.inputPorts.get(edge.to.slotId);
  const sourceAddress = `v1:blocks.${edge.from.blockId}.outputs.${edge.from.slotId}`;

  // Filter lenses for this specific source connection
  const existingLenses = useMemo(() => {
    if (!targetPort?.lenses) return [];
    return targetPort.lenses.filter(l => l.sourceAddress === sourceAddress);
  }, [targetPort?.lenses, sourceAddress]);

  // Find compatible lenses based on static block def types
  const compatibleLenses = useMemo((): LensTypeInfo[] => {
    const sourceBlock = patch.blocks.get(edge.from.blockId as BlockId);
    const targetBlockDef = targetBlock ? requireAnyBlockDef(targetBlock.type) : null;
    const sourceBlockDef = sourceBlock ? requireAnyBlockDef(sourceBlock.type) : null;

    const sourceOutput = sourceBlockDef?.outputs[edge.from.slotId];
    const targetInput = targetBlockDef?.inputs[edge.to.slotId];

    if (!sourceOutput?.type || !targetInput?.type) return [];
    return findCompatibleLenses(sourceOutput.type, targetInput.type);
  }, [edge, patch, targetBlock]);

  const handleAddLens = useCallback((lensType: string) => {
    patchStore.addLens(
      edge.to.blockId as BlockId,
      edge.to.slotId,
      lensType,
      sourceAddress,
    );
    setShowLensDropdown(false);
  }, [patchStore, edge, sourceAddress]);

  const handleRemoveLens = useCallback((lensId: string) => {
    patchStore.removeLens(edge.to.blockId as BlockId, edge.to.slotId, lensId);
  }, [patchStore, edge]);

  return (
    <div style={{ marginBottom: '12px' }}>
      <h4 style={{ margin: '0 0 6px', fontSize: '13px', color: colors.textSecondary }}>
        Lenses ({existingLenses.length})
      </h4>

      {/* Existing lenses */}
      {existingLenses.map(lens => (
        <div
          key={lens.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 8px',
            background: colors.bgPanel,
            borderRadius: '4px',
            marginBottom: '4px',
            fontSize: '12px',
          }}
        >
          <span style={{ color: colors.primary }}>
            {getLensLabel(lens.lensType)}
          </span>
          <button
            onClick={() => handleRemoveLens(lens.id)}
            style={{
              padding: '2px 6px',
              background: 'rgba(255, 107, 107, 0.2)',
              color: colors.error,
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            Remove
          </button>
        </div>
      ))}

      {/* Add lens controls */}
      {compatibleLenses.length > 0 && !showLensDropdown && (
        <button
          onClick={() => setShowLensDropdown(true)}
          style={{
            padding: '6px 10px',
            background: 'transparent',
            border: `1px solid ${colors.border}`,
            borderRadius: '4px',
            color: colors.textPrimary,
            cursor: 'pointer',
            fontSize: '12px',
            width: '100%',
          }}
        >
          + Add Lens
        </button>
      )}

      {showLensDropdown && (
        <div style={{
          padding: '4px',
          background: colors.bgPanel,
          borderRadius: '4px',
          border: `1px solid ${colors.border}`,
        }}>
          {compatibleLenses.map(lens => (
            <div
              key={lens.blockType}
              onClick={() => handleAddLens(lens.blockType)}
              style={{
                padding: '6px 8px',
                cursor: 'pointer',
                borderRadius: '3px',
                fontSize: '12px',
                color: colors.textPrimary,
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = colors.bgHover; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent'; }}
            >
              {lens.label}
              <div style={{ fontSize: '10px', color: colors.textMuted }}>
                {lens.description}
              </div>
            </div>
          ))}
          <div
            onClick={() => setShowLensDropdown(false)}
            style={{
              padding: '4px 8px',
              cursor: 'pointer',
              borderRadius: '3px',
              fontSize: '11px',
              color: colors.textMuted,
              textAlign: 'center',
              marginTop: '4px',
              borderTop: `1px solid ${colors.border}`,
            }}
          >
            Cancel
          </div>
        </div>
      )}

      {compatibleLenses.length === 0 && existingLenses.length === 0 && (
        <div style={{ fontSize: '12px', color: colors.textMuted }}>
          No compatible lenses available
        </div>
      )}
    </div>
  );
});

// =============================================================================
// DeleteEdgeButton
// =============================================================================

function DeleteEdgeButton({ edgeId }: { edgeId: string }) {
  const { patch: patchStore } = useStores();

  const handleDelete = useCallback(() => {
    patchStore.removeEdge(edgeId);
  }, [patchStore, edgeId]);

  return (
    <button
      onClick={handleDelete}
      style={{
        width: '100%',
        padding: '8px',
        background: 'rgba(255, 107, 107, 0.15)',
        color: colors.error,
        border: `1px solid rgba(255, 107, 107, 0.3)`,
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 600,
      }}
    >
      Delete Edge
    </button>
  );
}

// =============================================================================
// Main EdgeInspector Component
// =============================================================================

export interface EdgeInspectorProps {
  edge: Edge;
  patch: Patch;
}

export const EdgeInspector = observer(function EdgeInspector({ edge, patch }: EdgeInspectorProps) {
  const { selection, frontend } = useStores();

  // Get provenance for the target port (which contains chain and resolved types)
  const provenance: PortProvenance | undefined = frontend.getPortProvenanceByIds(
    edge.to.blockId,
    edge.to.slotId,
    'in',
  );

  const sourceType = provenance?.kind !== 'unresolved' ? provenance?.sourceType : undefined;
  const targetType = provenance?.kind !== 'unresolved' ? provenance?.targetType : undefined;
  const chain = provenance?.kind !== 'unresolved' ? (provenance?.chain ?? []) : [];

  const handleSourceClick = useCallback(() => {
    selection.selectBlock(edge.from.blockId as BlockId);
  }, [selection, edge.from.blockId]);

  const handleTargetClick = useCallback(() => {
    selection.selectBlock(edge.to.blockId as BlockId);
  }, [selection, edge.to.blockId]);

  return (
    <div>
      {/* Header badge */}
      <div style={{
        padding: '8px 12px',
        background: colors.primary + '22',
        borderRadius: '4px',
        marginBottom: '16px',
        fontSize: '12px',
        fontWeight: '600',
        color: colors.primary,
      }}>
        [EDGE]
      </div>

      {/* Source Endpoint */}
      <EdgeEndpoint
        label="Source"
        blockId={edge.from.blockId}
        slotId={edge.from.slotId}
        patch={patch}
        resolvedType={sourceType}
        onBlockClick={handleSourceClick}
      />

      {/* Transform Chain */}
      <TypeChainDisplay
        chain={chain}
        sourceType={sourceType}
        targetType={targetType}
      />

      {/* Target Endpoint */}
      <EdgeEndpoint
        label="Target"
        blockId={edge.to.blockId}
        slotId={edge.to.slotId}
        patch={patch}
        resolvedType={targetType}
        onBlockClick={handleTargetClick}
      />

      {/* Debug Probe */}
      <DebugProbeSection edgeId={edge.id} edge={edge} />

      {/* Lens Management */}
      <LensManagementSection edge={edge} patch={patch} />

      {/* Delete Edge */}
      <DeleteEdgeButton edgeId={edge.id} />
    </div>
  );
});
