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
import type { Breakpoint, SlotValue, LaneIdentity, ExecutionPhase } from '../../runtime/StepDebugTypes';
import type { WhyNotReason } from '../../runtime/WhyNotEvaluated';
import type { SlotDelta } from '../../runtime/ValueInspector';
import type { ValueSlot, BlockId } from '../../compiler/ir/program';
import './StepDebugPanel.css';

// =============================================================================
// Main Panel
// =============================================================================

export const StepDebugPanel: React.FC = observer(() => {
  const { stepDebug, patch } = useStores();

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
      <ControlBar store={stepDebug} />
      <div className="sdp-body">
        <StepList store={stepDebug} />
        <Inspector store={stepDebug} blockIds={Array.from(patch.blocks.keys())} />
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

const ControlBar: React.FC<{ store: StepDebugStore }> = observer(({ store }) => {
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

  return (
    <div className="sdp-step-list" ref={listRef}>
      {store.history.map((snap, idx) => {
        const isCurrent = currentSnapshot && snap.stepIndex === currentSnapshot.stepIndex && idx === store.history.length - 1;
        const hasAnomaly = snap.anomalies.length > 0;
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
            <span className="sdp-step-index">{snap.stepIndex >= 0 ? snap.stepIndex : '-'}</span>
            <PhaseBadge phase={snap.phase} />
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
// Inspector (right pane)
// =============================================================================

const Inspector: React.FC<{ store: StepDebugStore; blockIds: string[] }> = observer(({ store, blockIds }) => {
  const snapshot = store.currentSnapshot;
  const [expandedBuffers, setExpandedBuffers] = useState<Set<string>>(new Set());
  const [bpType, setBpType] = useState<string>('step-index');
  const [bpValue, setBpValue] = useState<string>('');
  const [whyNotBlockId, setWhyNotBlockId] = useState<string>('');

  // Sections collapsed state
  const [showBreakpoints, setShowBreakpoints] = useState(true);
  const [showExprTree, setShowExprTree] = useState(false);
  const [showWhyNot, setShowWhyNot] = useState(false);

  const deltas = store.currentDeltas;

  const toggleBuffer = useCallback((slotKey: string) => {
    setExpandedBuffers(prev => {
      const next = new Set(prev);
      if (next.has(slotKey)) next.delete(slotKey);
      else next.add(slotKey);
      return next;
    });
  }, []);

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
        // For value-delta, we need a slot + threshold. Use bpValue as threshold for a simple default.
        const threshold = parseFloat(bpValue);
        if (!isNaN(threshold) && store.selectedSlot != null) {
          store.addValueDeltaBreakpoint(store.selectedSlot, threshold);
        }
        break;
      }
    }
    setBpValue('');
  }, [bpType, bpValue, store]);

  return (
    <div className="sdp-inspector">
      {/* Slot table */}
      {snapshot && snapshot.writtenSlots.size > 0 ? (
        <SlotTable
          writtenSlots={snapshot.writtenSlots}
          deltas={deltas}
          store={store}
          expandedBuffers={expandedBuffers}
          onToggleBuffer={toggleBuffer}
        />
      ) : snapshot ? (
        <div className="sdp-inspector-empty">No slots written by this step</div>
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
        <BreakpointList breakpoints={store.breakpoints} onRemove={idx => store.removeBreakpoint(idx)} />
        <div className="sdp-bp-add-row">
          <select className="sdp-bp-select" value={bpType} onChange={e => setBpType(e.target.value)}>
            <option value="step-index">Step Index</option>
            <option value="block-id">Block ID</option>
            <option value="phase-boundary">Phase Boundary</option>
            <option value="anomaly">Anomaly</option>
            <option value="value-delta">Value Delta</option>
          </select>
          {(bpType === 'step-index' || bpType === 'value-delta') && (
            <input
              className="sdp-bp-input"
              type="number"
              placeholder={bpType === 'step-index' ? 'Index' : 'Threshold'}
              value={bpValue}
              onChange={e => setBpValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddBreakpoint()}
            />
          )}
          {bpType === 'block-id' && (
            <select className="sdp-bp-select" value={bpValue} onChange={e => setBpValue(e.target.value)}>
              <option value="">Select block...</option>
              {blockIds.map(id => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          )}
          <button className="sdp-bp-add-btn" onClick={handleAddBreakpoint}>Add</button>
        </div>
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
            {blockIds.map(id => (
              <option key={id} value={id}>{id}</option>
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
}> = ({ breakpoints, onRemove }) => {
  if (breakpoints.length === 0) {
    return <div style={{ color: '#666', fontStyle: 'italic', fontSize: '0.75rem' }}>No breakpoints configured.</div>;
  }

  return (
    <ul className="sdp-bp-list">
      {breakpoints.map((bp, idx) => (
        <li key={idx} className="sdp-bp-item">
          <span className="sdp-bp-kind">{bp.kind}</span>
          <span className="sdp-bp-label">{formatBreakpoint(bp)}</span>
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
  const snapshot = store.currentSnapshot;
  if (!snapshot || snapshot.writtenSlots.size === 0) {
    return <div style={{ color: '#666', fontStyle: 'italic', fontSize: '0.75rem' }}>No expressions to display.</div>;
  }

  // We need the compiled program to look up expressions.
  // Access via the compilation inspector service as a lightweight read.
  // For now, show a placeholder if we can't access the program.
  // The store holds selectedExprId but we need the valueExprs table.
  // Since the store doesn't expose the program directly, we'll document this limitation.

  return (
    <div style={{ color: '#666', fontStyle: 'italic', fontSize: '0.75rem' }}>
      Select a slot in the table above to view its expression tree.
      <br />
      (Requires compiled program context from CompilationInspectorService)
    </div>
  );
});

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

function formatBreakpoint(bp: Breakpoint): string {
  switch (bp.kind) {
    case 'step-index':
      return `step #${bp.index}`;
    case 'block-id':
      return `block: ${bp.blockId as string}`;
    case 'phase-boundary':
      return 'phase boundary';
    case 'anomaly':
      return 'any anomaly (NaN/Inf)';
    case 'slot-condition':
      return `${bp.label} (slot condition)`;
    case 'value-delta':
      return `delta > ${bp.threshold} (slot ${bp.slot as unknown as string})`;
  }
}
