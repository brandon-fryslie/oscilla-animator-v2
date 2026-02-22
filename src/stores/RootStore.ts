/**
 * RootStore - Store Composition
 *
 * Creates and owns all child stores.
 * Provides dependency injection (e.g., SelectionStore depends on PatchStore).
 * Single instance accessed via React context.
 *
 * Extended with EventHub and DiagnosticHub for event-driven diagnostics.
 */

import { reaction } from 'mobx';
import { configureMobX } from './configure';
import { PatchStore } from './PatchStore';
import { SelectionStore } from './SelectionStore';
import { ViewportStore } from './ViewportStore';
import { PlaybackStore } from './PlaybackStore';
import { DiagnosticsStore } from './DiagnosticsStore';
import { ContinuityStore } from './ContinuityStore';
import { PortHighlightStore } from './PortHighlightStore';
import { DebugStore } from './DebugStore';
import { LayoutStore } from './LayoutStore';
import { CameraStore } from './CameraStore';
import { SettingsStore } from './SettingsStore';
import { FrontendResultStore } from './FrontendResultStore';
import { EventHub } from '../events/EventHub';
import { DiagnosticHub } from '../diagnostics/DiagnosticHub';
import { CompositeEditorStore } from './CompositeEditorStore';
import { StepDebugStore } from './StepDebugStore';
import { DemoStore } from './DemoStore';
import { HelpStore } from './HelpStore';
import { ExpressionEditorStore } from './ExpressionEditorStore';
import { executeAction, type ActionResult } from '../diagnostics/actionExecutor';
import type { DiagnosticAction } from '../diagnostics/types';
import {
  setPatchPersistenceIssueReporter,
  getPatchPersistenceIssues,
  clearPatchPersistenceIssues,
} from '../services/PatchPersistence';
import { debugService } from '../services/DebugService';

export class RootStore {
  readonly patch: PatchStore;
  readonly selection: SelectionStore;
  readonly viewport: ViewportStore;
  readonly playback: PlaybackStore;
  readonly diagnostics: DiagnosticsStore;
  readonly continuity: ContinuityStore;
  readonly portHighlight: PortHighlightStore;
  readonly debug: DebugStore;
  readonly layout: LayoutStore;
  readonly camera: CameraStore;
  readonly settings: SettingsStore;
  readonly events: EventHub;
  readonly compositeEditor: CompositeEditorStore;
  readonly frontend: FrontendResultStore;
  readonly stepDebug: StepDebugStore;
  readonly demo: DemoStore;
  readonly help: HelpStore;
  readonly expressionEditor: ExpressionEditorStore;

  // Patch revision tracking (for diagnostics)
  private patchRevision: number = 0;

  // Disposal tracking
  private diagnosticHub: DiagnosticHub;
  private graphCommittedDisposer: (() => void) | null = null;

