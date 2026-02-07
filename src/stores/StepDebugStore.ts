/**
 * StepDebugStore — MobX store for the step-through schedule debugger
 *
 * Wraps StepDebugSession with reactive observables for UI binding.
 * All mutations go through MobX actions via runInAction.
 */

import { makeAutoObservable, runInAction } from 'mobx';
import type { CompiledProgramIR, ValueSlot, DebugIndexIR } from '../compiler/ir/program';
import type { RuntimeState } from '../runtime/RuntimeState';
import type { RenderBufferArena } from '../render/RenderBufferArena';
import type { RenderFrameIR } from '../render/types';
import { StepDebugSession } from '../runtime/StepDebugSession';
import type {
  StepSnapshot,
  Breakpoint,
  SessionMode,
  SlotValue,
  StateSlotValue,
  LaneIdentity,
  ExprTreeNode,
  FrameSummary,
  BlockSummary,
  BlockGroup,
} from '../runtime/StepDebugTypes';
import type { StateSlotId } from '../compiler/ir/types';
import type { ValueExprId } from '../compiler/ir/Indices';
import type { BlockId, PortId } from '../types';
import { analyzeWhyNotEvaluated, type WhyNotResult } from '../runtime/WhyNotEvaluated';
import { compilationInspector } from '../services/CompilationInspectorService';
import { computeSlotDeltas, type SlotDelta } from '../runtime/ValueInspector';
import { getValueExprChildren } from '../runtime/ValueExprTreeWalker';
import type { ValueExpr } from '../compiler/ir/value-expr';

export class StepDebugStore {
  /** Whether the step debugger is active (controls animation loop branching) */
  active: boolean = false;

  /** Current session mode */
  mode: SessionMode = 'idle';

  /** Current step snapshot (null when idle or completed) */
  currentSnapshot: StepSnapshot | null = null;

  /** Step history for the current frame */
  history: StepSnapshot[] = [];

  /** Configured breakpoints */
  breakpoints: Breakpoint[] = [];

  /** Currently selected slot for inspection */
  selectedSlot: ValueSlot | null = null;

  /** Currently selected expression for tree view */
  selectedExprId: ValueExprId | null = null;

  /** Last completed frame result */
  lastFrameResult: RenderFrameIR | null = null;

  /** Internal session (not observable — accessed via actions) */
  private _session: StepDebugSession | null = null;

  /** Last compiled program (for WhyNotEvaluated analysis) */
  private _lastProgram: CompiledProgramIR | null = null;

  constructor() {
    makeAutoObservable<StepDebugStore, '_session' | '_disposeSession' | '_lastProgram'>(this, {
      _session: false,
      _disposeSession: false,
      _lastProgram: false,
    });
  }

  // =========================================================================
  // Activation
  // =========================================================================

  activate(): void {
    runInAction(() => {
      this.active = true;
      this.mode = 'idle';
    });
  }

  deactivate(): void {
    this._disposeSession();
    runInAction(() => {
      this.active = false;
      this.mode = 'idle';
      this.currentSnapshot = null;
      this.history = [];
      this.lastFrameResult = null;
    });
  }

  // =========================================================================
  // Frame lifecycle
  // =========================================================================

  startFrame(
    program: CompiledProgramIR,
    state: RuntimeState,
    arena: RenderBufferArena,
    tAbsMs: number,
  ): void {
    // Dispose previous session if still alive
    this._disposeSession();

    const session = new StepDebugSession(program, state, arena);
    this._lastProgram = program;

    // Apply breakpoints from store
    for (const bp of this.breakpoints) {
      session.addBreakpoint(bp);
    }

    const snapshot = session.startFrame(tAbsMs);
    this._session = session;

    runInAction(() => {
      this.mode = 'paused';
      this.currentSnapshot = snapshot;
      this.history = [snapshot];
    });
  }

