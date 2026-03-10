/**
 * Step Debug Session — Controller wrapping the generator executor
 *
 * Provides breakpoints, execution control (stepNext, runToBreakpoint,
 * runToPhaseEnd, finishFrame), and frame lifecycle management.
 *
 * Invariant: Once startFrame() is called, the frame must be completed
 * (via finishFrame() or dispose()) before the next frame can start.
 * Abandoning a generator mid-frame would leave RuntimeState with
 * incomplete Phase 2 writes.
 */

import type { CompiledProgramIR } from '../compiler/ir/program';
import type { ValueSlot } from '../compiler/ir/Indices';
import type { RuntimeState } from './RuntimeState';
import type { RenderBufferArena } from '../render/RenderBufferArena';
import type { RenderFrameIR } from '../render/types';
import type { ValueExprId } from '../compiler/ir/Indices';
import type { StepSnapshot, Breakpoint, SessionMode, LaneIdentity } from './StepDebugTypes';
import { executeFrameStepped } from './executeFrameStepped';
import { buildLaneIdentityMap } from './ValueInspector';

export interface StepDebugSpyOptions {
  /** Low-rate spy cadence (defaults to 15Hz) */
  readonly sampleHz?: number;
  /** Max number of slots copied into one spy sample (defaults to 8) */
  readonly maxSlotsPerSample?: number;
  /** Max scalar components copied per buffer slot (defaults to 16) */
  readonly maxBufferComponents?: number;
  /** Optional slot filter; when set only these slots are sampled */
  readonly trackedSlots?: ReadonlySet<ValueSlot>;
}

export interface StepDebugSpySample {
  readonly frameId: number;
  readonly capturedAtMs: number;
  readonly phase: StepSnapshot['phase'];
  readonly stepIndex: number;
  readonly slots: ReadonlyMap<ValueSlot, Float32Array>;
}

export class StepDebugSession {
  private readonly _program: CompiledProgramIR;
  private readonly _state: RuntimeState;
  private readonly _arena: RenderBufferArena;

  private _generator: Generator<StepSnapshot, RenderFrameIR, void> | null = null;
  private _mode: SessionMode = 'idle';
  private _currentSnapshot: StepSnapshot | null = null;
  private _frameResult: RenderFrameIR | null = null;
  // [LAW:one-source-of-truth] Snapshots come from executeFrameStepped/ValueInspector,
  // which reads canonical runtime banks for slot inspection (never values.objects).
  private _history: StepSnapshot[] = [];
  private _breakpoints: Breakpoint[] = [];
  private _previousSlotValues = new Map<string, number>();
  /** Scalar slot values captured at the end of the previous frame (for cross-frame diff) */
  private _lastFrameValues: ReadonlyMap<ValueSlot, number> | null = null;
  private _spyOptions: StepDebugSpyOptions;
  private _spySamples: StepDebugSpySample[] = [];
  private _nextSpySampleAtMs = Number.NEGATIVE_INFINITY;

  constructor(
    program: CompiledProgramIR,
    state: RuntimeState,
    arena: RenderBufferArena,
    spyOptions: StepDebugSpyOptions = {},
  ) {
    this._program = program;
    this._state = state;
    this._arena = arena;
    this._spyOptions = spyOptions;
  }

  // =========================================================================
  // State accessors
  // =========================================================================

  get mode(): SessionMode {
    return this._mode;
  }

  get currentSnapshot(): StepSnapshot | null {
    return this._currentSnapshot;
  }

  get frameResult(): RenderFrameIR | null {
    return this._frameResult;
  }

  get stepHistory(): readonly StepSnapshot[] {
    return this._history;
  }

  /** Previous frame's scalar slot values (null if no frame has completed yet) */
  get lastFrameValues(): ReadonlyMap<ValueSlot, number> | null {
    return this._lastFrameValues;
  }

  get spyOptions(): StepDebugSpyOptions {
    return this._spyOptions;
  }

  setSpyOptions(options: StepDebugSpyOptions): void {
    this._spyOptions = options;
  }

  drainSpySamples(): readonly StepDebugSpySample[] {
    if (this._spySamples.length === 0) {
      return [];
    }
    const drained = this._spySamples.slice();
    this._spySamples.length = 0;
    return drained;
  }