  constructor() {
    // Configure MobX strict mode before creating stores
    configureMobX();

    // Create stores
    this.patch = new PatchStore();
    this.selection = new SelectionStore(this.patch); // Inject PatchStore dependency
    this.viewport = new ViewportStore();
    this.playback = new PlaybackStore();
    this.portHighlight = new PortHighlightStore(this.patch); // Inject PatchStore dependency

    // Create EventHub
    this.events = new EventHub();

    // Create DiagnosticHub and DiagnosticsStore
    this.diagnosticHub = new DiagnosticHub(
      this.events,
      'patch-0',
      () => this.patch.patch
    );
    this.diagnostics = new DiagnosticsStore(this.diagnosticHub);
    this.events.setErrorReporter(({ scope, eventType, error }) => {
      const message = error instanceof Error ? error.message : String(error);
      // [LAW:single-enforcer] RootStore routes EventHub listener failures into
      // the diagnostics boundary, avoiding duplicate console + diagnostics paths.
      this.diagnostics.log({
        level: 'error',
        message: `EventHub listener failure (${scope}:${eventType}): ${message}`,
      });
    });
    // Create ContinuityStore
    this.continuity = new ContinuityStore();

    // [LAW:single-enforcer] Route settings persistence/load failures through
    // diagnostics to keep runtime issue reporting at one boundary.
    this.settings = new SettingsStore((issue) => {
      const ns = issue.namespace ? ` (${issue.namespace})` : '';
      this.diagnostics.log({
        level: issue.level,
        message: `SettingsStore${ns}: ${issue.message}`,
      });
    });

    // Create DebugStore (inject SettingsStore for sync)
    this.debug = new DebugStore(this.settings);

    // Create LayoutStore (node positions - UI state, not topology)
    this.layout = new LayoutStore();

    // Create CameraStore (3D preview state - viewer only)
    this.camera = new CameraStore();

    // [LAW:single-enforcer] Route composite editor operational issues through
    // RootStore diagnostics instead of store-local console side effects.
    this.compositeEditor = new CompositeEditorStore((issue) => {
      this.diagnostics.log({
        level: issue.level,
        message: `CompositeEditor: ${issue.message}`,
      });
    });

    // Create FrontendResultStore (frontend compilation results for UI)
    this.frontend = new FrontendResultStore();

    // Create StepDebugStore (step-through schedule debugger)
    this.stepDebug = new StepDebugStore();

    // Create DemoStore (inject PatchStore dependency)
    this.demo = new DemoStore(this.patch);

    // Create HelpStore (no dependencies)
    this.help = new HelpStore();

    // Create ExpressionEditorStore (active block for docked expression workbench)
    this.expressionEditor = new ExpressionEditorStore();

    // Wire up callback for MobX reactivity
    this.diagnosticHub.setOnRevisionChange(() => this.diagnostics.incrementRevision());

    // Wire up logging callback for param flow visibility
    this.diagnosticHub.setOnLog((entry) => this.diagnostics.log(entry));

    // Wire up EventHub to PatchStore for ParamChanged events
    this.patch.setEventHub(this.events, 'patch-0', () => this.patchRevision);
    this.patch.setIssueReporter((issue) => {
      // [LAW:single-enforcer] RootStore is the canonical diagnostics boundary
      // for non-fatal operational issues emitted by child stores.
      this.diagnostics.log({
        level: issue.level,
        message: `PatchStore: ${issue.message}`,
      });
    });
    // [LAW:single-enforcer] RootStore is also the diagnostics boundary for
    // persistence service failures.
    setPatchPersistenceIssueReporter((issue) => {
      this.diagnostics.log({
        level: issue.level,
        message: `PatchPersistence(${issue.op}): ${issue.message}`,
      });
    });
    for (const issue of getPatchPersistenceIssues()) {
      this.diagnostics.log({
        level: issue.level,
        message: `PatchPersistence(${issue.op}): ${issue.message}`,
      });
    }
    clearPatchPersistenceIssues();
    // [LAW:single-enforcer] RootStore is the diagnostics boundary for service-level
    // debug query failures emitted by DebugService.
    debugService.setIssueReporter((issue) => {
      this.diagnostics.log({
        level: issue.level,
        message: `DebugService(${issue.source}): ${issue.message}`,
      });
    });
    for (const issue of debugService.getIssues()) {
      this.diagnostics.log({
        level: issue.level,
        message: `DebugService(${issue.source}): ${issue.message}`,
      });
    }
    debugService.clearIssues();

    // Wire up EventHub to SelectionStore for selection/hover events and automatic cleanup
    this.selection.setEventHub(this.events, 'patch-0', () => this.patchRevision);

    // Wire patch mutations to emit GraphCommitted events
    this.setupGraphCommittedEmission();
  }

  /**
   * Sets up MobX reaction to emit GraphCommitted events on patch changes.
   *
   * Strategy:
   * - Track block count and edge count as a proxy for mutations
   * - When either changes, emit GraphCommitted event
   * - Increment patchRevision counter
   *
   * Note: This is a simplified implementation for Sprint 1.
   * Future improvements:
   * - Track actual mutation types (add/remove/modify)
   * - Provide accurate diffSummary
   * - Identify affectedBlockIds
   */
  private setupGraphCommittedEmission(): void {
    this.graphCommittedDisposer = reaction(
      () => {
        // [LAW:one-source-of-truth] PatchStore snapshot identity is the canonical
        // signal for any graph mutation (structure + params + port settings).
        return this.patch.patch;
      },
      () => {
        this.patchRevision++;
        this.events.emit({
          type: 'GraphCommitted',
          patchId: 'patch-0',
          patchRevision: this.patchRevision,
          reason: 'userEdit',
          diffSummary: {
            blocksAdded: 0, // TODO: Track actual changes in Sprint 2
            blocksRemoved: 0,
            edgesChanged: 0,
          },
        });
      }
    );
  }

  /**
   * Returns the current patch revision number.
   * Used by compiler and other systems for diagnostics scoping.
   */
  getPatchRevision(): number {
    return this.patchRevision;
  }

  /**
   * Execute a DiagnosticAction using the action executor.
   * Convenience method for UI components to execute diagnostic actions.
   *
   * @param action - The action to execute
   * @returns Result indicating success/failure
   */
  executeAction(action: DiagnosticAction): ActionResult {
    return executeAction(action, {
      patchStore: this.patch,
      selectionStore: this.selection,
      eventHub: this.events,
    });
  }

  /**
   * Disposes of all owned resources.
   * Should be called when the RootStore is no longer needed (e.g., hot reload, app unmount).
   */
  dispose(): void {
    // Dispose MobX reaction
    this.graphCommittedDisposer?.();
    this.graphCommittedDisposer = null;

    // Dispose PatchStore persistence
    this.patch.stopPersistence();

    // Dispose DiagnosticHub
    this.diagnosticHub.dispose();

    // Dispose SelectionStore
    this.selection.dispose();

    // Dispose DebugStore
    this.debug.dispose();

    // Dispose SettingsStore
    this.settings.dispose();

    // Dispose StepDebugStore
    this.stepDebug.dispose();

    // [LAW:single-enforcer] Release persistence reporter when RootStore is disposed.
    setPatchPersistenceIssueReporter(null);
    debugService.setIssueReporter(null);
  }
}
