/**
 * src/stores/GraphHistoryStore.ts
 *
 * The single undo/redo authority for the graph editor, era-neutral.
 *
 * [LAW:single-enforcer] [LAW:one-source-of-truth] History is a representation of
 *   the sequence of authored-graph states. The only robust anchor is the authored
 *   model itself — NOT any one of the many UI write-paths (canvas, context menus,
 *   inspector, modulation table, hotkeys) that all converge on it. So this store
 *   OBSERVES the bound source's authored-state change-token and checkpoints a whole
 *   snapshot whenever it changes. Any edit through any path is captured; nothing can
 *   bypass the one authority the way it could if we intercepted a privileged method.
 *
 * [LAW:dataflow-not-control-flow] [LAW:no-mode-explosion] One code path for every
 *   mutation kind: snapshot before, restore on undo/redo. No per-kind inverse logic,
 *   no branch on "which mutation happened" — the variability lives in WHICH snapshot,
 *   a value, never in whether-we-record.
 *
 * [LAW:effects-at-boundaries] This store owns only the neutral stacks. Capturing and
 *   restoring the era-specific model state is the bound GraphSnapshotSource's job,
 *   performed at its own store boundary; the snapshot crosses this seam opaque.
 *
 * Ownership lives in RootStore, so the history survives editor-panel remounts
 * (dockview rearrangement recreates the adapter, not this store). [LAW:no-ambient-temporal-coupling]
 */

import { makeObservable, observable, action, computed, reaction, comparer } from 'mobx';

/**
 * An opaque, structurally-complete snapshot of one era's authored graph (+ layout).
 * Produced and consumed only by the SAME GraphSnapshotSource; this store treats it
 * as a black box and never inspects it. [FRAMING:representation]
 */
declare const graphHistorySnapshotBrand: unique symbol;
export interface GraphHistorySnapshot {
  readonly [graphHistorySnapshotBrand]: true;
}

/**
 * The capability an editor's data adapter exposes so its authored state can be
 * checkpointed and restored. Neutral: the store depends on this interface, the
 * era-specific adapter (UI layer) implements it and binds itself. [LAW:one-way-deps]
 */
export interface GraphSnapshotSource {
  /**
   * An observable change-token that takes a NEW (structurally-unequal) value iff the
   * authored graph or its layout changes. The history store reacts to it to know when
   * to checkpoint; it compares tokens structurally and never interprets the value.
   * Derived, compile-only churn (ScenePlan, diagnostics) MUST NOT move this token —
   * only authored edits do.
   */
  readonly historyToken: unknown;

  /** Capture the current authored state as an opaque snapshot. */
  captureHistorySnapshot(): GraphHistorySnapshot;

  /**
   * Restore a previously-captured snapshot as the current authored state. For the
   * pillar era this is an ordinary model replacement, so the live preview hot-swaps
   * through the normal recompile — continuity rules apply, no special undo path.
   */
  restoreHistorySnapshot(snapshot: GraphHistorySnapshot): void;
}

export class GraphHistoryStore {
  /** Prior states, most-recent last. Observable so canUndo drives UI affordances. */
  private past: GraphHistorySnapshot[] = [];
  /** Undone states available to redo, most-recent last. */
  private future: GraphHistorySnapshot[] = [];

  /** The currently-bound editor source, and the model identity it belongs to. */
  private source: GraphSnapshotSource | null = null;
  private key: object | null = null;
  /** The current committed state — the checkpoint that would be pushed on next edit. */
  private baseline: GraphHistorySnapshot | null = null;
  /** True while applying a restore, so the change-token reaction does not re-record it. */
  private restoring = false;
  private disposeReaction: (() => void) | null = null;

  constructor() {
    makeObservable<
      GraphHistoryStore,
      'past' | 'future' | 'onTokenChanged' | 'applyRestore'
    >(this, {
      past: observable.shallow,
      future: observable.shallow,
      canUndo: computed,
      canRedo: computed,
      bind: action,
      unbind: action,
      undo: action,
      redo: action,
      onTokenChanged: action,
      applyRestore: action,
    });
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /**
   * Bind the active editor's source. Keyed on the underlying model identity: the same
   * model (a remounted panel over the same store) keeps its history; a different model
   * starts fresh, so a restore can never target a source that cannot honor it.
   */
  bind(source: GraphSnapshotSource, key: object): void {
    this.disposeReaction?.();

    if (key !== this.key) {
      this.past = [];
      this.future = [];
      this.key = key;
    }

    this.source = source;
    this.baseline = source.captureHistorySnapshot();
    this.disposeReaction = reaction(
      () => source.historyToken,
      () => this.onTokenChanged(),
      { equals: comparer.structural },
    );
  }

  /**
   * Unbind a source on editor teardown. A no-op if a newer editor already rebound,
   * so a late unmount cannot detach the live source. The stacks are kept so history
   * survives the remount. [LAW:no-ambient-temporal-coupling]
   */
  unbind(source: GraphSnapshotSource): void {
    if (this.source !== source) return;
    this.disposeReaction?.();
    this.disposeReaction = null;
    this.source = null;
    this.baseline = null;
  }

  undo(): void {
    if (this.source === null || this.baseline === null || this.past.length === 0) return;
    // Peek, restore, THEN mutate the stacks: a throwing restore leaves past/future and
    // baseline untouched rather than losing the popped entry. [LAW:no-silent-failure]
    const oldBaseline = this.baseline;
    const previous = this.past[this.past.length - 1];
    this.applyRestore(previous);
    this.past.pop();
    this.future.push(oldBaseline);
  }

  redo(): void {
    if (this.source === null || this.baseline === null || this.future.length === 0) return;
    const oldBaseline = this.baseline;
    const next = this.future[this.future.length - 1];
    this.applyRestore(next);
    this.future.pop();
    this.past.push(oldBaseline);
  }

  /** A user edit landed in the model: the old baseline becomes history, redo is void. */
  private onTokenChanged(): void {
    // MobX flushes this reaction at the end of the outermost action — for a restore
    // that is AFTER undo()/redo() returns — so the flag cannot be reset synchronously
    // around the restore. Instead the restore's own token change consumes it here, so
    // exactly one post-restore change is swallowed and never recorded as a fresh edit.
    if (this.restoring) {
      this.restoring = false;
      return;
    }
    if (this.source === null || this.baseline === null) return;
    this.past.push(this.baseline);
    this.future = [];
    this.baseline = this.source.captureHistorySnapshot();
  }

  private applyRestore(snapshot: GraphHistorySnapshot): void {
    // Every restore bumps the source's revision, so it produces exactly one token
    // change for onTokenChanged to consume; the flag stays armed until then.
    this.restoring = true;
    try {
      this.source!.restoreHistorySnapshot(snapshot);
      this.baseline = snapshot;
    } catch (error) {
      this.restoring = false;
      throw error;
    }
  }
}