  stepNext(): void {
    if (!this._session) return;

    const snapshot = this._session.stepNext();
    runInAction(() => {
      if (snapshot) {
        this.mode = 'paused';
        this.currentSnapshot = snapshot;
        this.history.push(snapshot);
      } else {
        this.mode = 'completed';
        this.currentSnapshot = null;
        this.lastFrameResult = this._session?.frameResult ?? null;
      }
    });
  }

  runToBreakpoint(): void {
    if (!this._session) return;

    const snapshot = this._session.runToBreakpoint();
    runInAction(() => {
      if (snapshot) {
        this.mode = 'paused';
        this.currentSnapshot = snapshot;
        // Sync history from session
        this.history = [...this._session!.stepHistory];
      } else {
        this.mode = 'completed';
        this.currentSnapshot = null;
        this.lastFrameResult = this._session?.frameResult ?? null;
      }
    });
  }

  runToPhaseEnd(): void {
    if (!this._session) return;

    const snapshot = this._session.runToPhaseEnd();
    runInAction(() => {
      if (snapshot) {
        this.mode = 'paused';
        this.currentSnapshot = snapshot;
        this.history = [...this._session!.stepHistory];
      } else {
        this.mode = 'completed';
        this.currentSnapshot = null;
        this.lastFrameResult = this._session?.frameResult ?? null;
      }
    });
  }

  finishFrame(): void {
    if (!this._session) return;

    const frame = this._session.finishFrame();
    runInAction(() => {
      this.mode = 'completed';
      this.currentSnapshot = null;
      this.lastFrameResult = frame;
      this.history = [...this._session!.stepHistory];
    });
  }

  // =========================================================================
  // Breakpoints
  // =========================================================================

  addBreakpoint(bp: Breakpoint): void {
    runInAction(() => {
      this.breakpoints.push(bp);
    });
    this._session?.addBreakpoint(bp);
  }

  removeBreakpoint(index: number): void {
    const bp = this.breakpoints[index];
    if (!bp) return;

    this._session?.removeBreakpoint(bp);
    runInAction(() => {
      this.breakpoints.splice(index, 1);
    });
  }

  toggleAnomalyBreakpoint(): void {
    const existing = this.breakpoints.findIndex(b => b.kind === 'anomaly');
    if (existing >= 0) {
      this.removeBreakpoint(existing);
    } else {
      this.addBreakpoint({ kind: 'anomaly' });
    }
  }

  addSlotConditionBreakpoint(slot: ValueSlot, label: string, predicate: (v: number) => boolean): void {
    this.addBreakpoint({ kind: 'slot-condition', slot, label, predicate });
  }

  addValueDeltaBreakpoint(slot: ValueSlot, threshold: number): void {
    this.addBreakpoint({ kind: 'value-delta', slot, threshold });
  }

  // =========================================================================
  // Inspection
  // =========================================================================

  inspectSlot(slot: ValueSlot): SlotValue | undefined {
    if (!this.currentSnapshot) return undefined;
    return this.currentSnapshot.writtenSlots.get(slot);
  }

  /**
   * Get lane identity information for a field slot.
   * Delegates to the active session's getLaneIdentities query.
   *
   * @param slot - The field slot to query
   * @returns Array of LaneIdentity entries (one per lane), or null if not available
   */
  getLaneIdentities(slot: ValueSlot): readonly LaneIdentity[] | null {
    return this._session?.getLaneIdentities(slot) ?? null;
  }

  /** Read-only access to the debug index for UI slot name resolution */
  get debugIndex(): DebugIndexIR | null {
    return this._lastProgram?.debugIndex ?? null;
  }

  /**
   * Compute cross-frame deltas for the current snapshot's written scalar slots.
   * Returns null if no snapshot or no previous frame values are available.
   */
  get currentDeltas(): ReadonlyMap<ValueSlot, SlotDelta> | null {
    if (!this.currentSnapshot) return null;
    if (!this.currentSnapshot.previousFrameValues) return null;
    return computeSlotDeltas(this.currentSnapshot.writtenSlots, this.currentSnapshot.previousFrameValues);
  }

