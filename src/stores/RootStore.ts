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
import type { ImmutablePatch } from './PatchStore';
import { SelectionStore } from './SelectionStore';
import { ViewportStore } from './ViewportStore';
import { PlaybackStore } from './PlaybackStore';
import { DiagnosticsStore } from './DiagnosticsStore';
import { PortHighlightStore } from './PortHighlightStore';
import { DebugStore } from './DebugStore';
import { LayoutStore } from './LayoutStore';
import { CameraStore } from './CameraStore';
import { SettingsStore } from './SettingsStore';
import { FrontendResultStore } from './FrontendResultStore';
import { EventHub } from '../events/EventHub';
import { DiagnosticHub } from '../diagnostics/DiagnosticHub';
import { CompositeEditorStore } from './CompositeEditorStore';
import { DemoStore } from './DemoStore';
import { HelpStore } from './HelpStore';
import { ExpressionEditorStore } from './ExpressionEditorStore';
import { PillarPatchStore } from './PillarPatchStore';
import { GraphHistoryStore } from './GraphHistoryStore';
import { executeAction, type ActionResult } from '../diagnostics/actionExecutor';
import type { DiagnosticAction } from '../diagnostics/types';
import {
  setPatchPersistenceIssueReporter,
  getPatchPersistenceIssues,
  clearPatchPersistenceIssues,
} from '../services/PatchPersistence';
import { debugService } from '../services/DebugService';
import { loadPillarPatchFromStorage } from '../services/PillarPatchPersistence';
import type { Edge } from '../graph/Patch';

type PatchSnapshot = ImmutablePatch;

function edgeEndpointSignature(edge: Edge): string {
  return `${edge.from.blockId}:${edge.from.slotId}->${edge.to.blockId}:${edge.to.slotId}`;
}

function summarizeGraphDiff(
  previousPatch: PatchSnapshot | undefined,
  currentPatch: PatchSnapshot
): {
  diffSummary: { blocksAdded: number; blocksRemoved: number; edgesChanged: number };
  affectedBlockIds: readonly string[];
} {
  const prevBlocks: PatchSnapshot['blocks'] = previousPatch
    ? previousPatch.blocks
    : (new Map() as PatchSnapshot['blocks']);
  const currBlocks = currentPatch.blocks;

  let blocksAdded = 0;
  let blocksRemoved = 0;

  const affectedBlockIds = new Set<string>();

  for (const blockId of currBlocks.keys()) {
    if (!prevBlocks.has(blockId)) {
      blocksAdded++;
      affectedBlockIds.add(String(blockId));
    }
  }

  for (const blockId of prevBlocks.keys()) {
    if (!currBlocks.has(blockId)) {
      blocksRemoved++;
      affectedBlockIds.add(String(blockId));
    }
  }

  for (const [blockId, block] of currBlocks.entries()) {
    const previousBlock = prevBlocks.get(blockId);
    if (!previousBlock) continue;
    if (previousBlock !== block) {
      affectedBlockIds.add(String(blockId));
    }
  }

  const previousEdges: PatchSnapshot['edges'] = previousPatch ? previousPatch.edges : [];
  const prevEdgesById = new Map<string, Edge>(previousEdges.map((edge) => [edge.id, edge]));
  const currEdgesById = new Map(currentPatch.edges.map((edge) => [edge.id, edge]));

  let edgesAdded = 0;
  let edgesRemoved = 0;
  let edgesRewired = 0;

  for (const [edgeId, edge] of currEdgesById) {
    const previous = prevEdgesById.get(edgeId);
    if (!previous) {
      edgesAdded++;
      affectedBlockIds.add(edge.from.blockId);
      affectedBlockIds.add(edge.to.blockId);
      continue;
    }
    if (edgeEndpointSignature(previous) !== edgeEndpointSignature(edge)) {
      edgesRewired++;
      affectedBlockIds.add(previous.from.blockId);
      affectedBlockIds.add(previous.to.blockId);
      affectedBlockIds.add(edge.from.blockId);
      affectedBlockIds.add(edge.to.blockId);
    }
  }

  for (const [edgeId, edge] of prevEdgesById) {
    if (!currEdgesById.has(edgeId)) {
      edgesRemoved++;
      affectedBlockIds.add(edge.from.blockId);
      affectedBlockIds.add(edge.to.blockId);
    }
  }

  return {
    // [LAW:one-source-of-truth] Event diff metadata is derived from patch
    // snapshots only; no duplicate mutation counters are maintained.
    diffSummary: {
      blocksAdded,
      blocksRemoved,
      edgesChanged: edgesAdded + edgesRemoved + edgesRewired,
    },
    affectedBlockIds: Array.from(affectedBlockIds),
  };
}