  // =========================================================================
  // Breakpoints
  // =========================================================================

  addBreakpoint(bp: Breakpoint): void {
    this._breakpoints.push(bp);
  }

  removeBreakpoint(bp: Breakpoint): void {
    const idx = this._breakpoints.findIndex(b => breakpointsEqual(b, bp));
    if (idx >= 0) {
      this._breakpoints.splice(idx, 1);
    }
  }

  clearBreakpoints(): void {
    this._breakpoints.length = 0;
  }

  get breakpoints(): readonly Breakpoint[] {
    return this._breakpoints;
  }

  // =========================================================================
  // Execution control
  // =========================================================================

  /**
   * Start a new frame. Must not be called while a frame is in progress.
   * Returns the first snapshot (pre-frame).
   */
  startFrame(tAbsMs: number): StepSnapshot {
    if (this._mode === 'paused' || this._mode === 'running') {
      throw new Error('StepDebugSession: Cannot start a new frame while one is in progress. Call finishFrame() or dispose() first.');
    }

    this._generator = executeFrameStepped(this._program, this._state, this._arena, tAbsMs, this._lastFrameValues);
    this._mode = 'paused';
    this._frameResult = null;
    this._history = [];
    this._previousSlotValues.clear();
    if (!Number.isFinite(this._nextSpySampleAtMs)) {
      this._nextSpySampleAtMs = tAbsMs;
    }

    // Get first snapshot (pre-frame)
    const result = this._generator.next();
    if (result.done) {
      throw new Error('StepDebugSession: Generator returned immediately — empty schedule?');
    }

    this._currentSnapshot = result.value;
    this._history.push(result.value);
    this._recordSlotValues(result.value);
    this._captureSpySample(result.value);
    return result.value;
  }

  /**
   * Advance one step. Returns the next snapshot, or null if the frame completed.
   */
  stepNext(): StepSnapshot | null {
    if (this._mode !== 'paused' || !this._generator) {
      return null;
    }

    const result = this._generator.next();
    if (result.done) {
      this._captureFrameEndValues();
      this._frameResult = result.value;
      this._mode = 'completed';
      this._currentSnapshot = null;
      return null;
    }

    this._currentSnapshot = result.value;
    this._history.push(result.value);
    this._recordSlotValues(result.value);
    this._captureSpySample(result.value);
    return result.value;
  }

  /**
   * Run until a breakpoint matches or the frame completes.
   * Returns the snapshot that matched, or null if the frame completed.
   */
  runToBreakpoint(): StepSnapshot | null {
    if (this._mode !== 'paused' || !this._generator) {
      return null;
    }

    this._mode = 'running';

    while (true) {
      const result = this._generator.next();
      if (result.done) {
        this._captureFrameEndValues();
        this._frameResult = result.value;
        this._mode = 'completed';
        this._currentSnapshot = null;
        return null;
      }

      const snapshot = result.value;
      this._history.push(snapshot);
      this._captureSpySample(snapshot);

      if (this._matchesBreakpoint(snapshot)) {
        this._recordSlotValues(snapshot);
        this._currentSnapshot = snapshot;
        this._mode = 'paused';
        return snapshot;
      }
      this._recordSlotValues(snapshot);
    }
  }

  /**
   * Run until the end of the current phase (stops at phase boundary).
   * Returns the snapshot at the boundary, or null if the frame completed.
   */
  runToPhaseEnd(): StepSnapshot | null {
    if (this._mode !== 'paused' || !this._generator || !this._currentSnapshot) {
      return null;
    }

    const currentPhase = this._currentSnapshot.phase;
    this._mode = 'running';

    while (true) {
      const result = this._generator.next();
      if (result.done) {
        this._captureFrameEndValues();
        this._frameResult = result.value;
        this._mode = 'completed';
        this._currentSnapshot = null;
        return null;
      }

      const snapshot = result.value;
      this._history.push(snapshot);
      this._recordSlotValues(snapshot);
      this._captureSpySample(snapshot);

      // Stop when we've transitioned to a different phase
      if (snapshot.phase !== currentPhase) {
        this._currentSnapshot = snapshot;
        this._mode = 'paused';
        return snapshot;
      }
    }
  }