  /**
   * Cumulative value slot state: all ValueSlot values written up to (and including)
   * the current snapshot position, by replaying history.
   * MobX memoizes this — recomputes only when history or currentSnapshot changes.
   */
  get cumulativeValueSlots(): ReadonlyMap<ValueSlot, SlotValue> {
    const result = new Map<ValueSlot, SlotValue>();
    const targetIdx = this.currentSnapshot
      ? this.history.indexOf(this.currentSnapshot)
      : this.history.length - 1;

    for (let i = 0; i <= targetIdx && i < this.history.length; i++) {
      for (const [slot, value] of this.history[i].writtenSlots) {
        result.set(slot, value);
      }
    }
    return result;
  }

  /**
   * Cumulative state slot values: all state writes up to (and including)
   * the current snapshot position, by replaying history.
   */
  get cumulativeStateSlots(): ReadonlyMap<StateSlotId, StateSlotValue> {
    const result = new Map<StateSlotId, StateSlotValue>();
    const targetIdx = this.currentSnapshot
      ? this.history.indexOf(this.currentSnapshot)
      : this.history.length - 1;

    for (let i = 0; i <= targetIdx && i < this.history.length; i++) {
      for (const [slot, value] of this.history[i].writtenStateSlots) {
        result.set(slot, value);
      }
    }
    return result;
  }

  // =========================================================================
  // Frame Summary & Block-Centric View (E5)
  // =========================================================================

  /**
   * Human-readable summary of the completed frame, grouped by block.
   * Returns null when the frame is not yet completed or history is empty.
   */
  get frameSummary(): FrameSummary | null {
    if (this.mode !== 'completed' || this.history.length === 0) return null;

    const blockAccum = new Map<string, {
      blockId: BlockId | null;
      blockName: string;
      stepCount: number;
      anomalyCount: number;
      portNames: Set<string>;
      scalarMin: number;
      scalarMax: number;
      hasScalar: boolean;
      fieldLaneCount: number | null;
      stepKinds: Set<string>;
    }>();

    let totalAnomalies = 0;
    let phase1Steps = 0;
    let phase2Steps = 0;

    for (const snap of this.history) {
      if (snap.phase === 'phase1') phase1Steps++;
      else if (snap.phase === 'phase2') phase2Steps++;

      totalAnomalies += snap.anomalies.length;

      const key = snap.blockName ?? '(system)';
      let acc = blockAccum.get(key);
      if (!acc) {
        acc = {
          blockId: snap.blockId,
          blockName: key,
          stepCount: 0,
          anomalyCount: 0,
          portNames: new Set(),
          scalarMin: Infinity,
          scalarMax: -Infinity,
          hasScalar: false,
          fieldLaneCount: null,
          stepKinds: new Set(),
        };
        blockAccum.set(key, acc);
      }

      acc.stepCount++;
      acc.anomalyCount += snap.anomalies.length;
      if (snap.portId) acc.portNames.add(snap.portId as string);
      if (snap.step) acc.stepKinds.add(snap.step.kind);

      for (const [, val] of snap.writtenSlots) {
        if (val.kind === 'scalar') {
          const v = val.value;
          if (Number.isFinite(v)) {
            acc.hasScalar = true;
            if (v < acc.scalarMin) acc.scalarMin = v;
            if (v > acc.scalarMax) acc.scalarMax = v;
          }
        } else if (val.kind === 'buffer') {
          acc.fieldLaneCount = (acc.fieldLaneCount ?? 0) + val.count;
        }
      }
    }

    const blocks: BlockSummary[] = [];
    for (const acc of blockAccum.values()) {
      blocks.push({
        blockId: acc.blockId,
        blockName: acc.blockName,
        stepCount: acc.stepCount,
        anomalyCount: acc.anomalyCount,
        portNames: Array.from(acc.portNames),
        scalarRange: acc.hasScalar ? { min: acc.scalarMin, max: acc.scalarMax } : null,
        fieldLaneCount: acc.fieldLaneCount,
        stepKinds: acc.stepKinds,
      });
    }

    return { totalSteps: this.history.length, blocks, totalAnomalies, phase1Steps, phase2Steps };
  }