export class RootStore {
  readonly patch: PatchStore;
  readonly selection: SelectionStore;
  readonly viewport: ViewportStore;
  readonly playback: PlaybackStore;
  readonly diagnostics: DiagnosticsStore;
  readonly portHighlight: PortHighlightStore;
  readonly debug: DebugStore;
  readonly layout: LayoutStore;
  readonly camera: CameraStore;
  readonly settings: SettingsStore;
  readonly events: EventHub;
  readonly compositeEditor: CompositeEditorStore;
  readonly frontend: FrontendResultStore;
  readonly demo: DemoStore;
  readonly help: HelpStore;
  readonly expressionEditor: ExpressionEditorStore;
  // The authored native (ScenePlan-path) patch — SSOT for the native graph editor.
  readonly pillarPatch: PillarPatchStore;
  // Single undo/redo authority; the active editor binds its adapter as the source.
  readonly history: GraphHistoryStore;

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
    // Create FrontendResultStore (frontend compilation results for UI)
    this.frontend = new FrontendResultStore();
    this.portHighlight = new PortHighlightStore(this.patch, this.frontend);

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

    // Single undo/redo authority (bound to the active editor's adapter at mount).
    this.history = new GraphHistoryStore();

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

    // Create DemoStore (inject PatchStore dependency)
    this.demo = new DemoStore(this.patch);

    // Create HelpStore (no dependencies)
    this.help = new HelpStore();

    // Create ExpressionEditorStore (active block for docked expression workbench)
    this.expressionEditor = new ExpressionEditorStore();

    // Create PillarPatchStore (authored native patch for the ScenePlan editor),
    // seeded from storage. [LAW:effects-at-boundaries] The load is performed once
    // at the composition root; the store itself stays seeded by pure data and
    // owns only its save reaction.
    // [LAW:no-silent-failure] A stored-but-unreadable patch is logged as an error
    //   before falling back to the default starter — never silently discarded.
    const loadedPillarPatch = loadPillarPatchFromStorage();
    if (loadedPillarPatch.kind === 'failed') {
      this.diagnostics.log({
        level: 'error',
        message: `PillarPatchPersistence(load): ${loadedPillarPatch.error}`,
      });
    }
    // `undefined` triggers the store's default starter patch (the single source
    // of the first-visit fallback). [LAW:one-source-of-truth]
    this.pillarPatch = new PillarPatchStore(
      loadedPillarPatch.kind === 'loaded' ? loadedPillarPatch.patch : undefined,
    );

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
   * - Observe immutable patch snapshot identity
   * - Derive diff summary from previous/current snapshots
   * - Increment patchRevision counter
   */
  private setupGraphCommittedEmission(): void {
    this.graphCommittedDisposer = reaction(
      () => {
        // [LAW:one-source-of-truth] PatchStore snapshot identity is the canonical
        // signal for any graph mutation (structure + params + port settings).
        return this.patch.patch;
      },
      (currentPatch, previousPatch) => {
        const { diffSummary, affectedBlockIds } = summarizeGraphDiff(previousPatch, currentPatch);
        this.patchRevision++;
        this.events.emit({
          type: 'GraphCommitted',
          patchId: 'patch-0',
          patchRevision: this.patchRevision,
          reason: 'userEdit',
          diffSummary,
          affectedBlockIds,
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
      diagnosticsStore: this.diagnostics,
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

    // Dispose PillarPatchStore persistence
    this.pillarPatch.stopPersistence();

    // Dispose undo/redo history reaction
    this.history.dispose();

    // Dispose DiagnosticHub
    this.diagnosticHub.dispose();

    // Dispose SelectionStore
    this.selection.dispose();

    // Dispose DebugStore
    this.debug.dispose();

    // Dispose SettingsStore
    this.settings.dispose();

    // [LAW:single-enforcer] Release persistence reporter when RootStore is disposed.
    setPatchPersistenceIssueReporter(null);
    debugService.setIssueReporter(null);
  }
}