  /**
   * Run the rest of the frame to completion. Returns the frame result.
   */
  finishFrame(): RenderFrameIR | null {
    if (this._mode === 'completed') {
      return this._frameResult;
    }

    if (!this._generator) {
      return null;
    }

    this._mode = 'running';

    while (true) {
      const result = this._generator.next();
      if (result.done) {
        this._captureFrameEndValues();
        this._frameResult = result.value;
        this._mode = 'completed';
        this._currentSnapshot = null;
        return result.value;
      }
      this._history.push(result.value);
      this._recordSlotValues(result.value);
      this._captureSpySample(result.value);
    }
  }

  // =========================================================================
  // Lane Identity Query (F5: Continuity State Integration)
  // =========================================================================

  /**
   * Get lane identity information for a field slot.
   * Reads from the current program's field slot registry and continuity state.
   *
   * @param slot - The field slot to query
   * @returns Array of LaneIdentity entries (one per lane), or null if not a field slot
   */
  getLaneIdentities(slot: ValueSlot): readonly LaneIdentity[] | null {
    const identityMap = buildLaneIdentityMap(this._program, this._state.continuity);
    return identityMap.get(slot) ?? null;
  }

  // =========================================================================
  // Expression Tree Query (E3: DAG visualization)
  // =========================================================================

  /**
   * Read the cached scalar value for an expression from runtime state.
   * Returns null if the expression hasn't been evaluated this frame or isn't a scalar.
   */
  getCachedValue(exprId: ValueExprId): number | null {
    const numId = exprId as number;
    const cache = this._state.cache;
    if (cache.scalarValueExprStamps[numId] === cache.frameId) {
      return cache.scalarValueExprValues[numId];
    }
    return null;
  }

  /** Expose the compiled program for expression tree building (read-only). */
  get program(): CompiledProgramIR {
    return this._program;
  }

  /**
   * Dispose the session. If a frame is in progress, finishes it first
   * to leave RuntimeState in a consistent state.
   */
  dispose(): void {
    if (this._generator && (this._mode === 'paused' || this._mode === 'running')) {
      // Must complete the generator to avoid leaving RuntimeState inconsistent
      this.finishFrame();
    }
    this._generator = null;
    this._mode = 'idle';
    this._currentSnapshot = null;
    this._history = [];
  }

  // =========================================================================
  // Private
  // =========================================================================

  private _matchesBreakpoint(snapshot: StepSnapshot): boolean {
    for (const bp of this._breakpoints) {
      switch (bp.kind) {
        case 'step-index':
          if (snapshot.stepIndex === bp.index) return true;
          break;
        case 'block-id': {
          // Resolve numeric blockId to string ID via blockMap, since breakpoints
          // store the patch string key (e.g. "b0") not the numeric block index
          if (snapshot.blockId !== null) {
            const stringId = this._program.debugIndex.blockMap.get(snapshot.blockId);
            if (stringId === (bp.blockId as string)) return true;
          }
          break;
        }
        case 'phase-boundary':
          if (snapshot.phase === 'phase-boundary') return true;
          break;
        case 'anomaly':
          if (snapshot.anomalies.length > 0) return true;
          break;
        case 'slot-condition': {
          const slotValue = snapshot.writtenSlots.get(bp.slot);
          if (slotValue && slotValue.kind === 'scalar' && bp.predicate(slotValue.value)) {
            return true;
          }
          break;
        }
        case 'value-delta': {
          const slotValue = snapshot.writtenSlots.get(bp.slot);
          if (slotValue && slotValue.kind === 'scalar') {
            const key = String(bp.slot);
            const prev = this._previousSlotValues.get(key);
            if (prev !== undefined && Math.abs(slotValue.value - prev) > bp.threshold) {
              return true;
            }
          }
          break;
        }
      }
    }
    return false;
  }

