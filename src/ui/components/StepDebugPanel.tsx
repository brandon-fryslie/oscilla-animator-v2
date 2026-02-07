/**
 * StepDebugPanel — Dockview panel for the step-through schedule debugger
 *
 * Provides a visual UI for stepping through frame execution:
 * - Activate/deactivate toggle + mode indicator
 * - Play/Pause, Step, Run to Breakpoint, Run to Phase End controls
 * - Step history list (left pane)
 * - Slot value inspector (right pane)
 * - Breakpoint manager (collapsible)
 * - ValueExpr tree view (collapsible)
 * - Temporal comparison deltas (F4)
 * - Lane identity display (F5)
 * - Why-not-evaluated analysis (F6)
 *
 * All data is consumed from StepDebugStore via MobX observer.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../stores/context';
import type { StepDebugStore } from '../../stores/StepDebugStore';
import type { Breakpoint, SlotValue, StateSlotValue, LaneIdentity, ExecutionPhase, ExprTreeNode, StepSnapshot, BlockGroup, FrameSummary } from '../../runtime/StepDebugTypes';
import type { StateSlotId } from '../../compiler/ir/types';
import type { WhyNotReason } from '../../runtime/WhyNotEvaluated';
import type { SlotDelta } from '../../runtime/ValueInspector';
import type { ValueSlot, BlockId, DebugIndexIR, PortBindingIR } from '../../compiler/ir/program';
import type { ValueAnomaly } from '../../runtime/StepDebugTypes';
import type { PatchStore } from '../../stores/PatchStore';
import './StepDebugPanel.css';

// =============================================================================
// Main Panel
// =============================================================================

export const StepDebugPanel: React.FC = observer(() => {
  const { stepDebug, patch } = useStores();
  const [viewMode, setViewMode] = useState<'steps' | 'blocks'>('steps');

  if (!stepDebug.active) {
    return (
      <div className="step-debug-panel">
        <Header store={stepDebug} />
        <div className="sdp-inactive">
          <div>Step Debugger is inactive.</div>
          <div className="sdp-inactive-hint">
            Activate to pause the animation loop and step through frame execution.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="step-debug-panel">
      <Header store={stepDebug} />
      <ControlBar store={stepDebug} viewMode={viewMode} onViewModeChange={setViewMode} />
      <div className="sdp-body">
        {viewMode === 'steps'
          ? <StepList store={stepDebug} />
          : <BlockCentricStepList store={stepDebug} />
        }
        <Inspector store={stepDebug} blockEntries={Array.from(patch.blocks.entries()).map(
          ([id, b]) => ({ id, label: b.displayName || b.type })
        )} />
      </div>
    </div>
  );
});

// =============================================================================
// Header
// =============================================================================

const Header: React.FC<{ store: StepDebugStore }> = observer(({ store }) => {
  const handleToggle = useCallback(() => {
    if (store.active) {
      store.deactivate();
    } else {
      store.activate();
    }
  }, [store]);

  return (
    <div className="sdp-header">
      <span className="sdp-title">Step Debugger</span>
      <span className={`sdp-mode-badge sdp-mode-${store.mode}`}>
        {store.mode}
      </span>
      <button
        className={`sdp-toggle-btn ${store.active ? 'sdp-toggle-btn-active' : ''}`}
        onClick={handleToggle}
      >
        {store.active ? 'Deactivate' : 'Activate'}
      </button>
    </div>
  );
});

// =============================================================================
// Control Bar
// =============================================================================

const ControlBar: React.FC<{
  store: StepDebugStore;
  viewMode: 'steps' | 'blocks';
  onViewModeChange: (mode: 'steps' | 'blocks') => void;
}> = observer(({ store, viewMode, onViewModeChange }) => {
  const isPaused = store.mode === 'paused';
  const isIdle = store.mode === 'idle';
  const isCompleted = store.mode === 'completed';
  const snapshot = store.currentSnapshot;

  return (
    <div className="sdp-controls">
      {isIdle && (
        <span style={{ color: '#888', fontStyle: 'italic', fontSize: '0.75rem' }}>
          Waiting for frame... (playback will start a debug frame)
        </span>
      )}
      {!isIdle && (
        <>
          <button
            className="sdp-ctrl-btn sdp-ctrl-btn-primary"
            disabled={!isPaused}
            onClick={() => store.stepNext()}
            title="Step to next schedule entry"
          >
            Step
          </button>
          <button
            className="sdp-ctrl-btn"
            disabled={!isPaused}
            onClick={() => store.runToBreakpoint()}
            title="Run until a breakpoint is hit"
          >
            Run to BP
          </button>
          <button
            className="sdp-ctrl-btn"
            disabled={!isPaused}
            onClick={() => store.runToPhaseEnd()}
            title="Run until the current phase ends"
          >
            Run to Phase End
          </button>
          <button
            className="sdp-ctrl-btn"
            disabled={isCompleted}
            onClick={() => store.finishFrame()}
            title="Finish the current frame"
          >
            Finish Frame
          </button>
          <div className="sdp-view-toggle" title="Toggle between step-order and block-grouped views">
            <button
              className={`sdp-view-toggle-btn ${viewMode === 'steps' ? 'sdp-view-toggle-active' : ''}`}
              onClick={() => onViewModeChange('steps')}
            >
              Steps
            </button>
            <button
              className={`sdp-view-toggle-btn ${viewMode === 'blocks' ? 'sdp-view-toggle-active' : ''}`}
              onClick={() => onViewModeChange('blocks')}
            >
              Blocks
            </button>
          </div>
        </>
      )}
      {snapshot && (
        <span className="sdp-frame-info">
          Step {snapshot.stepIndex + 1}/{snapshot.totalSteps} | Frame {snapshot.frameId}
        </span>
      )}
      {isCompleted && (
        <span className="sdp-frame-info">
          Frame complete ({store.history.length} steps)
        </span>
      )}
    </div>
  );
});

// =============================================================================
// Step List
// =============================================================================

const StepList: React.FC<{ store: StepDebugStore }> = observer(({ store }) => {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const currentSnapshot = store.currentSnapshot;

  // Auto-scroll to current step
  useEffect(() => {
    if (currentSnapshot && listRef.current) {
      const items = listRef.current.querySelectorAll('.sdp-step-item');
      const currentItem = items[store.history.length - 1];
      currentItem?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [currentSnapshot, store.history.length]);

  if (store.history.length === 0) {
    return (
      <div className="sdp-step-list">
        <div className="sdp-inspector-empty">No steps yet</div>
      </div>
    );
  }

  const debugIndex = store.debugIndex;

  return (
    <div className="sdp-step-list" ref={listRef}>
      {store.history.map((snap, idx) => {
        const isCurrent = currentSnapshot && snap.stepIndex === currentSnapshot.stepIndex && idx === store.history.length - 1;
        const hasAnomaly = snap.anomalies.length > 0;
        // Resolve the string block ID for breakpoint matching
        const blockStringId = snap.blockId !== null && debugIndex
          ? debugIndex.blockMap.get(snap.blockId) ?? null
          : null;
        const hasBp = blockStringId !== null && hasBlockBreakpoint(store.breakpoints, blockStringId as BlockId);
        return (
          <div
            key={idx}
            className={[
              'sdp-step-item',
              isCurrent ? 'sdp-step-item-current' : '',
              hasAnomaly ? 'sdp-step-item-anomaly' : '',
            ].join(' ')}
            onClick={() => setSelectedIdx(idx)}
          >
            {blockStringId !== null ? (
              <button
                className={`sdp-step-bp-toggle ${hasBp ? 'sdp-step-bp-active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleBlockBreakpoint(store, blockStringId as BlockId);
                }}
                title={hasBp ? 'Remove breakpoint for this block' : 'Add breakpoint for this block'}
              />
            ) : (
              <span className="sdp-step-bp-placeholder" />
            )}
            <span className="sdp-step-index">{snap.stepIndex >= 0 ? snap.stepIndex : '-'}</span>
            <PhaseBadge phase={snap.phase} />
            <StepStatusIcon snap={snap} />
            <span className="sdp-step-block" title={snap.blockName ?? undefined}>
              {snap.blockName ?? '(marker)'}
            </span>
            {snap.portId && (
              <span className="sdp-step-port" title={snap.portId as string}>
                .{snap.portId as string}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
});

const PhaseBadge: React.FC<{ phase: ExecutionPhase }> = ({ phase }) => (
  <span className={`sdp-step-phase sdp-phase-${phase}`}>
    {phase === 'phase1' ? 'P1'
      : phase === 'phase2' ? 'P2'
      : phase === 'phase-boundary' ? 'PB'
      : phase === 'pre-frame' ? 'PRE'
      : 'POST'}
  </span>
);

// =============================================================================
// Step Status Icon (E5: visual scanning)
// =============================================================================

const StepStatusIcon: React.FC<{ snap: StepSnapshot }> = ({ snap }) => {
  if (snap.anomalies.length > 0) {
    return <span className="sdp-icon sdp-icon-anomaly" title="Anomaly detected (NaN/Inf)">!</span>;
  }
  const kind = snap.step?.kind;
  if (kind === 'materialize') {
    return <span className="sdp-icon sdp-icon-materialize" title="Field materialization">F</span>;
  }
  if (kind === 'stateWrite' || kind === 'fieldStateWrite') {
    return <span className="sdp-icon sdp-icon-state" title="State write">S</span>;
  }
  if (kind === 'continuityMapBuild' || kind === 'continuityApply') {
    return <span className="sdp-icon sdp-icon-continuity" title="Continuity operation">C</span>;
  }
  if (kind === 'render') {
    return <span className="sdp-icon sdp-icon-render" title="Render">R</span>;
  }
  if (snap.writtenSlots.size > 0) {
    return <span className="sdp-icon sdp-icon-ok" title="Value written">{'\u00B7'}</span>;
  }
  return <span className="sdp-icon sdp-icon-none" title="No output">{'\u00B7'}</span>;
};

// =============================================================================
// Block-Centric Step List (E5: block-grouped view)
// =============================================================================

const BlockCentricStepList: React.FC<{ store: StepDebugStore }> = observer(({ store }) => {
  const groups = store.blockGroupedHistory;
  const listRef = useRef<HTMLDivElement>(null);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set());

  const toggleBlock = useCallback((key: string) => {
    setCollapsedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  if (groups.length === 0) {
    return (
      <div className="sdp-step-list">
        <div className="sdp-inspector-empty">No steps yet</div>
      </div>
    );
  }

  const currentSnapshot = store.currentSnapshot;

  return (
    <div className="sdp-step-list" ref={listRef}>
      {groups.map(group => {
        const key = group.blockName;
        const isCollapsed = collapsedBlocks.has(key);
        return (
          <div key={key} className="sdp-block-group">
            <div
              className="sdp-block-group-header"
              onClick={() => toggleBlock(key)}
            >
              <span className="sdp-section-toggle">{isCollapsed ? '\u25B6' : '\u25BC'}</span>
              <span className="sdp-block-group-name">{group.blockName}</span>
              <span className="sdp-block-group-count">{group.steps.length}</span>
              {group.anomalyCount > 0 && (
                <span className="sdp-block-group-anomaly">{group.anomalyCount} !</span>
              )}
            </div>
            {!isCollapsed && group.steps.map((snap, idx) => {
              const isCurrent = currentSnapshot && snap.stepIndex === currentSnapshot.stepIndex
                && snap.phase === currentSnapshot.phase;
              const hasAnomaly = snap.anomalies.length > 0;
              return (
                <div
                  key={idx}
                  className={[
                    'sdp-step-item',
                    isCurrent ? 'sdp-step-item-current' : '',
                    hasAnomaly ? 'sdp-step-item-anomaly' : '',
                  ].join(' ')}
                >
                  <span className="sdp-step-index">{snap.stepIndex >= 0 ? snap.stepIndex : '-'}</span>
                  <PhaseBadge phase={snap.phase} />
                  <StepStatusIcon snap={snap} />
                  {snap.portId && (
                    <span className="sdp-step-port" title={snap.portId as string}>
                      .{snap.portId as string}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
});

// =============================================================================
// Frame Summary (E5: "What happened?" view)
// =============================================================================

const FrameSummaryView: React.FC<{ summary: FrameSummary }> = ({ summary }) => (
  <div className="sdp-frame-summary">
    <div className="sdp-summary-header">
      Frame Summary
      <span className="sdp-summary-stats">
        {summary.totalSteps} steps | P1: {summary.phase1Steps} P2: {summary.phase2Steps}
        {summary.totalAnomalies > 0 && (
          <span className="sdp-summary-anomaly-badge">{summary.totalAnomalies} anomalies</span>
        )}
      </span>
    </div>
    <table className="sdp-summary-table">
      <thead>
        <tr>
          <th></th>
          <th>Block</th>
          <th>Steps</th>
          <th>Values</th>
        </tr>
      </thead>
      <tbody>
        {summary.blocks.map(block => (
          <tr key={block.blockName} className={block.anomalyCount > 0 ? 'sdp-anomaly-row' : ''}>
            <td>
              <span className={`sdp-summary-dot ${block.anomalyCount > 0 ? 'sdp-summary-dot-error' : 'sdp-summary-dot-ok'}`} />
            </td>
            <td className="sdp-summary-block-name">{block.blockName}</td>
            <td className="sdp-summary-step-count">{block.stepCount}</td>
            <td className="sdp-summary-values">
              {block.scalarRange && (
                <span className="sdp-summary-range">
                  [{formatNumber(block.scalarRange.min)} .. {formatNumber(block.scalarRange.max)}]
                </span>
              )}
              {block.fieldLaneCount != null && (
                <span className="sdp-summary-lanes">{block.fieldLaneCount} lanes</span>
              )}
              {block.anomalyCount > 0 && (
                <span className="sdp-summary-anomaly-count">{block.anomalyCount} !</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// =============================================================================
// Inspector (right pane)
// =============================================================================

const Inspector: React.FC<{ store: StepDebugStore; blockEntries: { id: string; label: string }[] }> = observer(({ store, blockEntries }) => {
  const snapshot = store.currentSnapshot;
  const { patch } = useStores();
  const [expandedBuffers, setExpandedBuffers] = useState<Set<string>>(new Set());
  const [bpType, setBpType] = useState<string>('block-id');
  const [bpValue, setBpValue] = useState<string>('');
  const [whyNotBlockId, setWhyNotBlockId] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedBpSlot, setSelectedBpSlot] = useState<ValueSlot | null>(null);
  const [bpThreshold, setBpThreshold] = useState<string>('0.1');

  // Sections collapsed state
  const [showBreakpoints, setShowBreakpoints] = useState(true);
  const [showExprTree, setShowExprTree] = useState(false);
  const [showWhyNot, setShowWhyNot] = useState(false);

  const deltas = store.currentDeltas;
  const debugIndex = store.debugIndex;

  const toggleBuffer = useCallback((slotKey: string) => {
    setExpandedBuffers(prev => {
      const next = new Set(prev);
      if (next.has(slotKey)) next.delete(slotKey);
      else next.add(slotKey);
      return next;
    });
  }, []);

  // Build selectable slots for value-delta picker
  const selectableSlots = buildSelectableSlots(debugIndex, patch.blocks);

  const handleAddBreakpoint = useCallback(() => {
    switch (bpType) {
      case 'step-index': {
        const idx = parseInt(bpValue, 10);
        if (!isNaN(idx)) store.addBreakpoint({ kind: 'step-index', index: idx });
        break;
      }
      case 'block-id':
        if (bpValue) store.addBreakpoint({ kind: 'block-id', blockId: bpValue as BlockId });
        break;
      case 'phase-boundary':
        store.addBreakpoint({ kind: 'phase-boundary' });
        break;
      case 'anomaly':
        store.toggleAnomalyBreakpoint();
        break;
      case 'value-delta': {
        const threshold = parseFloat(bpThreshold);
        if (!isNaN(threshold) && selectedBpSlot != null) {
          store.addValueDeltaBreakpoint(selectedBpSlot, threshold);
        }
        break;
      }
    }
    setBpValue('');
  }, [bpType, bpValue, bpThreshold, selectedBpSlot, store]);

  const hasPerStepWrites = snapshot && (snapshot.writtenSlots.size > 0 || snapshot.writtenStateSlots.size > 0);

  return (
    <div className="sdp-inspector">
      {/* Anomaly context panel — shown when current step has anomalies */}
      {snapshot && snapshot.anomalies.length > 0 && (
        <AnomalyContextPanel
          anomalies={snapshot.anomalies}
          debugIndex={debugIndex}
          blocks={patch.blocks}
        />
      )}

      {/* Per-step writes (value slots + state slots) */}
      {hasPerStepWrites ? (
        <>
          {snapshot.writtenSlots.size > 0 && (
            <SlotTable
              writtenSlots={snapshot.writtenSlots}
              deltas={deltas}
              store={store}
              expandedBuffers={expandedBuffers}
              onToggleBuffer={toggleBuffer}
            />
          )}
          {snapshot.writtenStateSlots.size > 0 && (
            <StateSlotTable writtenStateSlots={snapshot.writtenStateSlots} />
          )}
        </>
      ) : snapshot ? (
        <CumulativeStateView store={store} />
      ) : store.mode === 'completed' && store.frameSummary ? (
        <FrameSummaryView summary={store.frameSummary} />
      ) : store.mode === 'completed' ? (
        <div className="sdp-inspector-empty">Frame complete. Select a step from the history.</div>
      ) : (
        <div className="sdp-inspector-empty">Select a step to inspect</div>
      )}

      {/* Breakpoints section */}
      <CollapsibleSection
        title={`Breakpoints (${store.breakpoints.length})`}
        open={showBreakpoints}
        onToggle={() => setShowBreakpoints(v => !v)}
      >
        <BreakpointList
          breakpoints={store.breakpoints}
          onRemove={idx => store.removeBreakpoint(idx)}
          blockEntries={blockEntries}
          debugIndex={debugIndex}
          blocks={patch.blocks}
        />
        <div className="sdp-bp-add-row">
          <select className="sdp-bp-select" value={bpType} onChange={e => setBpType(e.target.value)}>
            <option value="block-id">Block</option>
            <option value="phase-boundary" title="Pause at phase transitions (P1/P2 boundary)">Phase Change</option>
            <option value="anomaly">Anomaly (NaN/Inf)</option>
            <option value="value-delta">Value Delta</option>
            {showAdvanced && <option value="step-index">Step Index</option>}
          </select>
          {bpType === 'step-index' && (
            <input
              className="sdp-bp-input"
              type="number"
              placeholder="Index"
              value={bpValue}
              onChange={e => setBpValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddBreakpoint()}
            />
          )}
          {bpType === 'block-id' && (
            <BlockSelector blockEntries={blockEntries} value={bpValue} onChange={setBpValue} />
          )}
          {bpType === 'value-delta' && (
            <SlotPicker
              slots={selectableSlots}
              selectedSlot={selectedBpSlot}
              onSelectSlot={setSelectedBpSlot}
              threshold={bpThreshold}
              onThresholdChange={setBpThreshold}
            />
          )}
          <button className="sdp-bp-add-btn" onClick={handleAddBreakpoint}>Add</button>
        </div>
        {!showAdvanced && (
          <button
            className="sdp-bp-advanced-toggle"
            onClick={() => setShowAdvanced(true)}
          >
            Advanced...
          </button>
        )}
      </CollapsibleSection>

      {/* Expression tree section */}
      <CollapsibleSection
        title="Expression Tree"
        open={showExprTree}
        onToggle={() => setShowExprTree(v => !v)}
      >
        <ExprTreeSection store={store} />
      </CollapsibleSection>

      {/* Why Not Evaluated section */}
      <CollapsibleSection
        title="Why Not Evaluated"
        open={showWhyNot}
        onToggle={() => setShowWhyNot(v => !v)}
      >
        <div className="sdp-bp-add-row">
          <select
            className="sdp-bp-select"
            value={whyNotBlockId}
            onChange={e => setWhyNotBlockId(e.target.value)}
          >
            <option value="">Select block...</option>
            {blockEntries.map(({ id, label }) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>
        {whyNotBlockId && <WhyNotDisplay store={store} blockId={whyNotBlockId as BlockId} />}
      </CollapsibleSection>
    </div>
  );
});