  /**
   * History grouped by source block (order of first appearance preserved).
   * Used by the block-centric view toggle.
   */
  get blockGroupedHistory(): readonly BlockGroup[] {
    if (this.history.length === 0) return [];

    const groupMap = new Map<string, BlockGroup & { steps: StepSnapshot[] }>();
    const order: string[] = [];

    for (const snap of this.history) {
      const key = snap.blockName ?? '(system)';
      let group = groupMap.get(key);
      if (!group) {
        group = {
          blockId: snap.blockId,
          blockName: key,
          steps: [],
          anomalyCount: 0,
        };
        groupMap.set(key, group);
        order.push(key);
      }
      group.steps.push(snap);
      (group as { anomalyCount: number }).anomalyCount += snap.anomalies.length;
    }

    return order.map(k => groupMap.get(k)!);
  }

  /**
   * Analyze why a block/port has no value in the debugger.
   *
   * Examines compiler pass outputs to determine the root cause:
   * compile error, not scheduled, pruned, disconnected, or event not fired.
   *
   * @param blockId - String block ID from the patch
   * @param portId - Optional port ID to narrow the analysis
   * @returns WhyNotResult with reasons, or null if no program/session context
   */
  analyzeWhyNotEvaluated(blockId: BlockId, portId?: PortId): WhyNotResult | null {
    const program = this._lastProgram;
    const snapshot = compilationInspector.getLatestSnapshot() ?? null;

    if (!program && !snapshot) return null;

    return analyzeWhyNotEvaluated(blockId, portId, program, snapshot);
  }

  // =========================================================================
  // Expression Tree (E3: DAG visualization)
  // =========================================================================

  /**
   * Determine the root ValueExprId for the current step's expression tree.
   * Returns null for steps that don't have a single root expression
   * (render, continuityMapBuild, continuityApply).
   */
  getRootExprId(): ValueExprId | null {
    const step = this.currentSnapshot?.step;
    if (!step) return null;
    switch (step.kind) {
      case 'evalValue': return step.expr;
      case 'materialize': return step.field;
      case 'stateWrite': return step.value;
      case 'fieldStateWrite': return step.value;
      case 'slotWriteStrided': return step.inputs[0] ?? null;
      default: return null;
    }
  }