  /**
   * Capture the final scalar slot values from the completed frame's history.
   * Iterates in reverse so the last-written value per slot wins.
   * Stored in _lastFrameValues for passing to the next frame's generator.
   */
  private _captureFrameEndValues(): void {
    const values = new Map<ValueSlot, number>();
    // Walk history in order — later writes overwrite earlier ones
    for (const snapshot of this._history) {
      for (const [slot, value] of snapshot.writtenSlots) {
        if (value.kind === 'scalar') {
          values.set(slot, value.value);
        }
      }
    }
    this._lastFrameValues = values;
  }

  /**
   * Record scalar slot values from a snapshot for value-delta tracking.
   */
  private _recordSlotValues(snapshot: StepSnapshot): void {
    for (const [slot, value] of snapshot.writtenSlots) {
      if (value.kind === 'scalar') {
        this._previousSlotValues.set(String(slot), value.value);
      }
    }
  }

  private _captureSpySample(snapshot: StepSnapshot): void {
    if (!Number.isFinite(snapshot.tMs)) {
      return;
    }
    const intervalMs = this._resolveSpyIntervalMs();
    if (snapshot.tMs < this._nextSpySampleAtMs) {
      return;
    }

    // [LAW:dataflow-not-control-flow] Spy sampling always runs through one
    // path; cadence/selection vary through configured data only.
    const slotCap = Math.max(1, this._spyOptions.maxSlotsPerSample ?? 8);
    const trackedSlots = this._spyOptions.trackedSlots;
    const sampledSlots = new Map<ValueSlot, Float32Array>();

    for (const [slot, value] of snapshot.writtenSlots) {
      if (sampledSlots.size >= slotCap) break;
      if (trackedSlots && !trackedSlots.has(slot)) continue;
      if (value.kind === 'scalar') {
        sampledSlots.set(slot, new Float32Array([value.value]));
        continue;
      }
      if (value.kind === 'buffer') {
        const clipped = this._copyBufferSample(value.buffer);
        if (clipped.length > 0) {
          sampledSlots.set(slot, clipped);
        }
      }
    }

    if (sampledSlots.size === 0) {
      return;
    }

    this._spySamples.push({
      frameId: snapshot.frameId,
      capturedAtMs: snapshot.tMs,
      phase: snapshot.phase,
      stepIndex: snapshot.stepIndex,
      slots: sampledSlots,
    });

    while (this._nextSpySampleAtMs <= snapshot.tMs) {
      this._nextSpySampleAtMs += intervalMs;
    }
  }

  private _resolveSpyIntervalMs(): number {
    const hz = this._spyOptions.sampleHz ?? 15;
    if (!Number.isFinite(hz) || hz <= 0) {
      return 1000 / 15;
    }
    return 1000 / hz;
  }

  private _copyBufferSample(buffer: ArrayBufferView): Float32Array {
    const maxComponents = Math.max(1, this._spyOptions.maxBufferComponents ?? 16);
    const candidate = buffer as ArrayBufferView & { length?: number; [index: number]: number };
    if (typeof candidate.length === 'number') {
      const count = Math.min(maxComponents, candidate.length);
      const out = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        out[i] = Number(candidate[i] ?? 0);
      }
      return out;
    }
    // [LAW:one-source-of-truth] byteLength is the authoritative byte budget for
    // decoding sampled floats; truncate partial trailing bytes deterministically.
    const total = Math.min(maxComponents, Math.floor(buffer.byteLength / Float32Array.BYTES_PER_ELEMENT));
    if (total <= 0) {
      return new Float32Array(0);
    }
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const out = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      out[i] = view.getFloat32(i * Float32Array.BYTES_PER_ELEMENT, true);
    }
    return out;
  }
}

/**
 * Check if two breakpoints are structurally equal.
 */
function breakpointsEqual(a: Breakpoint, b: Breakpoint): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'step-index':
      return (b as typeof a).index === a.index;
    case 'block-id':
      return (b as typeof a).blockId === a.blockId;
    case 'phase-boundary':
    case 'anomaly':
      return true;
    case 'slot-condition':
      return (b as typeof a).slot === a.slot && (b as typeof a).predicate === a.predicate;
    case 'value-delta':
      return (b as typeof a).slot === a.slot && (b as typeof a).threshold === a.threshold;
    default: {
      const _exhaustive: never = a;
      return _exhaustive;
    }
  }
}
