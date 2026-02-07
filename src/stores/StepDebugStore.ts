/**
 * StepDebugStore — MobX store for the step-through schedule debugger
 *
 * Wraps StepDebugSession with reactive observables for UI binding.
 * All mutations go through MobX actions via runInAction.
 */

import { makeAutoObservable, runInAction } from 'mobx';
import type { CompiledProgramIR, ValueSlot } from '../compiler/ir/program';
import type { RuntimeState } from '../runtime/RuntimeState';
import type { RenderBufferArena } from '../render/RenderBufferArena';
import type { RenderFrameIR } from '../render/types';
import { StepDebugSession } from '../runtime/StepDebugSession';
import type {
  StepSnapshot,
  Breakpoint,
  SessionMode,
  SlotValue,
  LaneIdentity,
} from '../runtime/StepDebugTypes';
import type { ValueExprId } from '../compiler/ir/Indices';
import type { BlockId, PortId } from '../types';
import { analyzeWhyNotEvaluated, type WhyNotResult } from '../runtime/WhyNotEvaluated';
import { compilationInspector } from '../services/CompilationInspectorService';
import { computeSlotDeltas, type SlotDelta } from '../runtime/ValueInspector';

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