  /**
   * Build the expression tree view model for a given root expression.
   *
   * Uses the compiled program's ValueExpr table and debugIndex for provenance,
   * plus the session's runtime cache for live scalar values.
   * Cycle-safe via visited set — each expression appears at most once.
   *
   * @param rootExprId - The root expression to start from
   * @returns ExprTreeNode tree, or null if no program is available
   */
  buildExprTree(rootExprId: ValueExprId): ExprTreeNode | null {
    const program = this._lastProgram;
    if (!program) return null;

    const nodes = program.valueExprs.nodes;
    const exprToBlock = program.debugIndex.exprToBlock;
    const blockMap = program.debugIndex.blockMap;
    const visited = new Set<number>();

    const build = (exprId: ValueExprId, depth: number): ExprTreeNode | null => {
      const numId = exprId as number;
      if (visited.has(numId)) {
        return { id: numId, label: '(cycle)', blockName: null, portName: null, role: null, value: null, isAnomaly: false, children: [] };
      }

      const expr = nodes[numId];
      if (!expr) return null;

      if (depth > 30) {
        return { id: numId, label: '(too deep)', blockName: null, portName: null, role: null, value: null, isAnomaly: false, children: [] };
      }

      visited.add(numId);

      // Resolve provenance-aware block name, port name, and role
      const blockDisplayNames = program.debugIndex.blockDisplayNames;
      const prov = program.debugIndex.exprProvenance?.get(exprId);
      let blockName: string | null = null;
      let portName: string | null = null;
      let role: ExprTreeNode['role'] = null;

      if (prov) {
        if (prov.userTarget) {
          switch (prov.userTarget.kind) {
            case 'defaultSource': {
              blockName = blockDisplayNames?.get(prov.userTarget.targetBlockId)
                ?? blockMap.get(prov.userTarget.targetBlockId) ?? null;
              portName = prov.userTarget.targetPortName;
              role = 'default';
              break;
            }
            case 'adapter': {
              blockName = prov.userTarget.adapterType;
              role = 'adapter';
              break;
            }
            case 'wireState': {
              blockName = blockDisplayNames?.get(prov.blockId)
                ?? blockMap.get(prov.blockId) ?? null;
              role = 'wireState';
              break;
            }
            case 'lens': {
              blockName = blockDisplayNames?.get(prov.blockId)
                ?? blockMap.get(prov.blockId) ?? null;
              role = 'lens';
              break;
            }
            case 'compositeExpansion': {
              blockName = blockDisplayNames?.get(prov.blockId)
                ?? blockMap.get(prov.blockId) ?? null;
              role = 'composite';
              break;
            }
          }
        } else {
          // User block — resolve directly
          blockName = blockDisplayNames?.get(prov.blockId)
            ?? blockMap.get(prov.blockId) ?? null;
          portName = prov.portName;
          role = 'user';
        }
      } else {
        // Fallback: no provenance available (infrastructure exprs like time)
        const blockId = exprToBlock.get(exprId);
        blockName = blockId != null
          ? (blockDisplayNames?.get(blockId) ?? blockMap.get(blockId) ?? null)
          : null;
      }

      // Read cached scalar value
      const value = this._session?.getCachedValue(exprId) ?? null;
      const isAnomaly = value != null && (Number.isNaN(value) || !Number.isFinite(value));

      // Build children recursively
      const childIds = getValueExprChildren(expr);
      const children: ExprTreeNode[] = [];
      for (const childId of childIds) {
        const child = build(childId, depth + 1);
        if (child) children.push(child);
      }

      return {
        id: numId,
        label: formatExprLabel(expr),
        blockName,
        portName,
        role,
        value,
        isAnomaly,
        children,
      };
    };

    return build(rootExprId, 0);
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  dispose(): void {
    this._disposeSession();
    runInAction(() => {
      this.active = false;
      this.mode = 'idle';
      this.currentSnapshot = null;
      this.history = [];
      this.breakpoints = [];
      this.lastFrameResult = null;
    });
  }

  private _disposeSession(): void {
    if (this._session) {
      this._session.dispose();
      this._session = null;
    }
  }
}

// =============================================================================
// Helpers (module-private)
// =============================================================================

/**
 * Format a human-readable label for a ValueExpr node.
 * Uses the kind as base, with sub-kind for kernel and event expressions.
 */
function formatExprLabel(expr: ValueExpr): string {
  switch (expr.kind) {
    case 'const': {
      const v = expr.value;
      if (v.kind === 'float') return `const(${v.value})`;
      if (v.kind === 'bool') return `const(${v.value})`;
      if (v.kind === 'int') return `const(${v.value})`;
      return `const:${v.kind}`;
    }
    case 'external': return `external(${expr.channel})`;
    case 'intrinsic': return expr.intrinsicKind === 'property'
      ? `intrinsic:${expr.intrinsic}`
      : `intrinsic:${expr.field}`;
    case 'kernel': return `kernel:${expr.kernelKind}`;
    case 'state': return `state(${expr.stateKey})`;
    case 'time': return `time:${expr.which}`;
    case 'shapeRef': return 'shapeRef';
    case 'eventRead': return 'eventRead';
    case 'event': return `event:${expr.eventKind}`;
    case 'extract': return `extract[${expr.componentIndex}]`;
    case 'construct': return 'construct';
    case 'hslToRgb': return 'hslToRgb';
    default: {
      const _exhaustive: never = expr;
      return (_exhaustive as any).kind ?? 'unknown';
    }
  }
}