// =============================================================================
// Slot Table
// =============================================================================

const SlotTable: React.FC<{
  writtenSlots: ReadonlyMap<ValueSlot, SlotValue>;
  deltas: ReadonlyMap<ValueSlot, SlotDelta> | null;
  store: StepDebugStore;
  expandedBuffers: Set<string>;
  onToggleBuffer: (key: string) => void;
}> = observer(({ writtenSlots, deltas, store, expandedBuffers, onToggleBuffer }) => {
  const entries = Array.from(writtenSlots.entries());

  return (
    <table className="sdp-slot-table">
      <thead>
        <tr>
          <th>Slot</th>
          <th>Value</th>
          <th>Type</th>
          {deltas && <th>Delta</th>}
        </tr>
      </thead>
      <tbody>
        {entries.map(([slot, value]) => {
          const slotKey = String(slot);
          const isAnomaly = value.kind === 'scalar' && (isNaN(value.value) || !isFinite(value.value));
          const delta = deltas?.get(slot);
          const laneIdentities = value.kind === 'buffer' && expandedBuffers.has(slotKey)
            ? store.getLaneIdentities(slot)
            : null;

          return (
            <React.Fragment key={slotKey}>
              <tr className={isAnomaly ? 'sdp-anomaly-row' : ''}>
                <td className="sdp-slot-id">{slotKey}</td>
                <td>
                  <SlotValueDisplay
                    value={value}
                    slotKey={slotKey}
                    expanded={expandedBuffers.has(slotKey)}
                    onToggle={onToggleBuffer}
                  />
                </td>
                <td className="sdp-slot-type">{formatSlotType(value)}</td>
                {deltas && (
                  <td>
                    {delta && <DeltaDisplay delta={delta} />}
                  </td>
                )}
              </tr>
              {/* Expanded buffer lanes */}
              {value.kind === 'buffer' && expandedBuffers.has(slotKey) && (
                <tr>
                  <td colSpan={deltas ? 4 : 3} style={{ padding: 0 }}>
                    <BufferExpansion value={value} laneIdentities={laneIdentities} />
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
});

// =============================================================================
// State Slot Table (Phase 2 state writes)
// =============================================================================

const StateSlotTable: React.FC<{
  writtenStateSlots: ReadonlyMap<StateSlotId, StateSlotValue>;
}> = ({ writtenStateSlots }) => {
  const entries = Array.from(writtenStateSlots.entries());
  return (
    <table className="sdp-slot-table">
      <thead>
        <tr>
          <th>State ID</th>
          <th>Value</th>
          <th>Kind</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([slot, value]) => (
          <tr key={String(slot)}>
            <td className="sdp-slot-id" title={`StateSlot ${slot}`}>
              {value.stateId as string}
            </td>
            <td>
              {value.kind === 'scalar'
                ? <span className="sdp-slot-value">{formatNumber(value.value)}</span>
                : <span className="sdp-buffer-badge">field[{value.laneCount}]</span>
              }
            </td>
            <td className="sdp-slot-type">{value.kind}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// =============================================================================
// Cumulative State View (shown when current step has no per-step writes)
// =============================================================================

const CumulativeStateView: React.FC<{ store: StepDebugStore }> = observer(({ store }) => {
  const cumValues = store.cumulativeValueSlots;
  const cumState = store.cumulativeStateSlots;

  if (cumValues.size === 0 && cumState.size === 0) {
    return <div className="sdp-inspector-empty">No slots written yet</div>;
  }

  return (
    <div>
      <div style={{ fontSize: '0.7rem', color: '#888', padding: '4px 8px', borderBottom: '1px solid #333' }}>
        Cumulative state (all writes up to this point)
      </div>
      {cumValues.size > 0 && (
        <SlotTable
          writtenSlots={cumValues}
          deltas={null}
          store={store}
          expandedBuffers={new Set()}
          onToggleBuffer={() => {}}
        />
      )}
      {cumState.size > 0 && (
        <StateSlotTable writtenStateSlots={cumState} />
      )}
    </div>
  );
});

// =============================================================================
// Slot Value Display
// =============================================================================

const SlotValueDisplay: React.FC<{
  value: SlotValue;
  slotKey: string;
  expanded: boolean;
  onToggle: (key: string) => void;
}> = ({ value, slotKey, expanded, onToggle }) => {
  switch (value.kind) {
    case 'scalar': {
      const isAnom = isNaN(value.value) || !isFinite(value.value);
      return (
        <span className={isAnom ? 'sdp-slot-value-nan' : 'sdp-slot-value'}>
          {formatNumber(value.value)}
        </span>
      );
    }
    case 'buffer':
      return (
        <span
          className="sdp-buffer-badge"
          onClick={() => onToggle(slotKey)}
          title={expanded ? 'Collapse' : 'Expand buffer values'}
        >
          buffer[{value.count}] {expanded ? '\u25B2' : '\u25BC'}
        </span>
      );
    case 'event':
      return (
        <span className={value.fired ? 'sdp-slot-value' : 'sdp-slot-value-nan'}>
          {value.fired ? 'FIRED' : 'idle'}
        </span>
      );
    case 'object':
      return <span className="sdp-slot-type">(object)</span>;
  }
};

// =============================================================================
// Delta Display
// =============================================================================

const DeltaDisplay: React.FC<{ delta: SlotDelta }> = ({ delta }) => {
  if (isNaN(delta.current) && !isNaN(delta.previous)) {
    return <span className="sdp-slot-delta sdp-delta-nan">new NaN</span>;
  }
  if (delta.delta === 0) return null;
  const sign = delta.delta > 0 ? '+' : '';
  const cls = delta.delta > 0 ? 'sdp-delta-positive' : 'sdp-delta-negative';
  return (
    <span className={`sdp-slot-delta ${cls}`}>
      {sign}{formatNumber(delta.delta)}
    </span>
  );
};

// =============================================================================
// Buffer Expansion with Lane Identity
// =============================================================================

const BufferExpansion: React.FC<{
  value: SlotValue & { kind: 'buffer' };
  laneIdentities: readonly LaneIdentity[] | null;
}> = ({ value, laneIdentities }) => {
  const maxDisplay = 64;
  const count = Math.min(value.count, maxDisplay);
  const buf = value.buffer;
  const hasLanes = laneIdentities && laneIdentities.length > 0;

  return (
    <table className="sdp-lane-table">
      <thead>
        <tr>
          <th>Lane</th>
          <th>Value</th>
          {hasLanes && <th>Instance</th>}
          {hasLanes && <th>Element</th>}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: count }, (_, i) => {
          const v = buf instanceof Float64Array || buf instanceof Float32Array
            || buf instanceof Uint8Array || buf instanceof Uint8ClampedArray
            || buf instanceof Int32Array || buf instanceof Uint32Array
            ? buf[i] : 0;
          const lane = laneIdentities?.[i] ?? null;
          return (
            <tr key={i}>
              <td>{i}</td>
              <td>{formatNumber(v)}</td>
              {hasLanes && <td>{lane?.instanceLabel ?? '-'}</td>}
              {hasLanes && <td>{lane?.elementId ?? '-'}</td>}
            </tr>
          );
        })}
        {value.count > maxDisplay && (
          <tr>
            <td colSpan={hasLanes ? 4 : 2} style={{ color: '#666', fontStyle: 'italic' }}>
              ...and {value.count - maxDisplay} more
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
};

// =============================================================================
// Collapsible Section
// =============================================================================

const CollapsibleSection: React.FC<{
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, open, onToggle, children }) => (
  <div className="sdp-section">
    <div className="sdp-section-header" onClick={onToggle}>
      <span className="sdp-section-toggle">{open ? '\u25BC' : '\u25B6'}</span>
      {title}
    </div>
    {open && <div className="sdp-section-content">{children}</div>}
  </div>
);

// =============================================================================
// Breakpoint List
// =============================================================================

const BreakpointList: React.FC<{
  breakpoints: readonly Breakpoint[];
  onRemove: (idx: number) => void;
  blockEntries: { id: string; label: string }[];
  debugIndex: DebugIndexIR | null;
  blocks: ReadonlyMap<string, { displayName: string; type: string }>;
}> = ({ breakpoints, onRemove, blockEntries, debugIndex, blocks }) => {
  if (breakpoints.length === 0) {
    return <div style={{ color: '#666', fontStyle: 'italic', fontSize: '0.75rem' }}>No breakpoints configured.</div>;
  }

  return (
    <ul className="sdp-bp-list">
      {breakpoints.map((bp, idx) => (
        <li key={idx} className="sdp-bp-item">
          <span className="sdp-bp-kind">{formatBreakpointKind(bp.kind)}</span>
          <span className="sdp-bp-label">{formatBreakpoint(bp, blockEntries, debugIndex, blocks)}</span>
          <button className="sdp-bp-remove" onClick={() => onRemove(idx)} title="Remove breakpoint">
            &times;
          </button>
        </li>
      ))}
    </ul>
  );
};

// =============================================================================
// Expression Tree Section
// =============================================================================

const ExprTreeSection: React.FC<{ store: StepDebugStore }> = observer(({ store }) => {
  const rootId = store.getRootExprId();
  if (rootId == null) {
    return <div className="sdp-expr-empty">No expression tree for this step type.</div>;
  }

  const tree = store.buildExprTree(rootId);
  if (!tree) {
    return <div className="sdp-expr-empty">Unable to build expression tree.</div>;
  }

  return (
    <div className="sdp-expr-tree">
      <ExprTreeNodeView node={tree} depth={0} defaultExpanded />
    </div>
  );
});

const ExprTreeNodeView: React.FC<{
  node: ExprTreeNode;
  depth: number;
  defaultExpanded?: boolean;
}> = ({ node, depth, defaultExpanded = false }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = node.children.length > 0;

  return (
    <div className="sdp-expr-node" style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
      <div
        className="sdp-expr-node-header"
        onClick={() => hasChildren && setExpanded(v => !v)}
      >
        <span className="sdp-expr-toggle">
          {hasChildren ? (expanded ? '\u25BC' : '\u25B6') : '\u00B7'}
        </span>
        <span className="sdp-expr-kind">{node.label}</span>
        {node.blockName && (
          <span className="sdp-expr-block">
            {node.blockName}
            {node.portName && <span className="sdp-expr-port"> . {node.portName}</span>}
          </span>
        )}
        {node.role && node.role !== 'user' && (
          <span className={`sdp-expr-role-badge sdp-expr-role-${node.role}`}>
            {node.role === 'wireState' ? 'state' : node.role}
          </span>
        )}
        {node.value != null && (
          <span className={node.isAnomaly ? 'sdp-expr-value-anomaly' : 'sdp-expr-value'}>
            {formatNumber(node.value)}
          </span>
        )}
      </div>
      {expanded && hasChildren && node.children.map(child => (
        <ExprTreeNodeView key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
};

// =============================================================================
// Why Not Evaluated
// =============================================================================

const WhyNotDisplay: React.FC<{ store: StepDebugStore; blockId: BlockId }> = observer(({ store, blockId }) => {
  const result = store.analyzeWhyNotEvaluated(blockId);

  if (!result) {
    return <div style={{ color: '#666', fontStyle: 'italic', fontSize: '0.75rem' }}>No analysis available (no compiled program).</div>;
  }

  if (result.reasons.length === 0) {
    return <div style={{ color: '#4ecdc4', fontSize: '0.75rem' }}>Block is evaluated normally.</div>;
  }

  return (
    <div className="sdp-whynot">
      {result.reasons.map((reason, idx) => (
        <WhyNotReasonCard key={idx} reason={reason} />
      ))}
    </div>
  );
});

const WhyNotReasonCard: React.FC<{ reason: WhyNotReason }> = ({ reason }) => {
  const isError = reason.kind === 'compile-error';
  return (
    <div className={`sdp-whynot-reason ${isError ? 'sdp-whynot-reason-error' : ''}`}>
      <div className="sdp-whynot-kind">{reason.kind}</div>
      <div className="sdp-whynot-detail">
        {reason.kind === 'compile-error'
          ? reason.errors.map((e, i) => <div key={i}>{e}</div>)
          : reason.detail
        }
      </div>
    </div>
  );
};

// =============================================================================
// Helpers
// =============================================================================

function formatNumber(n: number): string {
  if (Number.isNaN(n)) return 'NaN';
  if (n === Infinity) return '+Inf';
  if (n === -Infinity) return '-Inf';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(4);
}

function formatSlotType(value: SlotValue): string {
  switch (value.kind) {
    case 'scalar':
      return value.type.payload.kind;
    case 'buffer':
      return `${value.type.payload.kind}[${value.count}]`;
    case 'event':
      return 'event';
    case 'object':
      return 'object';
  }
}

function formatBreakpointKind(kind: string): string {
  switch (kind) {
    case 'step-index': return 'step';
    case 'block-id': return 'block';
    case 'phase-boundary': return 'phase';
    case 'anomaly': return 'anomaly';
    case 'slot-condition': return 'cond';
    case 'value-delta': return 'delta';
    default: return kind;
  }
}

function formatBreakpoint(
  bp: Breakpoint,
  blockEntries?: { id: string; label: string }[],
  debugIndex?: DebugIndexIR | null,
  blocks?: ReadonlyMap<string, { displayName: string; type: string }>,
): string {
  switch (bp.kind) {
    case 'step-index':
      return `step #${bp.index}`;
    case 'block-id': {
      // Resolve display name from blockEntries (already has displayName)
      const entry = blockEntries?.find(e => e.id === (bp.blockId as string));
      return entry ? entry.label : (bp.blockId as string);
    }
    case 'phase-boundary':
      return 'phase change (P1/P2 boundary)';
    case 'anomaly':
      return 'any anomaly (NaN/Inf)';
    case 'slot-condition':
      return `${bp.label} (slot condition)`;
    case 'value-delta': {
      const slotName = resolveSlotName(bp.slot, debugIndex ?? null, blocks ?? null);
      return `delta > ${bp.threshold} on ${slotName}`;
    }
  }
}

// =============================================================================
// Block Selector (grouped by type)
// =============================================================================

const BlockSelector: React.FC<{
  blockEntries: { id: string; label: string }[];
  value: string;
  onChange: (val: string) => void;
}> = ({ blockEntries, value, onChange }) => (
  <select className="sdp-bp-select" value={value} onChange={e => onChange(e.target.value)}>
    <option value="">Select block...</option>
    {blockEntries.map(({ id, label }) => (
      <option key={id} value={id}>{label}</option>
    ))}
  </select>
);

// =============================================================================
// Slot Picker (for value-delta breakpoints)
// =============================================================================

interface SelectableSlot {
  slot: ValueSlot;
  label: string;
  block: string;
  port: string;
}

const SlotPicker: React.FC<{
  slots: SelectableSlot[];
  selectedSlot: ValueSlot | null;
  onSelectSlot: (slot: ValueSlot | null) => void;
  threshold: string;
  onThresholdChange: (val: string) => void;
}> = ({ slots, selectedSlot, onSelectSlot, threshold, onThresholdChange }) => (
  <div className="sdp-slot-picker">
    <select
      className="sdp-bp-select"
      value={selectedSlot !== null ? String(selectedSlot) : ''}
      onChange={e => {
        const val = e.target.value;
        onSelectSlot(val ? (Number(val) as ValueSlot) : null);
      }}
    >
      <option value="">Select slot...</option>
      {slots.map(s => (
        <option key={String(s.slot)} value={String(s.slot)}>{s.label}</option>
      ))}
    </select>
    <input
      className="sdp-bp-input"
      type="number"
      placeholder="Threshold"
      step="0.01"
      value={threshold}
      onChange={e => onThresholdChange(e.target.value)}
    />
  </div>
);

// =============================================================================
// Anomaly Context Panel
// =============================================================================

const AnomalyContextPanel: React.FC<{
  anomalies: readonly ValueAnomaly[];
  debugIndex: DebugIndexIR | null;
  blocks: ReadonlyMap<string, { displayName: string; type: string }>;
}> = ({ anomalies, debugIndex, blocks }) => (
  <div className="sdp-anomaly-context">
    <div className="sdp-anomaly-context-header">Anomalies Detected</div>
    {anomalies.map((a, idx) => (
      <div key={idx} className="sdp-anomaly-context-item">
        <span className="sdp-anomaly-kind">{formatAnomalyKind(a.kind)}</span>
        <span className="sdp-anomaly-source">{resolveAnomalySource(a, debugIndex, blocks)}</span>
      </div>
    ))}
  </div>
);

function formatAnomalyKind(kind: ValueAnomaly['kind']): string {
  switch (kind) {
    case 'nan': return 'NaN';
    case 'infinity': return '+Inf';
    case 'neg-infinity': return '-Inf';
  }
}

function resolveAnomalySource(
  anomaly: ValueAnomaly,
  debugIndex: DebugIndexIR | null,
  blocks: ReadonlyMap<string, { displayName: string; type: string }>,
): string {
  if (!debugIndex) return `slot ${anomaly.slot}`;

  // Resolve block name
  let blockLabel = '';
  if (anomaly.blockId !== null) {
    const stringId = debugIndex.blockMap.get(anomaly.blockId);
    if (stringId) {
      const displayName = debugIndex.blockDisplayNames?.get(anomaly.blockId);
      blockLabel = displayName ?? blocks.get(stringId)?.displayName ?? stringId;
    }
  }

  // Resolve port name
  let portLabel = '';
  if (anomaly.portId !== null) {
    const portBinding = debugIndex.ports.find(p => p.port === anomaly.portId);
    if (portBinding) {
      portLabel = portBinding.portName;
    }
  }

  if (blockLabel && portLabel) return `${blockLabel}.${portLabel}`;
  if (blockLabel) return blockLabel;
  return `slot ${anomaly.slot}`;
}

// =============================================================================
// Breakpoint helpers
// =============================================================================

function hasBlockBreakpoint(breakpoints: readonly Breakpoint[], blockId: BlockId): boolean {
  return breakpoints.some(bp => bp.kind === 'block-id' && bp.blockId === blockId);
}

function toggleBlockBreakpoint(store: StepDebugStore, blockId: BlockId): void {
  const idx = store.breakpoints.findIndex(
    bp => bp.kind === 'block-id' && bp.blockId === blockId,
  );
  if (idx >= 0) {
    store.removeBreakpoint(idx);
  } else {
    store.addBreakpoint({ kind: 'block-id', blockId });
  }
}

function resolveSlotName(
  slot: ValueSlot,
  debugIndex: DebugIndexIR | null,
  blocks: ReadonlyMap<string, { displayName: string; type: string }> | null,
): string {
  if (!debugIndex) return `slot ${slot}`;

  const portId = debugIndex.slotToPort.get(slot);
  if (portId === undefined) return `slot ${slot}`;

  const portBinding = debugIndex.ports.find(p => p.port === portId);
  if (!portBinding) return `slot ${slot}`;

  const displayName = debugIndex.blockDisplayNames?.get(portBinding.block);
  const blockStringId = debugIndex.blockMap.get(portBinding.block);
  const blockLabel = displayName
    ?? (blockStringId ? blocks?.get(blockStringId)?.displayName : null)
    ?? blockStringId
    ?? `block ${portBinding.block}`;

  return `${blockLabel}.${portBinding.portName}`;
}

function buildSelectableSlots(
  debugIndex: DebugIndexIR | null,
  blocks: ReadonlyMap<string, { displayName: string; type: string }>,
): SelectableSlot[] {
  if (!debugIndex) return [];

  // Reverse slotToPort → portToSlot
  const portToSlot = new Map<unknown, ValueSlot>();
  for (const [slot, portId] of debugIndex.slotToPort) {
    portToSlot.set(portId, slot);
  }

  const result: SelectableSlot[] = [];
  for (const portBinding of debugIndex.ports) {
    const slot = portToSlot.get(portBinding.port);
    if (slot === undefined) continue;
    // Only include output ports (those produce values worth watching)
    if (portBinding.direction !== 'out') continue;

    const displayName = debugIndex.blockDisplayNames?.get(portBinding.block);
    const blockStringId = debugIndex.blockMap.get(portBinding.block);
    const blockLabel = displayName
      ?? (blockStringId ? blocks.get(blockStringId)?.displayName : null)
      ?? blockStringId
      ?? `block ${portBinding.block}`;

    result.push({
      slot,
      label: `${blockLabel}.${portBinding.portName}`,
      block: blockLabel,
      port: portBinding.portName,
    });
  }

  result.sort((a, b) => a.block.localeCompare(b.block) || a.port.localeCompare(b.port));
  return result;
}
